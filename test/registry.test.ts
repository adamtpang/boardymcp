import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERVER_INSTRUCTIONS } from "../src/copy.js";

interface ServerJson {
  $schema: string;
  name: string;
  description: string;
  version: string;
  packages: Array<{ identifier: string; version: string; transport: { type: string } }>;
  remotes?: unknown[];
}

describe("registry and client-facing metadata", () => {
  const serverJson = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8")) as ServerJson;
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    name: string;
    version: string;
    bin: Record<string, string>;
  };

  it("matches the package version and does not invent a remote URL", () => {
    expect(serverJson.$schema).toBe("https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
    expect(serverJson.name).toBe("io.github.adamtpang/boardy");
    expect(serverJson.description.length).toBeGreaterThan(0);
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
    expect(serverJson.version).toBe(pkg.version);
    expect(serverJson.packages[0]?.identifier).toBe(pkg.name);
    expect(serverJson.packages[0]?.version).toBe(pkg.version);
    expect(serverJson.packages[0]?.transport.type).toBe("stdio");
    expect(serverJson.remotes).toBeUndefined();
    expect(pkg.bin["boardy-mcp"]).toBe("./dist/index.js");
  });

  it("keeps the server instructions inside the first block ChatGPT keeps", () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(512);
    expect(SERVER_INSTRUCTIONS).toContain("Not affiliated");
    expect(SERVER_INSTRUCTIONS).toContain("fixture data");
    expect(SERVER_INSTRUCTIONS).toContain("approves the exact text");
  });
});
