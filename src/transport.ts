import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { LocalIdentity } from "./domain.js";
import type { BoardyBackend } from "./backend/types.js";
import { createBoardyMcp } from "./mcp/server.js";

export interface ListenOptions {
  host: string;
  port: number;
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

export async function startMcpHttp(backend: BoardyBackend, identity: LocalIdentity, options: ListenOptions): Promise<RunningServer> {
  const handler = createMcpHandler(() => createBoardyMcp(backend, identity));
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const running = await listen(options.host, options.port, (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      const body = JSON.stringify({
        ok: true,
        backend: backend.kind,
        fixture: backend.kind === "mock",
        unofficial: true,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "The MCP endpoint is /mcp." }));
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
  });

  const originalClose = running.close;
  running.close = async () => {
    await handler.close();
    await originalClose();
  };
  return running;
}
