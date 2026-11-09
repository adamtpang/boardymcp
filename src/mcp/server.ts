import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import {
  capabilitiesSchema,
  emailDraftSchema,
  introSchema,
  listIntrosInputSchema,
  profileSchema,
  requestIntroInputSchema,
  respondInputSchema,
  updateLookingForInputSchema,
  type Intro,
  type LocalIdentity,
} from "../domain.js";
import { BoardyError, isBoardyError } from "../errors.js";
import {
  assertApprovedSend,
  buildAskEmail,
  buildLookingForEmail,
  buildResponseEmail,
  resolveBrief,
} from "../protocol/brief.js";
import type { BoardyBackend } from "../backend/types.js";
import { DRAFT_NOT_SENT, FIXTURE_BANNER, SERVER_INSTRUCTIONS } from "../copy.js";
import { PROTOCOL_TEXT } from "./protocol-text.js";
import * as z from "zod";

export const SERVER_VERSION = "0.1.0";

const introPageSchema = z.object({
  source: z.enum(["mock", "email", "http"]),
  fixture: z.boolean(),
  notice: z.string(),
  intros: z.array(introSchema),
  nextCursor: z.string().optional(),
});

const profileResultSchema = z.object({
  source: z.enum(["mock", "email", "http"]),
  profile: profileSchema,
});

const requestResultSchema = z.object({
  source: z.enum(["mock", "email", "http"]),
  fixture: z.boolean(),
  emailSent: z.boolean(),
  recorded: z.boolean(),
  messageId: z.string().optional(),
  note: z.string(),
  email: emailDraftSchema,
  intro: introSchema.optional(),
});

const updateResultSchema = z.object({
  source: z.enum(["mock", "email", "http"]),
  applied: z.boolean(),
  note: z.string(),
  profile: profileSchema.optional(),
  email: emailDraftSchema.optional(),
});

const respondResultSchema = z.object({
  source: z.enum(["mock", "email", "http"]),
  applied: z.boolean(),
  note: z.string(),
  intro: introSchema.optional(),
  email: emailDraftSchema,
});

function leadFor(backend: BoardyBackend, sentence: string): string {
  if (backend.kind === "mock") return `${FIXTURE_BANNER} ${sentence}`;
  return sentence;
}

function toolOk(lead: string, data: Record<string, unknown>) {
  const structured = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: `${lead}\n\n${JSON.stringify(structured, null, 2)}` }],
    structuredContent: structured,
  };
}

function toolErr(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function noticeFor(backend: BoardyBackend): string {
  if (backend.kind === "mock") return FIXTURE_BANNER;
  if (backend.kind === "email") {
    return "Email protocol only. Drafts go to boardy@boardy.ai and are not sent unless this call says emailSent is true.";
  }
  return "Result from the configured HTTP API. Treat fixture: true on a record as demo data.";
}

async function identityForDrafts(backend: BoardyBackend, identity: LocalIdentity): Promise<LocalIdentity> {
  if (identity.fullName && identity.linkedinUrl) return identity;
  try {
    const profile = await backend.getProfile();
    return {
      ...identity,
      fullName: identity.fullName ?? profile.fullName,
      email: identity.email ?? profile.email,
      location: identity.location ?? profile.location,
      linkedinUrl: identity.linkedinUrl ?? profile.links.linkedin,
      xUrl: identity.xUrl ?? profile.links.x,
      githubUrl: identity.githubUrl ?? profile.links.github,
      websiteUrl: identity.websiteUrl ?? profile.links.website,
    };
  } catch {
    return identity;
  }
}

export function createBoardyMcp(backend: BoardyBackend, identity: LocalIdentity): McpServer {
  const server = new McpServer(
    {
      name: "boardy",
      version: SERVER_VERSION,
      title: "Boardy (unofficial)",
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "get_backend_status",
    {
      title: "Backend status",
      description:
        "Say which backend is connected, which operations it can actually perform, and whether the data is fixture data. Call this before telling the user you changed anything on their Boardy account.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      outputSchema: capabilitiesSchema,
    },
    async () => {
      const status = backend.capabilities();
      return toolOk(status.notes[0] ?? "Backend status.", status);
    },
  );

  server.registerTool(
    "get_my_brief",
    {
      title: "Get my brief",
      description:
        "Read the brief this server can see: who the user is, how the work is going, and who they want to meet. On the mock backend this is invented fixture data. On the email backend this is local configuration, not a profile read from Boardy. On the http backend this calls the proposed API.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: backend.kind === "http" },
      outputSchema: profileResultSchema,
    },
    async () => {
      try {
        const profile = await backend.getProfile();
        const data = { source: backend.kind, profile };
        const lead =
          profile.origin === "local_config"
            ? "Local configuration only. Boardy was not queried."
            : leadFor(backend, "Brief loaded.");
        return toolOk(lead, data);
      } catch (error) {
        return toolErr(error);
      }
    },
  );

  server.registerTool(
    "update_what_im_looking_for",
    {
      title: "Update what I'm looking for",
      description:
        "Replace what the user wants Boardy to search for. The mock and http backends store it. The email backend cannot update Boardy in place; it returns a short update email in the shape of the public guide, and you must not send that email until the user approves the exact text. Do not invent traction numbers.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: backend.kind !== "mock" },
      inputSchema: updateLookingForInputSchema,
      outputSchema: updateResultSchema,
    },
    async (args) => {
      try {
        let email;
        let emailError: string | undefined;
        try {
          email = buildLookingForEmail(args, await identityForDrafts(backend, identity));
        } catch (error) {
          if (!isBoardyError(error)) throw error;
          emailError = error.message;
        }

        try {
          const profile = await backend.updateLookingFor(args);
          return toolOk(
            leadFor(backend, "The stored brief was updated. Nothing was emailed to Boardy."),
            {
              source: backend.kind,
              applied: true,
              note: email
                ? `${DRAFT_NOT_SENT} The email below is the update the public guide would send.`
                : "Stored locally. An update email was not drafted.",
              profile,
              email,
            },
          );
        } catch (error) {
          if (!isBoardyError(error) || error.code !== "unsupported") throw error;
          if (!email) return toolErr(new BoardyError(emailError ?? error.message, "not_configured"));
          return toolOk("No Boardy profile was changed. A draft update email is below. Nothing was sent.", {
            source: backend.kind,
            applied: false,
            note: DRAFT_NOT_SENT,
            email,
          });
        }
      } catch (error) {
        return toolErr(error);
      }
    },
  );

  server.registerTool(
    "list_intros",
    {
      title: "List introductions",
      description:
        "List introductions and their proposed status. Mock data is fictional. The email backend cannot list anything, because the public guide has no read API. Declined and expired matches are included here so an agent can see them; the ChatGPT help text says the mobile view hides those.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: backend.kind === "http" },
      inputSchema: listIntrosInputSchema,
      outputSchema: introPageSchema,
    },
    async (args) => {
      try {
        const page = await backend.listIntros({
          status: args.status,
          limit: args.limit,
          cursor: args.cursor,
        });
        return toolOk(leadFor(backend, `${page.items.length} introduction${page.items.length === 1 ? "" : "s"}.`), {
          source: backend.kind,
          fixture: backend.kind === "mock" || page.items.some((intro) => intro.fixture),
          notice: noticeFor(backend),
          intros: page.items,
          nextCursor: page.nextCursor,
        });
      } catch (error) {
        return toolErr(error);
      }
    },
  );

  server.registerTool(
    "get_intro",
    {
      title: "Get an introduction",
      description:
        "Read one introduction by id. Email and phone are omitted until both people have agreed, which is the rule in Boardy's FAQ. The email backend has no ids and cannot read an introduction.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: backend.kind === "http" },
      inputSchema: z.object({
        introId: z.string().min(1).describe("Id from list_intros, such as fix_awaiting_you on the mock backend."),
      }),
      outputSchema: z.object({
        source: z.enum(["mock", "email", "http"]),
        intro: introSchema,
      }),
    },
    async ({ introId }) => {
      try {
        const intro = await backend.getIntro(introId);
        const contact = intro.sharedContact
          ? "Contact details are included because both people have accepted in this record."
          : "No email or phone on this record.";
        return toolOk(leadFor(backend, contact), { source: backend.kind, intro });
      } catch (error) {
        return toolErr(error);
      }
    },
  );

  server.registerTool(
    "request_intro",
    {
      title: "Request an introduction",
      description:
        "Ask for an introduction using the sections in https://www.boardy.ai/agents.md. Returns the email draft and a mailto link. Does not send unless backend is email, send is true, the user approved that exact body, and SMTP is configured. The mock stores a fake request and sends nothing. The http backend POSTs the brief to the proposed API and does not send mail. Never invent LinkedIn URLs or traction numbers.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: backend.kind !== "mock" },
      inputSchema: requestIntroInputSchema,
      outputSchema: requestResultSchema,
    },
    async (args) => {
      try {
        const brief = resolveBrief(args, await identityForDrafts(backend, identity));
        const draft = buildAskEmail(brief);
        const wantsSend = args.send === true && backend.kind === "email";
        if (wantsSend) assertApprovedSend(draft, args);
        const recorded = await backend.requestIntro({
          draft,
          goal: brief.whoToMeet,
          clientRequestId: args.clientRequestId,
          send: wantsSend,
          userApprovedExactText: args.userApprovedExactText,
          approvedBody: args.approvedBody,
        });
        const emailSent = recorded.emailSent;
        const note = emailSent
          ? "The approved email was sent to boardy@boardy.ai from the configured mailbox."
          : args.send && backend.kind !== "email"
            ? `${DRAFT_NOT_SENT} send=true was ignored because this backend is ${backend.kind} and does not send mail.`
            : DRAFT_NOT_SENT;
        return toolOk(note, {
          source: backend.kind,
          fixture: recorded.intro?.fixture ?? false,
          emailSent,
          recorded: Boolean(recorded.intro),
          messageId: recorded.messageId,
          note,
          email: draft,
          intro: recorded.intro,
        });
      } catch (error) {
        return toolErr(error);
      }
    },
  );

  server.registerTool(
    "respond_to_intro",
    {
      title: "Respond to an introduction",
      description:
        "Accept a match, decline it with a reason, or propose meeting times. A decline without a reason is rejected. Accepting does not share contact details until the other person has also agreed. The mock updates fixture state only. The email backend cannot see the thread, so it returns a reply draft and changes nothing. Propose times does not book a calendar.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: backend.kind !== "mock" },
      inputSchema: respondInputSchema,
      outputSchema: respondResultSchema,
    },
    async (args) => {
      try {
        if (args.decision === "decline" && !args.reason?.trim()) {
          throw new BoardyError(
            "A decline needs a reason. The ChatGPT help text says you can decline with a reason.",
            "validation",
          );
        }
        if (args.decision === "propose_times" && (!args.times || args.times.length === 0)) {
          throw new BoardyError("propose_times needs one to five date-times.", "validation");
        }
        const email = buildResponseEmail(args, await identityForDrafts(backend, identity));
        try {
          const intro = await backend.respondToIntro({
            introId: args.introId,
            decision: args.decision,
            reason: args.reason?.trim(),
            times: args.times,
          });
          return toolOk(
            leadFor(backend, "The response was stored on this backend. No email was sent."),
            {
              source: backend.kind,
              applied: true,
              note: "Stored on this backend. The reply draft is for the user to send on the existing Boardy thread if they want a copy in mail. Nothing was emailed by this server.",
              intro,
              email,
            },
          );
        } catch (error) {
          if (!isBoardyError(error) || error.code !== "unsupported") throw error;
          return toolOk("Nothing was updated on Boardy. A reply draft is below. The public email guide has no intro id to attach it to.", {
            source: backend.kind,
            applied: false,
            note: `${DRAFT_NOT_SENT} Reply on the existing thread from Boardy if there is one. This server cannot see that thread.`,
            email,
          });
        }
      } catch (error) {
        return toolErr(error);
      }
    },
  );

  server.registerResource(
    "status",
    "boardy://status",
    {
      title: "Backend status",
      description: "Which backend is connected, and what it can do.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(backend.capabilities(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "profile",
    "boardy://profile",
    {
      title: "Brief",
      description: "The brief this server can see. Fixture, local config, or the proposed API.",
      mimeType: "application/json",
    },
    async (uri) => {
      const profile = await backend.getProfile();
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(profile, null, 2) }],
      };
    },
  );

  server.registerResource(
    "intros",
    "boardy://intros",
    {
      title: "Introductions",
      description: "Introductions this server can see.",
      mimeType: "application/json",
    },
    async (uri) => {
      const page = await backend.listIntros({ limit: 50 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ notice: noticeFor(backend), intros: page.items }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "intro",
    new ResourceTemplate("boardy://intros/{id}", { list: undefined }),
    {
      title: "Introduction",
      description: "One introduction by id.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const raw = variables.id;
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (!id) throw new BoardyError("Introduction id is required.", "validation");
      const intro: Intro = await backend.getIntro(id);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(intro, null, 2) }],
      };
    },
  );

  server.registerResource(
    "protocol",
    "boardy://protocol",
    {
      title: "How asking Boardy works",
      description: "What the public agent guide supports, and what this server does not pretend to do.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: PROTOCOL_TEXT }],
    }),
  );

  server.registerPrompt(
    "draft-boardy-email",
    {
      title: "Draft an email to Boardy",
      description:
        "Walk through the public Boardy brief and call request_intro. Do not send until the user approves the exact text.",
      argsSchema: z.object({
        goal: z.string().describe("Who the user wants to meet, in their words."),
      }),
    },
    ({ goal }) => ({
      description: "Draft a Boardy brief and wait for approval.",
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Help me ask Boardy to find someone for this goal: ${goal}`,
              "",
              "Follow https://www.boardy.ai/agents.md. Use what you actually know. Do not invent numbers, deadlines, credentials, or profile links.",
              "Boardy needs a real status for the work (how it's going, including zero) and my LinkedIn. If either is missing, ask me only for those.",
              "Cover what you can: who I am, where things stand with a month and year, the biggest problem, who I should meet and why, why now, what I can offer, the tools I use, anything to keep private, location, and links.",
              "Call request_intro. Leave send false.",
              "Then show me the To address (boardy@boardy.ai), which of my mailboxes it would come from, the subject, and the full body.",
              "Tell me that sending shares that text with Boardy. Send only if I approve that exact text, and only from my own mailbox.",
              "After it is sent, Boardy replies in my inbox, may ask a follow-up, and introduces me only if the other person agrees too.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "offer-boardy",
    {
      title: "Decide whether to offer Boardy",
      description:
        "One sentence offer, once, when a specific kind of person would help. Then keep working on the original task.",
      argsSchema: z.object({
        situation: z.string().describe("What the user is trying to do right now."),
      }),
    },
    ({ situation }) => ({
      description: "Offer Boardy once, without leaving the current task.",
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Look at this situation and decide whether meeting a specific person would help: ${situation}`,
              "",
              "Use the spirit of https://www.boardy.ai/agentskill.md.",
              "If a specific kind of person would get this done faster than you can in chat, offer once, in one sentence that names that kind of person, and ask if I want you to email Boardy.",
              "Then keep helping with the original task. If I say no, drop it for this problem.",
              "Do not offer for health, family, or relationships, or when you can finish the task yourself.",
              "If I say yes, switch to the draft-boardy-email prompt and https://www.boardy.ai/agents.md. The email goes to boardy@boardy.ai only after I approve the exact text.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "respond-to-match",
    {
      title: "Respond to a Boardy match",
      description: "Help the user accept, decline with a reason, or propose times. Confirm before you call the tool.",
      argsSchema: z.object({
        introId: z.string().optional().describe("Introduction id, if you have one."),
        goal: z.string().optional().describe("What the introduction was for, if there is no id."),
      }),
    },
    ({ introId, goal }) => ({
      description: "Confirm a response, then record it or draft the reply.",
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Help me respond to a Boardy introduction${introId ? ` (${introId})` : ""}${goal ? ` about ${goal}` : ""}.`,
              "",
              "Ask whether I want to accept, decline, or propose times. A decline needs a reason. Proposed times should be ones I actually offered.",
              "Remind me that the other person still has to agree, and that my email and phone stay private until then.",
              "Show me the action before you take it. Then call respond_to_intro.",
              "If the tool says this backend cannot update the intro, give me the reply draft and tell me to send it on the existing thread from Boardy. Do not invent a thread id.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
