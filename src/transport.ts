import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  hostHeaderValidation,
  localhostHostValidation,
  localhostOriginValidation,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import {
  buildOAuthProtectedResourceMetadata,
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
  type OAuthMetadata,
} from "@modelcontextprotocol/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { requestAuth } from "./auth/request.js";
import { createTokenVerifier } from "./auth/verifier.js";
import type { OAuthSettings } from "./config.js";
import type { LocalIdentity } from "./domain.js";
import type { BoardyBackend } from "./backend/types.js";
import { createBoardyMcp } from "./mcp/server.js";

export interface ListenOptions {
  host: string;
  port: number;
  oauth?: OAuthSettings;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

function listen(host: string, port: number, onRequest: (req: IncomingMessage, res: ServerResponse) => void): Promise<RunningServer> {
  const server = createServer(onRequest);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      resolve({
        port: actual,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

export async function startMcpHttp(
  backend: BoardyBackend,
  identity: LocalIdentity,
  options: ListenOptions,
): Promise<RunningServer> {
  const handler = createMcpHandler(() => createBoardyMcp(backend, identity));
  const nodeHandler = toNodeHandler(handler);
  const oauth = options.oauth ? { ...options.oauth, resource: new URL(options.oauth.resource.href) } : undefined;
  let boundPort = options.port;

  const running = await listen(options.host, options.port, (req, res) => {
    if (oauth && (oauth.resource.port === "0" || oauth.resource.port === "")) {
      oauth.resource.port = String(boundPort);
    }
    void handle(req, res, backend, nodeHandler, oauth, boundPort).catch((error: unknown) => {
      if (res.headersSent) return;
      const message = error instanceof Error ? error.message : "Unexpected error";
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    });
  });
  boundPort = running.port;
  if (oauth && (oauth.resource.port === "0" || oauth.resource.port === "")) {
    oauth.resource.port = String(boundPort);
  }

  const originalClose = running.close;
  running.close = async () => {
    await handler.close();
    await originalClose();
  };
  return running;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  backend: BoardyBackend,
  nodeHandler: ReturnType<typeof toNodeHandler>,
  oauth: OAuthSettings | undefined,
  boundPort: number,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        backend: backend.kind,
        fixture: backend.kind === "mock",
        unofficial: true,
        auth: oauth ? "oauth" : "none",
      }),
    );
    return;
  }

  const validateHost = oauth ? hostCheck(oauth) : localhostHostValidation();
  const validateOrigin = oauth ? originCheck(oauth) : localhostOriginValidation();
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;

  if (oauth && (await writeDiscovery(req, res, oauth))) return;

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "The MCP endpoint is /mcp." }));
    return;
  }

  const host = header(req, "host") ?? `127.0.0.1:${boundPort}`;
  if (!oauth) {
    await nodeHandler(req, res);
    return;
  }

  const gate = requireBearerAuth({
    verifier: createTokenVerifier({
      resource: oauth.resource,
      scopes: oauth.scopes,
      devBearer: oauth.devBearer,
      allowDevBearerOffLoopback: oauth.allowDevBearerOffLoopback,
      introspectionUrl: oauth.introspectionUrl,
      introspectionAuthorization: oauth.introspectionAuthorization,
    }),
    requiredScopes: oauth.scopes,
    expectedResource: oauth.resource,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(oauth.resource),
  });
  const probed = webRequest(req, oauth.resource);
  const auth = await requestAuth.run({ host }, () => gate(probed));
  if (auth instanceof Response) {
    await writeWeb(res, auth);
    return;
  }
  await requestAuth.run({ host, token: auth.token }, () => nodeHandler(req, res));
}

function hostCheck(oauth: OAuthSettings): (req: IncomingMessage, res: ServerResponse) => boolean {
  const names = new Set<string>(["localhost", "127.0.0.1", "[::1]"]);
  names.add(oauth.resource.hostname === "::1" ? "[::1]" : oauth.resource.hostname);
  return hostHeaderValidation([...names]);
}

function originCheck(oauth: OAuthSettings): (req: IncomingMessage, res: ServerResponse) => boolean {
  if (oauth.allowedOrigins.length > 0) {
    const hosts = oauth.allowedOrigins.map((origin) => {
      try {
        return new URL(origin).hostname;
      } catch {
        return origin;
      }
    });
    return originValidation(hosts);
  }
  const host = oauth.resource.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return localhostOriginValidation();
  return () => true;
}

async function writeDiscovery(req: IncomingMessage, res: ServerResponse, oauth: OAuthSettings): Promise<boolean> {
  const url = new URL(req.url ?? "/", oauth.resource);
  const specific = new URL(getOAuthProtectedResourceMetadataUrl(oauth.resource)).pathname;
  const isProtectedResource = url.pathname === specific || url.pathname === "/.well-known/oauth-protected-resource";
  const isAuthorizationServer = url.pathname === "/.well-known/oauth-authorization-server";
  if (!isProtectedResource && !isAuthorizationServer) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
    });
    res.end();
    return true;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD, OPTIONS", "access-control-allow-origin": "*" });
    res.end();
    return true;
  }

  if (isProtectedResource) {
    const document = buildOAuthProtectedResourceMetadata({
      oauthMetadata: { issuer: oauth.issuer } as OAuthMetadata,
      resourceServerUrl: oauth.resource,
      scopesSupported: oauth.scopes,
      resourceName: "Boardy MCP (unofficial)",
      serviceDocumentationUrl: new URL("https://github.com/adamtpang/boardymcp/blob/main/docs/FOR-BOARDY.md"),
    });
    const body = JSON.stringify(document);
    res.writeHead(req.method === "HEAD" ? 200 : 200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  }

  const proxied = await proxyAuthorizationServerMetadata(oauth.issuer);
  res.writeHead(proxied.status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(req.method === "HEAD" ? undefined : proxied.body);
  return true;
}

async function proxyAuthorizationServerMetadata(issuer: string): Promise<{ status: number; body: string }> {
  const url = new URL("/.well-known/oauth-authorization-server", issuer.endsWith("/") ? issuer : `${issuer}/`);
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      return {
        status: 502,
        body: JSON.stringify({
          error: "authorization_server_metadata_unavailable",
          detail: `The issuer did not return authorization server metadata (${response.status}). This MCP server does not invent that document. Clients should read it from ${url.href}.`,
        }),
      };
    }
    return { status: 200, body: text };
  } catch {
    return {
      status: 502,
      body: JSON.stringify({
        error: "authorization_server_metadata_unavailable",
        detail: `Could not reach ${url.href}. This MCP server does not publish its own authorization server. Point BOARDY_OAUTH_ISSUER at one that serves RFC 8414 metadata.`,
      }),
    };
  }
}

function webRequest(req: IncomingMessage, resource: URL): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  return new Request(new URL(req.url ?? "/", resource.origin), { method: req.method ?? "GET", headers });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function writeWeb(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}
