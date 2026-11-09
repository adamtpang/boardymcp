import * as z from "zod";

export const BACKEND_KINDS = ["mock", "email", "http"] as const;
export const backendKindSchema = z.enum(BACKEND_KINDS);
export type BackendKind = z.infer<typeof backendKindSchema>;

/**
 * Proposed status model. Grounded in the public double opt-in flow
 * (FAQ and ChatGPT help), not in a private Boardy response.
 */
export const INTRO_STATUSES = [
  "requested",
  "awaiting_you",
  "awaiting_them",
  "in_progress",
  "scheduled",
  "declined",
  "expired",
  "completed",
  "no_fit",
] as const;

export const introStatusSchema = z.enum(INTRO_STATUSES).describe(
  "Proposed status. requested: ask is in, no person yet. awaiting_you: a match is waiting on the user. awaiting_them: the user agreed, the other person has not. in_progress: both agreed and the intro is underway. scheduled: a meeting is booked. declined, expired, completed, or no_fit.",
);

export const decisionSchema = z.enum(["pending", "accepted", "declined"]);

export const lookingForKindSchema = z.enum([
  "customers",
  "investors",
  "hires",
  "job",
  "partners",
  "cofounder",
  "suppliers",
  "expert",
  "other",
]);

export const meetingProviderSchema = z.enum(["google_meet", "zoom", "teams", "other"]);

export const counterpartySchema = z.object({
  name: z.string(),
  headline: z.string(),
  company: z.string().optional(),
  location: z.string().optional(),
  whyThem: z.string(),
  linkedinUrl: z.string().optional(),
});

export const sharedContactSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const meetingSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string().optional(),
  url: z.string(),
  provider: meetingProviderSchema,
});

export const introSchema = z.object({
  id: z.string(),
  status: introStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  goal: z.string(),
  summary: z.string(),
  fixture: z.boolean(),
  notice: z.string(),
  counterparty: counterpartySchema.optional(),
  yourDecision: decisionSchema.optional(),
  theirDecision: decisionSchema.optional(),
  declineReason: z.string().optional(),
  proposedTimes: z.array(z.string()).optional(),
  sharedContact: sharedContactSchema.optional(),
  meeting: meetingSchema.optional(),
});

export const lookingForSchema = z.object({
  id: z.string(),
  kind: lookingForKindSchema,
  description: z.string(),
  why: z.string(),
  active: z.boolean(),
});

export const profileSchema = z.object({
  origin: z.enum(["fixture", "local_config", "api"]),
  fixture: z.boolean(),
  notice: z.string(),
  fullName: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  links: z.object({
    linkedin: z.string().optional(),
    x: z.string().optional(),
    github: z.string().optional(),
    website: z.string().optional(),
    portfolio: z.string().optional(),
  }),
  brief: z.object({
    whoTheyAre: z.string().optional(),
    asOf: z.string().optional(),
    howItsGoing: z.string().optional(),
    biggestProblem: z.string().optional(),
    whoTheyWantToMeet: z.string().optional(),
    whyNow: z.string().optional(),
    whatTheyCanOffer: z.string().optional(),
    notes: z.string().optional(),
    keepPrivate: z.string().optional(),
  }),
  lookingFor: z.array(lookingForSchema),
});

export const emailDraftSchema = z.object({
  to: z.literal("boardy@boardy.ai"),
  from: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  mailto: z.string(),
});

export const capabilitiesSchema = z.object({
  kind: backendKindSchema,
  configured: z.boolean(),
  fixture: z.boolean(),
  sendsEmail: z.boolean(),
  operations: z.object({
    getProfile: z.boolean(),
    updateLookingFor: z.boolean(),
    listIntros: z.boolean(),
    getIntro: z.boolean(),
    requestIntro: z.boolean(),
    respondToIntro: z.boolean(),
  }),
  notes: z.array(z.string()),
  docs: z.object({
    agents: z.string(),
    agentskill: z.string(),
    faq: z.string(),
    chatgptHelp: z.string(),
    proposal: z.string(),
  }),
});

export type IntroStatus = z.infer<typeof introStatusSchema>;
export type LookingForKind = z.infer<typeof lookingForKindSchema>;
export type Intro = z.infer<typeof introSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type LookingFor = z.infer<typeof lookingForSchema>;
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type Decision = z.infer<typeof decisionSchema>;

export interface LocalIdentity {
  assistantName: string;
  fullName?: string;
  email?: string;
  role?: string;
  company?: string;
  location?: string;
  linkedinUrl?: string;
  xUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
}

const httpUrl = z
  .string()
  .regex(/^https?:\/\/\S+$/, "Must be an http(s) URL");

export const lookingForInputSchema = z.object({
  kind: lookingForKindSchema.describe(
    "Kind of person, using the categories from Boardy's public pages: customers, investors, hires, a job, partners, a cofounder, suppliers, or an expert.",
  ),
  description: z
    .string()
    .min(1)
    .describe("Who they should meet, narrowed by stage, sector, role, buyer, or geography. 'Investors' alone is too broad."),
  why: z.string().min(1).describe("Why this person, and why now."),
  active: z.boolean().optional().describe("Whether this search is still active. Defaults to true."),
});

export const updateLookingForInputSchema = z.object({
  items: z
    .array(lookingForInputSchema)
    .min(1)
    .max(5)
    .describe("What the user is looking for now. Replaces the active list on backends that store one."),
  howItsGoing: z
    .string()
    .optional()
    .describe("A real result or status for the work, if you know one. Do not invent numbers."),
  biggestProblem: z.string().optional(),
  asOf: z.string().optional().describe("Month and year for the status, such as November 2026."),
});

export const requestIntroInputSchema = z.object({
  userFullName: z.string().min(1).optional().describe("The user's full name. Falls back to BOARDY_USER_NAME."),
  assistantName: z
    .string()
    .min(1)
    .optional()
    .describe("Name of the assistant writing the email, such as Claude or Cursor. Falls back to BOARDY_ASSISTANT_NAME."),
  fromEmail: z.string().email().optional().describe("Mailbox the email would be sent from. Must be the user's own address."),
  whoTheyAre: z.string().min(1).describe("Role, company or project, and what they do, in plain language."),
  asOf: z.string().min(1).describe("Month and year of the status, such as November 2026."),
  howItsGoing: z
    .string()
    .min(1)
    .describe("One real result or status. Stage can be zero: 'no paying customers yet' counts. Do not invent numbers."),
  biggestProblem: z.string().optional().describe("The hardest thing in the work right now, if you actually know it."),
  situationFacts: z
    .array(z.string().min(1))
    .max(8)
    .optional()
    .describe("Other dated facts that change who would be a good fit. Omit anything you cannot support."),
  whoToMeet: z
    .string()
    .min(1)
    .describe("Kind of person, narrowed enough to search on. Include stage, sector, role, buyer, or geography."),
  whyMeet: z.string().min(1).describe("Why that person, and what the conversation would be about."),
  whyNow: z.string().optional().describe("The trigger, deadline, or what they already tried."),
  whatTheyCanOffer: z
    .string()
    .min(1)
    .describe("Why the other person would want the meeting. Boardy introduces people only when both agree."),
  notes: z
    .string()
    .optional()
    .describe("Tools their work runs on, and anything else that would help a match. Leave out confidential terms and pricing."),
  keepPrivate: z
    .string()
    .optional()
    .describe("Facts Boardy should know but never repeat in an introduction. Figures are shareable unless listed here."),
  location: z.string().optional().describe("City, or time zone if they work remotely."),
  linkedinUrl: z.string().regex(/^https?:\/\/\S+$/, "Must be an http(s) URL").describe(
    "The user's LinkedIn URL. Required. Boardy's guide says he cannot search without it, and a wrong link can match a different person.",
  ),
  xUrl: httpUrl.optional(),
  githubUrl: httpUrl.optional(),
  portfolioUrl: httpUrl.optional(),
  websiteUrl: httpUrl.optional(),
  alreadyKnowsBoardy: z
    .boolean()
    .optional()
    .describe("Set true for a short update instead of a first brief. Use this only when the user already talks to Boardy."),
  clientRequestId: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe("Caller-generated id. The mock and the reference API return the same request when this repeats."),
  send: z
    .boolean()
    .optional()
    .describe("Ask the email backend to send. Default false. Mock never sends. HTTP posts the brief to the API instead of sending mail."),
  userApprovedExactText: z
    .boolean()
    .optional()
    .describe("True only after the user approved the exact body. Required with send."),
  approvedBody: z
    .string()
    .optional()
    .describe("The exact body the user approved. Required with send, and it must match the drafted body character for character."),
});

export const respondInputSchema = z.object({
  introId: z.string().min(1).describe("Introduction id from list_intros or get_intro. The email protocol has no ids; pass one only on mock or http."),
  decision: z
    .enum(["accept", "decline", "propose_times"])
    .describe("accept, decline, or propose_times. Decline matches the ChatGPT help text: a decline needs a reason."),
  reason: z.string().optional().describe("Required when decision is decline. Why the user is passing."),
  times: z
    .array(z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Must be a date-time"))
    .min(1)
    .max(5)
    .optional()
    .describe("One to five date-times the user can meet. Required when decision is propose_times."),
  userFullName: z.string().optional(),
  assistantName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  note: z.string().optional().describe("Optional sentence to include in a drafted reply. Do not invent commitments."),
});

export const listIntrosInputSchema = z.object({
  status: introStatusSchema.optional().describe("Filter to one proposed status."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum introductions to return. Defaults to 20."),
  cursor: z.string().optional().describe("Pagination cursor from a previous page."),
});

export type RequestIntroArgs = z.infer<typeof requestIntroInputSchema>;
export type UpdateLookingForArgs = z.infer<typeof updateLookingForInputSchema>;
export type RespondArgs = z.infer<typeof respondInputSchema>;
export type ListIntrosArgs = z.infer<typeof listIntrosInputSchema>;

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}
