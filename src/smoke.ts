import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { fileURLToPath } from "node:url";
import { createMockBackend } from "./backend/mock.js";
import { createBoardyMcp } from "./mcp/server.js";
import { startMcpHttp } from "./transport.js";

const identity = { assistantName: "Boardy MCP smoke" };

function text(result: { content?: unknown }): string {
  const content = result.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (block && typeof block === "object" && "text" in block ? String(block.text) : ""))
    .join("\n");
}

async function inProcess(): Promise<void> {
  const handler = createMcpHandler(() => createBoardyMcp(createMockBackend(), identity));
  const client = new Client({ name: "boardy-mcp-smoke", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    const required = [
      "get_backend_status",
      "get_intro",
      "get_my_brief",
      "list_intros",
      "request_intro",
      "respond_to_intro",
      "update_what_im_looking_for",
    ];
    for (const name of required) {
      if (!names.includes(name)) throw new Error(`missing tool ${name}`);
    }
    const result = await client.callTool({ name: "list_intros", arguments: { status: "awaiting_you" } });
    if (result.isError) throw new Error(text(result));
    const body = text(result);
    if (!body.includes("fix_awaiting_you") || !body.includes("Fixture data")) {
      throw new Error("list_intros did not return the labeled fixture");
    }
    console.log(`in-process tools/list: ${names.join(", ")}`);
  } finally {
    await client.close();
    await handler.close();
  }
}

async function overStdio(): Promise<void> {
  const indexPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const env: Record<string, string> = { BOARDY_BACKEND: "mock" };
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  env.BOARDY_BACKEND = "mock";

  const client = new Client({ name: "boardy-mcp-smoke", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [indexPath],
    env,
    stderr: "pipe",
  });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const result = await client.callTool({ name: "get_intro", arguments: { introId: "fix_scheduled" } });
    if (result.isError) throw new Error(text(result));
    if (!text(result).includes("example.com/meet/fixture-binding")) {
      throw new Error("stdio get_intro did not return the fixture meeting");
    }
    console.log(`stdio tools/list: ${listed.tools.length} tools`);
  } finally {
    await client.close();
  }
}

async function overHttp(): Promise<void> {
  const running = await startMcpHttp(createMockBackend(), identity, { host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "boardy-mcp-smoke", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`));
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "get_backend_status", arguments: {} });
    if (result.isError) throw new Error(text(result));
    if (!text(result).includes('"kind": "mock"')) throw new Error("http status was not the mock backend");
    console.log(`streamable http tools/call on 127.0.0.1:${running.port}/mcp`);
  } finally {
    await client.close().catch(() => undefined);
    await running.close();
  }
}

await inProcess();
await overStdio();
await overHttp();
console.log("smoke ok");
