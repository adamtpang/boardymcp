import type { Intro, Profile } from "../domain.js";
import { FIXTURE_BANNER } from "../copy.js";

/**
 * Invented demo account. Names, companies, and links are not real people
 * and are not Boardy users. Emails use example.com. Meeting links use example.com.
 */
export const FIXTURE_NOTICE = FIXTURE_BANNER;

const t = {
  oct1: "2026-10-01T15:00:00.000Z",
  oct8: "2026-10-08T15:00:00.000Z",
  oct20: "2026-10-20T18:00:00.000Z",
  nov2: "2026-11-02T16:30:00.000Z",
  nov4: "2026-11-04T21:00:00.000Z",
  nov6: "2026-11-06T14:00:00.000Z",
  nov7: "2026-11-07T19:00:00.000Z",
  nov8: "2026-11-08T15:10:00.000Z",
  meet: "2026-11-12T20:30:00.000Z",
  meetEnd: "2026-11-12T21:00:00.000Z",
} as const;

export function fixtureProfile(): Profile {
  return {
    origin: "fixture",
    fixture: true,
    notice: FIXTURE_NOTICE,
    fullName: "Mina Cho",
    email: "mina@example.com",
    role: "Founder",
    company: "Lumen Ledger",
    location: "Austin, TX",
    timezone: "America/Chicago",
    links: {
      linkedin: "https://example.com/fixtures/mina-cho",
      x: "https://example.com/fixtures/mina-cho-x",
      github: "https://example.com/fixtures/lumen-ledger",
      website: "https://example.com/fixtures/lumen-ledger",
    },
    brief: {
      whoTheyAre:
        "Mina Cho is the founder of Lumen Ledger, a fictional bookkeeping tool for independent bookstores. She writes the product and talks to shop owners herself.",
      asOf: "November 2026",
      howItsGoing: "14 bookstores are on a waitlist. No paying customers yet. A private beta of invoice import is in testing with one shop.",
      biggestProblem:
        "No design partner has run a full month of invoices, so she cannot tell which import errors are the product and which are one shop's books.",
      whoTheyWantToMeet:
        "An independent bookstore operator who would pilot invoice import for a month, and a seed investor who has backed vertical software for retailers.",
      whyNow: "The waitlist has been stuck since September because onboarding still needs her on a call.",
      whatTheyCanOffer:
        "A free month of the beta, a plain report of what the import got wrong, and a founder who has actually done bookstore inventory.",
      notes: "The beta runs on Postgres and a small TypeScript app she deploys herself. She chooses and pays for those tools.",
      keepPrivate: "The waitlist count is fine to share. Do not share that the one beta shop has not paid.",
    },
    lookingFor: [
      {
        id: "fix_look_pilot",
        kind: "customers",
        description: "Independent bookstore operators in the US who would pilot invoice import for one month.",
        why: "She needs one shop to finish a month of books before she charges anyone.",
        active: true,
      },
      {
        id: "fix_look_seed",
        kind: "investors",
        description: "Seed investors who have backed vertical software for retailers.",
        why: "She wants advice on when a waitlist is enough to raise, not a round this month.",
        active: true,
      },
    ],
  };
}

export function fixtureIntros(): Intro[] {
  return [
    {
      id: "fix_awaiting_you",
      status: "awaiting_you",
      createdAt: t.nov7,
      updatedAt: t.nov7,
      goal: "Find a bookstore operator to pilot invoice import.",
      summary:
        "Suggested match waiting on Mina. She has not accepted or declined. No contact details, because both people have not agreed.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Samir Adeyemi",
        headline: "Owner of three independent bookstores",
        company: "Adeyemi Books",
        location: "Chicago, IL",
        whyThem: "Runs the books himself and has complained about invoice imports in public posts. Fictional person.",
        linkedinUrl: "https://example.com/fixtures/samir-adeyemi",
      },
      yourDecision: "pending",
      theirDecision: "pending",
    },
    {
      id: "fix_awaiting_them",
      status: "awaiting_them",
      createdAt: t.nov4,
      updatedAt: t.nov6,
      goal: "Talk with a seed investor who knows retail software.",
      summary: "Mina accepted. Elena has not answered. No email or phone until she does.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Elena Voss",
        headline: "Partner",
        company: "Harbor Seed",
        location: "San Francisco, CA",
        whyThem: "Fictional seed fund that has written about vertical software for shops. Not a real firm.",
        linkedinUrl: "https://example.com/fixtures/elena-voss",
      },
      yourDecision: "accepted",
      theirDecision: "pending",
    },
    {
      id: "fix_in_progress",
      status: "in_progress",
      createdAt: t.oct20,
      updatedAt: t.nov2,
      goal: "Compare notes with a founder who sells to independent retailers.",
      summary: "Both agreed. Scheduling is not done. The fixture includes an example.com email because both opted in.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Priya Raman",
        headline: "Founder",
        company: "Shelf & Co",
        location: "Toronto, Canada",
        whyThem: "Fictional founder of a shop-inventory product. Useful as a peer, not a customer.",
        linkedinUrl: "https://example.com/fixtures/priya-raman",
      },
      yourDecision: "accepted",
      theirDecision: "accepted",
      sharedContact: { email: "priya@example.com" },
    },
    {
      id: "fix_scheduled",
      status: "scheduled",
      createdAt: t.oct8,
      updatedAt: t.nov8,
      goal: "Meet an operator who has cleaned up bookstore purchasing.",
      summary: "Both agreed and a meeting is on the calendar. The meeting link is example.com, not a real room.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Chris Dalton",
        headline: "Operator",
        company: "Binding Co",
        location: "Austin, TX",
        whyThem: "Fictional operator who buys for a small chain of shops.",
        linkedinUrl: "https://example.com/fixtures/chris-dalton",
      },
      yourDecision: "accepted",
      theirDecision: "accepted",
      sharedContact: { email: "chris@example.com" },
      meeting: {
        startsAt: t.meet,
        endsAt: t.meetEnd,
        url: "https://example.com/meet/fixture-binding",
        provider: "google_meet",
      },
    },
    {
      id: "fix_declined",
      status: "declined",
      createdAt: t.oct20,
      updatedAt: t.nov2,
      goal: "Get help turning the waitlist into paid pilots.",
      summary: "Mina declined this match.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Riley Chen",
        headline: "Founder of a growth agency",
        company: "Northwind Agency",
        location: "New York, NY",
        whyThem: "Fictional agency. Included so a decline with a reason is visible.",
        linkedinUrl: "https://example.com/fixtures/riley-chen",
      },
      yourDecision: "declined",
      theirDecision: "pending",
      declineReason: "Not looking for an agency.",
    },
    {
      id: "fix_expired",
      status: "expired",
      createdAt: t.oct1,
      updatedAt: t.oct8,
      goal: "Meet a buyer who has purchased for a bookstore chain.",
      summary: "The suggestion expired before Mina answered. Declined and expired matches are part of the public ChatGPT help copy.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Alex Morgan",
        headline: "Former buyer for a bookstore chain",
        company: "Paper Route Buying",
        location: "Denver, CO",
        whyThem: "Fictional expired suggestion.",
        linkedinUrl: "https://example.com/fixtures/alex-morgan",
      },
      yourDecision: "pending",
      theirDecision: "pending",
    },
    {
      id: "fix_completed",
      status: "completed",
      createdAt: t.oct1,
      updatedAt: t.oct20,
      goal: "Learn how a similar beta found its first ten shops.",
      summary: "Both agreed, met, and the intro is closed. Phone is present only because both opted in. The number is a reserved 555 fixture.",
      fixture: true,
      notice: FIXTURE_NOTICE,
      counterparty: {
        name: "Jordan Hale",
        headline: "Founder",
        company: "Margin Notebook",
        location: "Remote, US",
        whyThem: "Fictional founder who has been through a retail beta.",
        linkedinUrl: "https://example.com/fixtures/jordan-hale",
      },
      yourDecision: "accepted",
      theirDecision: "accepted",
      sharedContact: { email: "jordan@example.com", phone: "+1-555-0100" },
    },
    {
      id: "fix_no_fit",
      status: "no_fit",
      createdAt: t.nov2,
      updatedAt: t.nov4,
      goal: "Meet a CFO who has taken a bookstore chain through an IPO.",
      summary:
        "No introduction. The public FAQ says Boardy would rather say the right person is not in the network than introduce someone who is not a fit.",
      fixture: true,
      notice: FIXTURE_NOTICE,
    },
    {
      id: "fix_requested",
      status: "requested",
      createdAt: t.nov8,
      updatedAt: t.nov8,
      goal: "Meet seed investors who have backed vertical software for retailers.",
      summary: "The ask is recorded. No person has been suggested, so there is nobody to accept or decline.",
      fixture: true,
      notice: FIXTURE_NOTICE,
    },
  ];
}
