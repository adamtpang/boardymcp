import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { createEmailBackend } from "../src/backend/email.js";
import { createMockBackend } from "../src/backend/mock.js";
import { createBoardyMcp } from "../src/mcp/server.js";

const identity = { assistantName: "Claude", fullName: "Mina Cho", email: "mina@example.com" };

async function connect(kind: "mock" | "email") {
  const backend =
    kind === "mock"
      ? createMockBackend()
      : createEmailBackend({
          identity: { ...identity, linkedinUrl: "https://example.com/fixtures/mina-cho" },
        });
  const handler = createMcpHandler(() => createBoardyMcp(backend, identity));
  const client = new Client({ name: "boardy-mcp-test", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  return {
    client,
    async close() {
      await client.close();
      await handler.close();
    },
  };
}

const sessions: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
});

function text(result: { content?: unknown }): string {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .map((block) => (block && typeof block === "object" && "text" in block ? String(block.text) : ""))
    .join("\n");
}

describe("MCP server", () => {
  it("lists the tools and returns a labeled fixture intro", async () => {
    const session = await connect("mock");
    sessions.push(session);
    const listed = await session.client.listTools();
    for (const tool of listed.tools) {
      expect(tool.title, tool.name).toBeTruthy();
      const annotations = tool.annotations ?? {};
      expect(
        annotations.readOnlyHint !== undefined || annotations.destructiveHint !== undefined,
        tool.name,
      ).toBe(true);
    }
    expect(listed.tools.find((tool) => tool.name === "list_intros")?.description).toMatch(/cursor/i);

    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      "get_backend_status",
      "get_intro",
      "get_my_brief",
      "list_intros",
      "request_intro",
      "respond_to_intro",
      "update_what_im_looking_for",
    ]);

    const result = await session.client.callTool({ name: "list_intros", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("Fixture data");
    expect(result.structuredContent).toMatchObject({ source: "mock", fixture: true });

    const prompts = await session.client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
      "draft-boardy-email",
      "offer-boardy",
      "respond-to-match",
    ]);

    const protocol = await session.client.readResource({ uri: "boardy://protocol" });
    expect(protocol.contents[0]?.text).toContain("https://www.boardy.ai/agents.md");
    expect(protocol.contents[0]?.text).toContain("unofficial");
  });

  it("drafts an ask and does not send it", async () => {
    const session = await connect("mock");
    sessions.push(session);
    const result = await session.client.callTool({
      name: "request_intro",
      arguments: {
        whoTheyAre: "Mina Cho builds Lumen Ledger for independent bookstores.",
        asOf: "November 2026",
        howItsGoing: "No paying customers yet.",
        whoToMeet: "bookstore operators in the US who would pilot invoice import",
        whyMeet: "She needs one finished month of books.",
        whatTheyCanOffer: "A free month of the beta.",
        linkedinUrl: "https://example.com/fixtures/mina-cho",
      },
    });
    expect(result.isError).toBeFalsy();
    const body = text(result);
    expect(body).toContain("boardy@boardy.ai");
    expect(body).toContain("Nothing was sent");
    expect(body).toContain("Who they are");
    expect(result.structuredContent).toMatchObject({ emailSent: false, recorded: true, fixture: true });
  });

  it("rejects a decline without a reason before it touches state", async () => {
    const session = await connect("mock");
    sessions.push(session);
    const result = await session.client.callTool({
      name: "respond_to_intro",
      arguments: { introId: "fix_awaiting_you", decision: "decline" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/reason/);
    const still = await session.client.callTool({
      name: "get_intro",
      arguments: { introId: "fix_awaiting_you" },
    });
    expect(text(still)).toContain('"status": "awaiting_you"');
  });

  it("says so when the email backend cannot list intros", async () => {
    const session = await connect("email");
    sessions.push(session);
    const result = await session.client.callTool({ name: "list_intros", arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("boardy@boardy.ai");
    expect(text(result)).toContain("spec/openapi.yaml");
  });
});
