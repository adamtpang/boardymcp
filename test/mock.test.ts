import { describe, expect, it } from "vitest";
import { assertNoContactBeforeOptIn, createMockBackend } from "../src/backend/mock.js";
import { buildAskEmail, resolveBrief } from "../src/protocol/brief.js";
import type { RequestIntroArgs } from "../src/domain.js";

const brief: RequestIntroArgs = {
  userFullName: "Mina Cho",
  whoTheyAre: "Founder of Lumen Ledger.",
  asOf: "November 2026",
  howItsGoing: "No paying customers yet.",
  whoToMeet: "bookstore operators who would pilot invoice import",
  whyMeet: "She needs one finished month of books.",
  whatTheyCanOffer: "A free month of the beta.",
  linkedinUrl: "https://example.com/fixtures/mina-cho",
};

describe("mock backend", () => {
  it("pages introductions with a cursor", async () => {
    const backend = createMockBackend();
    const first = await backend.listIntros({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe("1");
    const second = await backend.listIntros({ limit: 1, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it("labels every seeded intro as a fixture and hides contact until both agree", async () => {
    const backend = createMockBackend();
    const page = await backend.listIntros({ limit: 50 });
    expect(page.items.length).toBeGreaterThan(5);
    for (const intro of page.items) {
      expect(intro.fixture).toBe(true);
      expect(intro.notice.toLowerCase()).toContain("fixture");
      expect(intro.summary + JSON.stringify(intro.counterparty ?? {})).not.toMatch(/@gmail\.com|@boardy\.ai/);
      assertNoContactBeforeOptIn(intro);
    }
    const waiting = await backend.getIntro("fix_awaiting_you");
    expect(waiting.sharedContact).toBeUndefined();
    const scheduled = await backend.getIntro("fix_scheduled");
    expect(scheduled.sharedContact?.email).toBe("chris@example.com");
    expect(scheduled.meeting?.url).toContain("example.com");
  });

  it("requires a reason to decline and does not invent contact details on accept", async () => {
    const backend = createMockBackend();
    await expect(backend.respondToIntro({ introId: "fix_awaiting_you", decision: "decline" })).rejects.toThrow(/reason/);
    const declined = await backend.respondToIntro({
      introId: "fix_awaiting_you",
      decision: "decline",
      reason: "Wrong city.",
    });
    expect(declined.status).toBe("declined");
    expect(declined.sharedContact).toBeUndefined();

    const accepted = await backend.respondToIntro({ introId: "fix_awaiting_them", decision: "accept" });
    expect(accepted.status).toBe("awaiting_them");
    expect(accepted.yourDecision).toBe("accepted");
    expect(accepted.sharedContact).toBeUndefined();
  });

  it("refuses a response when nobody has been suggested", async () => {
    const backend = createMockBackend();
    await expect(backend.respondToIntro({ introId: "fix_requested", decision: "accept" })).rejects.toThrow(/no person/);
    await expect(backend.respondToIntro({ introId: "fix_no_fit", decision: "accept" })).rejects.toThrow(/no person/);
  });

  it("stores proposed times without claiming a calendar was booked", async () => {
    const backend = createMockBackend();
    const updated = await backend.respondToIntro({
      introId: "fix_in_progress",
      decision: "propose_times",
      times: ["2026-11-18T15:00:00.000Z"],
    });
    expect(updated.proposedTimes).toEqual(["2026-11-18T15:00:00.000Z"]);
    expect(updated.summary.toLowerCase()).toContain("fixture");
    expect(updated.meeting).toBeUndefined();
  });

  it("records a request locally and does not send mail", async () => {
    const backend = createMockBackend();
    const draft = buildAskEmail(resolveBrief(brief, { assistantName: "Cursor" }));
    const first = await backend.requestIntro({
      draft,
      goal: brief.whoToMeet,
      send: true,
      clientRequestId: "demo-1",
    });
    const second = await backend.requestIntro({
      draft,
      goal: brief.whoToMeet,
      send: true,
      clientRequestId: "demo-1",
    });
    expect(first.emailSent).toBe(false);
    expect(first.intro?.status).toBe("requested");
    expect(first.intro?.id).toBe(second.intro?.id);
  });

  it("replaces what the fixture user is looking for", async () => {
    const backend = createMockBackend();
    const profile = await backend.updateLookingFor({
      items: [
        {
          kind: "hires",
          description: "A founding engineer who has shipped a TypeScript beta.",
          why: "The import errors are piling up.",
        },
      ],
    });
    expect(profile.fixture).toBe(true);
    expect(profile.lookingFor).toHaveLength(1);
    expect(profile.lookingFor[0]?.kind).toBe("hires");
  });
});
