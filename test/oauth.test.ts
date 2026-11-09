import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { createMockBackend } from "../src/backend/mock.js";
import { loadConfig } from "../src/config.js";
import { startMcpHttp, type RunningServer } from "../src/transport.js";
import { createTokenVerifier } from "../src/auth/verifier.js";
import { requestAuth } from "../src/auth/request.js";
import { MCP_SCOPES } from "../src/auth/scopes.js";

let running: RunningServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

describe("oauth resource server", () => {
  it("refuses to start oauth mode without an issuer or a token check", () => {
    expect(() => loadConfig({ BOARDY_AUTH: "oauth" })).toThrow(/BOARDY_OAUTH_ISSUER/);
    expect(() => loadConfig({ BOARDY_AUTH: "oauth", BOARDY_OAUTH_ISSUER: "https://auth.example.com" })).toThrow(
      /INTROSPECTION/,
    );
  });

  it("advertises protected resource metadata and challenges anonymous clients", async () => {
    const config = loadConfig({
      BOARDY_AUTH: "oauth",
      BOARDY_OAUTH_ISSUER: "http://127.0.0.1:9",
      BOARDY_DEV_BEARER: "local-secret",
      PORT: "0",
    });
    running = await startMcpHttp(createMockBackend(), config.identity, {
      host: "127.0.0.1",
      port: 0,
      oauth: config.oauth,
    });
    const base = `http://127.0.0.1:${running.port}`;
    const metadata = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(metadata.status).toBe(200);
    const document = (await metadata.json()) as {
      resource: string;
      authorization_servers: string[];
      scopes_supported: string[];
    };
    expect(document.resource).toBe(`${base}/mcp`);
    expect(document.authorization_servers).toEqual(["http://127.0.0.1:9"]);
    expect(document.scopes_supported).toEqual([...MCP_SCOPES]);

    const denied = await fetch(`${base}/mcp`, { method: "POST", body: "{}" });
    expect(denied.status).toBe(401);
    const challenge = denied.headers.get("www-authenticate") ?? "";
    expect(challenge.toLowerCase()).toContain("bearer");
    expect(challenge).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);

    const allowed = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer local-secret",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "oauth-test", version: "0" },
        },
      }),
    });
    expect(allowed.status).not.toBe(401);
  });

  it("does not treat the dev bearer as a token for a public host", async () => {
    const verifier = createTokenVerifier({
      resource: new URL("https://mcp.example.com/mcp"),
      scopes: [...MCP_SCOPES],
      devBearer: "local-secret",
      allowDevBearerOffLoopback: false,
    });
    await expect(
      requestAuth.run({ host: "mcp.example.com" }, () => verifier.verifyAccessToken("local-secret")),
    ).rejects.toThrow(/localhost/);
  });

  it("accepts an introspection response with the right audience and scopes", async () => {
    const introspection = await listenJson({
      active: true,
      exp: Math.floor(Date.now() / 1000) + 600,
      scope: MCP_SCOPES.join(" "),
      aud: "http://127.0.0.1:3000/mcp",
      client_id: "chatgpt",
    });
    const verifier = createTokenVerifier({
      resource: new URL("http://127.0.0.1:3000/mcp"),
      scopes: [...MCP_SCOPES],
      allowDevBearerOffLoopback: false,
      introspectionUrl: introspection.url,
    });
    const info = await verifier.verifyAccessToken("issued-token");
    expect(info.clientId).toBe("chatgpt");
    expect(info.scopes).toEqual([...MCP_SCOPES]);
    await introspection.close();
  });
});

function listenJson(body: unknown): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    req.resume();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/introspect`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
