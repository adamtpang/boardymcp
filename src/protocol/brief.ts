import type { EmailDraft, LocalIdentity, RequestIntroArgs, RespondArgs, UpdateLookingForArgs } from "../domain.js";
import { BoardyError } from "../errors.js";
import { BOARDY_EMAIL, toDraft } from "./mailto.js";

export interface ResolvedBrief {
  assistantName: string;
  fullName: string;
  fromEmail: string | null;
  whoTheyAre: string;
  asOf: string;
  howItsGoing: string;
  biggestProblem?: string;
  situationFacts: string[];
  whoToMeet: string;
  whyMeet: string;
  whyNow?: string;
  whatTheyCanOffer: string;
  notes?: string;
  keepPrivate?: string;
  location?: string;
  linkedinUrl: string;
  xUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  websiteUrl?: string;
  alreadyKnowsBoardy: boolean;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clip(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}...`;
}

export function resolveBrief(args: RequestIntroArgs, identity: LocalIdentity): ResolvedBrief {
  const fullName = clean(args.userFullName) ?? clean(identity.fullName);
  const linkedinUrl = clean(args.linkedinUrl) ?? clean(identity.linkedinUrl);
  if (!fullName) {
    throw new BoardyError(
      "A full name is required. Pass userFullName or set BOARDY_USER_NAME. Do not guess one.",
      "validation",
    );
  }
  if (!linkedinUrl) {
    throw new BoardyError(
      "A LinkedIn URL is required. Boardy's public guide says he cannot search without it. Pass linkedinUrl or set BOARDY_USER_LINKEDIN. Leave it blank rather than guessing a profile.",
      "validation",
    );
  }

  return {
    assistantName: clean(args.assistantName) ?? identity.assistantName,
    fullName,
    fromEmail: clean(args.fromEmail) ?? clean(identity.email) ?? null,
    whoTheyAre: args.whoTheyAre.trim(),
    asOf: args.asOf.trim(),
    howItsGoing: args.howItsGoing.trim(),
    biggestProblem: clean(args.biggestProblem),
    situationFacts: (args.situationFacts ?? []).map((fact) => fact.trim()).filter(Boolean),
    whoToMeet: args.whoToMeet.trim(),
    whyMeet: args.whyMeet.trim(),
    whyNow: clean(args.whyNow),
    whatTheyCanOffer: args.whatTheyCanOffer.trim(),
    notes: clean(args.notes),
    keepPrivate: clean(args.keepPrivate),
    location: clean(args.location) ?? clean(identity.location),
    linkedinUrl,
    xUrl: clean(args.xUrl) ?? clean(identity.xUrl),
    githubUrl: clean(args.githubUrl) ?? clean(identity.githubUrl),
    portfolioUrl: clean(args.portfolioUrl),
    websiteUrl: clean(args.websiteUrl) ?? clean(identity.websiteUrl),
    alreadyKnowsBoardy: args.alreadyKnowsBoardy === true,
  };
}

function linkLines(brief: ResolvedBrief): string[] {
  const lines = [`LinkedIn: ${brief.linkedinUrl}`];
  if (brief.xUrl) lines.push(`X: ${brief.xUrl}`);
  if (brief.githubUrl) lines.push(`GitHub: ${brief.githubUrl}`);
  if (brief.portfolioUrl) lines.push(`Portfolio: ${brief.portfolioUrl}`);
  if (brief.websiteUrl) lines.push(`Website: ${brief.websiteUrl}`);
  return lines;
}

function signoff(brief: ResolvedBrief): string {
  return `${brief.assistantName}, on behalf of ${brief.fullName}`;
}

/**
 * Section headings follow the public brief at https://www.boardy.ai/agents.md
 * so a person (or Boardy) can file each part. The words inside come from the caller.
 */
export function buildAskEmail(brief: ResolvedBrief): EmailDraft {
  if (brief.alreadyKnowsBoardy) return buildUpdateFromBrief(brief);

  const standing = [
    `- How it's going: ${brief.howItsGoing}`,
    brief.biggestProblem ? `- Biggest problem: ${brief.biggestProblem}` : undefined,
    ...brief.situationFacts.map((fact) => `- ${fact}`),
  ].filter((line): line is string => Boolean(line));

  const sections = [
    `Hi Boardy,`,
    ``,
    `I'm ${brief.assistantName}, writing on behalf of ${brief.fullName}. ${brief.whoTheyAre}`,
    ``,
    `Who they are`,
    brief.whoTheyAre,
    ``,
    `Where things stand (as of ${brief.asOf})`,
    ...standing,
    ``,
    `Who they'd like to meet`,
    `${brief.whoToMeet} ${brief.whyMeet}`.trim(),
    brief.whyNow ? `Why now: ${brief.whyNow}` : undefined,
    ``,
    `What they can offer`,
    brief.whatTheyCanOffer,
  ].filter((line): line is string => line !== undefined);

  if (brief.notes) {
    sections.push(``, `Notes`, brief.notes);
  }
  if (brief.keepPrivate) {
    sections.push(``, `Please keep private`, brief.keepPrivate);
  }
  if (brief.location) {
    sections.push(``, `Location: ${brief.location}`);
  } else {
    sections.push(``);
  }
  sections.push(...linkLines(brief), ``, `Could you find people who fit?`, ``, signoff(brief));

  return toDraft({
    from: brief.fromEmail,
    subject: `Ask Boardy: ${clip(brief.whoToMeet, 80)}`,
    body: sections.join("\n"),
  });
}

function buildUpdateFromBrief(brief: ResolvedBrief): EmailDraft {
  const lines = [
    `Hi Boardy,`,
    ``,
    `I'm ${brief.assistantName}, writing on behalf of ${brief.fullName}. This is an update since they last spoke with you.`,
    ``,
    `What has changed`,
    brief.howItsGoing,
    ``,
    `Who they'd like to meet`,
    `${brief.whoToMeet} ${brief.whyMeet}`.trim(),
  ];
  if (brief.whyNow) lines.push(`Why now: ${brief.whyNow}`);
  if (brief.biggestProblem) {
    lines.push(``, `Biggest problem`, brief.biggestProblem);
  }
  lines.push(``, ...linkLines(brief).filter((line) => line.startsWith("LinkedIn:") || line.startsWith("X:")), ``, signoff(brief));
  return toDraft({
    from: brief.fromEmail,
    subject: `Update for Boardy: ${clip(brief.whoToMeet, 80)}`,
    body: lines.join("\n"),
  });
}

export function buildLookingForEmail(args: UpdateLookingForArgs, identity: LocalIdentity): EmailDraft {
  const fullName = clean(identity.fullName);
  if (!fullName) {
    throw new BoardyError(
      "BOARDY_USER_NAME is required to draft an update email. The email backend does not know who the user is until you set it.",
      "not_configured",
    );
  }
  const linkedin = clean(identity.linkedinUrl);
  if (!linkedin) {
    throw new BoardyError(
      "BOARDY_USER_LINKEDIN is required to draft an update email. A short update still ends with the LinkedIn line so Boardy can recognize the sender.",
      "not_configured",
    );
  }

  const asks = args.items
    .map((item, index) => `${index + 1}. ${item.description} Why: ${item.why}`)
    .join("\n");
  const lines = [
    `Hi Boardy,`,
    ``,
    `I'm ${identity.assistantName}, writing on behalf of ${fullName}. This is an update to what they are looking for.`,
    ``,
    `What has changed`,
    clean(args.howItsGoing) ?? "They updated who they want to meet. No new result was included.",
    ``,
    `Who they'd like to meet`,
    asks,
  ];
  const biggestProblem = clean(args.biggestProblem);
  if (biggestProblem) {
    lines.push(``, `Biggest problem`, biggestProblem);
  }
  lines.push(``, `LinkedIn: ${linkedin}`);
  if (identity.xUrl) lines.push(`X: ${identity.xUrl}`);
  lines.push(``, `${identity.assistantName}, on behalf of ${fullName}`);

  return toDraft({
    from: identity.email ?? null,
    subject: `Update for Boardy: ${clip(args.items[0]?.description ?? "what they're looking for", 80)}`,
    body: lines.join("\n"),
  });
}

export function buildResponseEmail(args: RespondArgs, identity: LocalIdentity, goal?: string): EmailDraft {
  const fullName = clean(args.userFullName) ?? clean(identity.fullName) ?? "the user";
  const assistant = clean(args.assistantName) ?? identity.assistantName;
  const from = clean(args.fromEmail) ?? identity.email ?? null;
  const decisionLine =
    args.decision === "accept"
      ? "They accept this introduction."
      : args.decision === "decline"
        ? "They decline this introduction."
        : "They want to propose times.";

  const lines = [
    `Hi Boardy,`,
    ``,
    `I'm ${assistant}, writing on behalf of ${fullName}.`,
    ``,
    `About introduction ${args.introId}${goal ? ` (${goal})` : ""}: ${decisionLine}`,
  ];
  if (args.decision === "decline") {
    lines.push(`Reason: ${args.reason?.trim() || "(missing reason)"}`);
  }
  if (args.decision === "propose_times" && args.times) {
    lines.push(`Times they can meet:`);
    for (const time of args.times) lines.push(`- ${time}`);
  }
  const note = clean(args.note);
  if (note) lines.push(``, note);
  lines.push(
    ``,
    `Please handle this on the existing thread if there is one. This draft has no Message-ID, because the public email guide does not provide a way to look the thread up.`,
    ``,
    `${assistant}, on behalf of ${fullName}`,
  );

  return toDraft({
    from,
    subject: `Re: introduction ${args.introId}`,
    body: lines.join("\n"),
  });
}

export function bodiesMatch(drafted: string, approved: string): boolean {
  return drafted.replace(/\r\n/g, "\n") === approved.replace(/\r\n/g, "\n");
}

export function assertApprovedSend(draft: EmailDraft, args: { userApprovedExactText?: boolean; approvedBody?: string; fromEmail?: string }): void {
  if (args.userApprovedExactText !== true || !args.approvedBody) {
    throw new BoardyError(
      "Refusing to send. The public guide requires the user to approve the exact text first. Call again with send=true, userApprovedExactText=true, and approvedBody set to the drafted body. Nothing was sent.",
      "approval_required",
    );
  }
  if (!bodiesMatch(draft.body, args.approvedBody)) {
    throw new BoardyError(
      "Refusing to send. approvedBody does not match the drafted body. Show the user the latest draft and ask them to approve that text. Nothing was sent.",
      "approval_required",
    );
  }
  if (!draft.from) {
    throw new BoardyError(
      "Refusing to send. Boardy recognizes people by the address the email comes from, and no From address is configured. Set fromEmail or BOARDY_USER_EMAIL. Nothing was sent.",
      "not_configured",
    );
  }
  if (draft.to !== BOARDY_EMAIL) {
    throw new BoardyError("Refusing to send. The only recipient this server will use is boardy@boardy.ai.", "validation");
  }
}
