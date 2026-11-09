import { DOCS, FIXTURE_BANNER } from "../copy.js";
import type { Intro, IntroStatus, UpdateLookingForArgs } from "../domain.js";
import { BoardyError } from "../errors.js";
import { fixtureIntros, fixtureProfile, FIXTURE_NOTICE } from "./fixtures.js";
import { paginate } from "./page.js";
import type { BoardyBackend, RequestRecord, RespondRecord } from "./types.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function bothAgreed(intro: Intro): boolean {
  return intro.yourDecision === "accepted" && intro.theirDecision === "accepted";
}

export function createMockBackend(now: () => Date = () => new Date("2026-11-09T18:00:00.000Z")): BoardyBackend {
  let profile = fixtureProfile();
  const intros = new Map<string, Intro>(fixtureIntros().map((intro) => [intro.id, intro]));
  const byClientId = new Map<string, string>();
  let sequence = 0;

  function requireIntro(id: string): Intro {
    const intro = intros.get(id);
    if (!intro) {
      throw new BoardyError(`No fixture introduction with id ${id}.`, "not_found", 404);
    }
    return intro;
  }

  return {
    kind: "mock",
    capabilities() {
      return {
        kind: "mock",
        configured: true,
        fixture: true,
        sendsEmail: false,
        operations: {
          getProfile: true,
          updateLookingFor: true,
          listIntros: true,
          getIntro: true,
          requestIntro: true,
          respondToIntro: true,
        },
        notes: [
          FIXTURE_BANNER,
          "Status names are a proposal for the API in spec/openapi.yaml. They are not a Boardy response format.",
          "request_intro stores a local record and does not email boardy@boardy.ai.",
          "sharedContact is present only on fixtures where both people have accepted, matching the public FAQ.",
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
      return clone(profile);
    },
    async updateLookingFor(input: UpdateLookingForArgs) {
      const lookingFor = input.items.map((item, index) => ({
        id: `fix_look_${++sequence}_${index + 1}`,
        kind: item.kind,
        description: item.description.trim(),
        why: item.why.trim(),
        active: item.active !== false,
      }));
      profile = {
        ...profile,
        brief: {
          ...profile.brief,
          whoTheyWantToMeet: lookingFor.map((item) => item.description).join(" "),
          howItsGoing: input.howItsGoing?.trim() || profile.brief.howItsGoing,
          biggestProblem: input.biggestProblem?.trim() || profile.brief.biggestProblem,
          asOf: input.asOf?.trim() || profile.brief.asOf,
        },
        lookingFor,
      };
      return clone(profile);
    },
    async listIntros(filter) {
      const limit = filter.limit ?? 20;
      const all = [...intros.values()]
        .filter((intro) => (filter.status ? intro.status === filter.status : true))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const page = paginate(all, limit, filter.cursor);
      return { items: page.items.map(clone), nextCursor: page.nextCursor };
    },
    async getIntro(id) {
      return clone(requireIntro(id));
    },
    async requestIntro(input: RequestRecord) {
      if (input.clientRequestId) {
        const existingId = byClientId.get(input.clientRequestId);
        if (existingId) {
          return { intro: clone(requireIntro(existingId)), emailSent: false };
        }
      }
      const stamp = now().toISOString();
      const id = `fix_req_${++sequence}`;
      const intro: Intro = {
        id,
        status: "requested",
        createdAt: stamp,
        updatedAt: stamp,
        goal: input.goal,
        summary: "Fixture request stored in this process. Boardy was not contacted, and no person was suggested.",
        fixture: true,
        notice: FIXTURE_NOTICE,
      };
      intros.set(id, intro);
      if (input.clientRequestId) byClientId.set(input.clientRequestId, id);
      return { intro: clone(intro), emailSent: false };
    },
    async respondToIntro(input: RespondRecord) {
      const intro = requireIntro(input.introId);
      if (intro.status === "requested" || intro.status === "no_fit") {
        throw new BoardyError(
          `${intro.id} has no person to respond to. Status is ${intro.status}.`,
          "validation",
        );
      }
      if (intro.status === "expired" || intro.status === "completed") {
        throw new BoardyError(`${intro.id} is ${intro.status} and cannot be changed.`, "validation");
      }
      if (intro.status === "declined" && input.decision !== "propose_times") {
        throw new BoardyError(`${intro.id} is already declined.`, "validation");
      }

      const next: Intro = { ...intro, updatedAt: now().toISOString(), notice: FIXTURE_NOTICE, fixture: true };

      if (input.decision === "decline") {
        const reason = input.reason?.trim();
        if (!reason) {
          throw new BoardyError(
            "A decline needs a reason. The ChatGPT help text says you can decline with a reason.",
            "validation",
          );
        }
        next.status = "declined";
        next.yourDecision = "declined";
        next.declineReason = reason;
        next.summary = `Mina declined. Reason: ${reason} Fixture only.`;
        next.sharedContact = undefined;
        next.meeting = undefined;
      } else if (input.decision === "accept") {
        next.yourDecision = "accepted";
        next.declineReason = undefined;
        if (next.theirDecision === "accepted") {
          next.status = next.meeting ? "scheduled" : "in_progress";
          next.summary = "You accepted. The other person had already agreed. Fixture only: no message was sent.";
        } else {
          next.status = "awaiting_them";
          next.theirDecision = next.theirDecision ?? "pending";
          next.summary = "You accepted. Waiting on the other person. No contact details until they agree too.";
          next.sharedContact = undefined;
        }
        if (!bothAgreed(next)) next.sharedContact = undefined;
      } else {
        const times = input.times ?? [];
        if (times.length === 0) {
          throw new BoardyError("propose_times needs one to five date-times.", "validation");
        }
        next.proposedTimes = times;
        if (next.status === "awaiting_you" || next.status === "awaiting_them" || next.status === "declined") {
          next.status = "in_progress";
        }
        next.summary = `You proposed ${times.length} time${times.length === 1 ? "" : "s"}. Fixture only: no calendar was touched and nothing was sent to Boardy.`;
      }

      intros.set(next.id, next);
      return clone(next);
    },
  };
}

export function assertNoContactBeforeOptIn(intro: Intro): void {
  const statusAllowsContact: IntroStatus[] = ["in_progress", "scheduled", "completed"];
  if (!statusAllowsContact.includes(intro.status) && intro.sharedContact) {
    throw new Error(`Fixture ${intro.id} leaks contact details before both people agree.`);
  }
}
