import { afterEach, describe, expect, it } from "vitest";
import { createHttpBackend } from "../src/backend/http.js";
import { createMockBackend } from "../src/backend/mock.js";
import { startReferenceApi } from "../src/reference-api.js";
import type { RunningServer } from "../src/listen.js";

let running: RunningServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("proposed HTTP API", () => {
  it("rejects missing credentials and serves fixture intros", async () => {
    const backend = createMockBackend();
    running = await startReferenceApi({ host: "127.0.0.1", port: 0, token: "fixture", backend });
    const base = `http://127.0.0.1:${running.port}`;

    const denied = await fetch(`${base}/v1/me`);
    expect(denied.status).toBe(401);

    const client = createHttpBackend({ baseUrl: base, apiKey: "fixture" });
    const profile = await client.getProfile();
    expect(profile.fixture).toBe(true);
    expect(profile.fullName).toBe("Mina Cho");

    const page = await client.listIntros({ status: "scheduled", limit: 10 });
    expect(page.items.map((intro) => intro.id)).toEqual(["fix_scheduled"]);

    const accepted = await client.respondToIntro({ introId: "fix_awaiting_you", decision: "accept" });
    expect(accepted.status).toBe("awaiting_them");
    expect(accepted.sharedContact).toBeUndefined();

    const created = await client.requestIntro({
      goal: "a pilot bookstore",
      send: false,
      clientRequestId: "same-key",
      draft: {
        to: "boardy@boardy.ai",
        from: null,
        subject: "Ask Boardy: a pilot",
        body: "LinkedIn: https://example.com/fixtures/mina-cho",
        mailto: "mailto:boardy@boardy.ai",
      },
    });
    const again = await client.requestIntro({
      goal: "a pilot bookstore",
      send: false,
      clientRequestId: "same-key",
      draft: {
        to: "boardy@boardy.ai",
        from: null,
        subject: "Ask Boardy: a pilot",
        body: "LinkedIn: https://example.com/fixtures/mina-cho",
        mailto: "mailto:boardy@boardy.ai",
      },
    });
    expect(created.intro?.id).toBe(again.intro?.id);
    expect(created.emailSent).toBe(false);
  });

  it("tells you when the API base URL is missing", async () => {
    const client = createHttpBackend({});
    await expect(client.listIntros({})).rejects.toThrow(/has not published/);
  });
});
