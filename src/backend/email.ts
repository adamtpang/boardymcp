import { DOCS, EMAIL_UNSUPPORTED, LOCAL_CONFIG_BANNER } from "../copy.js";
import type { LocalIdentity, Profile, UpdateLookingForArgs } from "../domain.js";
import { BoardyError } from "../errors.js";
import { assertApprovedSend } from "../protocol/brief.js";
import { BOARDY_EMAIL } from "../protocol/mailto.js";
import type { BoardyBackend, RequestRecord } from "./types.js";

export interface OutboundMail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface MailSender {
  send(message: OutboundMail): Promise<{ messageId: string }>;
}

function localProfile(identity: LocalIdentity): Profile {
  if (!identity.fullName) {
    throw new BoardyError(
      "No local name is configured. Set BOARDY_USER_NAME. This backend cannot read a profile from Boardy.",
      "not_configured",
    );
  }
  return {
    origin: "local_config",
    fixture: false,
    notice: LOCAL_CONFIG_BANNER,
    fullName: identity.fullName,
    email: identity.email,
    role: identity.role,
    company: identity.company,
    location: identity.location,
    links: {
      linkedin: identity.linkedinUrl,
      x: identity.xUrl,
      github: identity.githubUrl,
      website: identity.websiteUrl,
    },
    brief: {},
    lookingFor: [],
  };
}

export function createEmailBackend(options: { identity: LocalIdentity; mail?: MailSender }): BoardyBackend {
  const unsupported = () =>
    new BoardyError(EMAIL_UNSUPPORTED, "unsupported", 501);

  return {
    kind: "email",
    capabilities() {
      return {
        kind: "email",
        configured: Boolean(options.identity.fullName && options.identity.linkedinUrl),
        fixture: false,
        sendsEmail: Boolean(options.mail),
        operations: {
          getProfile: true,
          updateLookingFor: false,
          listIntros: false,
          getIntro: false,
          requestIntro: true,
          respondToIntro: false,
        },
        notes: [
          "Drafts follow the public brief at https://www.boardy.ai/agents.md. The recipient is boardy@boardy.ai.",
          "get_my_brief on this backend is local configuration, not a profile read from Boardy.",
          "Mail is sent only when the tool call sets send=true, the user approved that exact body, and SMTP is configured.",
          "This backend does not read an inbox. The public guide says an assistant who can already read the user's mail should point out messages from boardy@boardy.ai. That stays in the user's mail client.",
          EMAIL_UNSUPPORTED,
        ],
        docs: {
          agents: DOCS.agents,
          agentskill: DOCS.agentskill,
          faq: DOCS.faq,
          chatgptHelp: DOCS.chatgptHelp,
          proposal: "spec/openapi.yaml",
        },
      };
    },
    async getProfile() {
      return localProfile(options.identity);
    },
    async updateLookingFor(_input: UpdateLookingForArgs) {
      throw unsupported();
    },
    async listIntros() {
      throw unsupported();
    },
    async getIntro() {
      throw unsupported();
    },
    async requestIntro(input: RequestRecord) {
      if (!input.send) return { emailSent: false };
      assertApprovedSend(input.draft, {
        userApprovedExactText: input.userApprovedExactText,
        approvedBody: input.approvedBody,
        fromEmail: input.draft.from ?? undefined,
      });
      if (!options.mail) {
        throw new BoardyError(
          "SMTP is not configured, so nothing was sent. Use the mailto link, or set BOARDY_SMTP_HOST, BOARDY_SMTP_PORT, and BOARDY_SMTP_FROM. Send from the user's own mailbox.",
          "not_configured",
        );
      }
      if (!input.draft.from) {
        throw new BoardyError("Refusing to send without a From address.", "not_configured");
      }
      const result = await options.mail.send({
        to: BOARDY_EMAIL,
        from: input.draft.from,
        subject: input.draft.subject,
        text: input.draft.body,
      });
      return { emailSent: true, messageId: result.messageId };
    },
    async respondToIntro() {
      throw unsupported();
    },
  };
}
