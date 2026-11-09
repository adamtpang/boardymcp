import type {
  Capabilities,
  EmailDraft,
  Intro,
  IntroStatus,
  Page,
  Profile,
  UpdateLookingForArgs,
} from "../domain.js";

export interface RequestRecord {
  draft: EmailDraft;
  clientRequestId?: string;
  goal: string;
  send: boolean;
  userApprovedExactText?: boolean;
  approvedBody?: string;
}

export interface RespondRecord {
  introId: string;
  decision: "accept" | "decline" | "propose_times";
  reason?: string;
  times?: string[];
}

export interface BoardyBackend {
  readonly kind: Capabilities["kind"];
  capabilities(): Capabilities;
  getProfile(): Promise<Profile>;
  updateLookingFor(input: UpdateLookingForArgs): Promise<Profile>;
  listIntros(filter: { status?: IntroStatus; limit?: number; cursor?: string }): Promise<Page<Intro>>;
  getIntro(id: string): Promise<Intro>;
  requestIntro(input: RequestRecord & { send: boolean }): Promise<{ intro?: Intro; emailSent: boolean; messageId?: string }>;
  respondToIntro(input: RespondRecord): Promise<Intro>;
}
