import { describe, expect, it } from "vitest";
import type { LocalIdentity, RequestIntroArgs } from "../src/domain.js";
import { bodiesMatch, buildAskEmail, resolveBrief } from "../src/protocol/brief.js";
import { mailtoLink } from "../src/protocol/mailto.js";

const identity: LocalIdentity = { assistantName: "Claude" };

function args(overrides: Partial<RequestIntroArgs> = {}): RequestIntroArgs {
  return {
    userFullName: "Mina Cho",
    whoTheyAre: "Mina Cho builds Lumen Ledger, a bookkeeping tool for independent bookstores.",
    asOf: "November 2026",
    howItsGoing: "14 bookstores on a waitlist. No paying customers yet.",
    biggestProblem: "No design partner has finished a month of invoices.",
    whoToMeet: "independent bookstore operators in the US who would pilot invoice import",
    whyMeet: "She needs one shop to run a month of books.",
    whyNow: "The waitlist has been stuck since September.",
    whatTheyCanOffer: "A free month of the beta and a written report of what the import got wrong.",
    linkedinUrl: "https://example.com/fixtures/mina-cho",
    location: "Austin, TX",
    ...overrides,
  };
}

describe("ask email", () => {
  it("keeps the section headings the public guide uses", () => {
    const draft = buildAskEmail(resolveBrief(args(), identity));
    expect(draft.to).toBe("boardy@boardy.ai");
    expect(draft.from).toBeNull();
    expect(draft.subject.startsWith("Ask Boardy:")).toBe(true);
    expect(draft.body).toContain("I'm Claude, writing on behalf of Mina Cho.");
    expect(draft.body).toContain("Who they are");
    expect(draft.body).toContain("Where things stand (as of November 2026)");
    expect(draft.body).toContain("- How it's going: 14 bookstores on a waitlist. No paying customers yet.");
    expect(draft.body).toContain("Who they'd like to meet");
    expect(draft.body).toContain("Why now: The waitlist has been stuck since September.");
    expect(draft.body).toContain("What they can offer");
    expect(draft.body).toContain("Could you find people who fit?");
    expect(draft.body).toContain("LinkedIn: https://example.com/fixtures/mina-cho");
    expect(draft.body).not.toContain("Notes\n");
    expect(draft.body).not.toContain("Please keep private");
    expect(draft.body).not.toContain("GitHub:");
  });

  it("includes optional sections only when the caller has them", () => {
    const draft = buildAskEmail(
      resolveBrief(
        args({
          notes: "Postgres, which she pays for herself.",
          keepPrivate: "The beta shop has not paid.",
          xUrl: "https://example.com/fixtures/mina-cho-x",
          githubUrl: "https://example.com/fixtures/lumen-ledger",
        }),
        identity,
      ),
    );
    expect(draft.body).toContain("Notes\nPostgres, which she pays for herself.");
    expect(draft.body).toContain("Please keep private\nThe beta shop has not paid.");
    expect(draft.body).toContain("X: https://example.com/fixtures/mina-cho-x");
    expect(draft.body).toContain("GitHub: https://example.com/fixtures/lumen-ledger");
  });

  it("writes a short update when the user already knows Boardy", () => {
    const draft = buildAskEmail(resolveBrief(args({ alreadyKnowsBoardy: true }), identity));
    expect(draft.subject.startsWith("Update for Boardy:")).toBe(true);
    expect(draft.body).toContain("What has changed");
    expect(draft.body).not.toContain("Could you find people who fit?");
    expect(draft.body).toContain("LinkedIn: https://example.com/fixtures/mina-cho");
  });

  it("refuses to invent a LinkedIn URL", () => {
    expect(() => resolveBrief(args({ linkedinUrl: "   " }), identity)).toThrow(/LinkedIn/);
  });

  it("encodes mailto line breaks the way the guide describes", () => {
    const link = mailtoLink({
      to: "boardy@boardy.ai",
      subject: "Ask Boardy: a pilot",
      body: "Line one\nLine two",
    });
    expect(link.startsWith("mailto:boardy@boardy.ai?")).toBe(true);
    expect(link).toContain("subject=Ask%20Boardy");
    expect(link).toContain("Line%20one%0D%0ALine%20two");
    expect(link).not.toContain("+");
  });

  it("treats CRLF and LF as the same approved body", () => {
    const draft = buildAskEmail(resolveBrief(args(), identity));
    expect(bodiesMatch(draft.body, draft.body.replace(/\n/g, "\r\n"))).toBe(true);
    expect(bodiesMatch(draft.body, `${draft.body}\nextra`)).toBe(false);
  });
});
