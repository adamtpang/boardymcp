#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { pathToFileURL } from "node:url";
import { createBackend } from "./backend/create.js";
import { loadConfig } from "./config.js";
import { BoardyError } from "./errors.js";
import { createBoardyMcp } from "./mcp/server.js";
import { startReferenceApi } from "./reference-api.js";
import { startMcpHttp } from "./transport.js";

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const command = process.argv[2] ?? "stdio";
  const backend = createBackend(config);

  if (command === "http") {
    const running = await startMcpHttp(backend, config.identity, { host: config.host, port: config.port });
    console.error(
      `boardy-mcp listening on http://${config.host}:${running.port}/mcp (backend ${config.backend}${config.backend === "mock" ? ", fixture data" : ""})`,
    );
    return;
  }

  if (command === "api") {
    const running = await startReferenceApi({
      host: config.host,
      port: config.apiPort,
      token: config.referenceToken,
    });
    console.error(
      `boardy-mcp reference API on http://${config.host}:${running.port} (fixture data, see spec/openapi.yaml)`,
    );
    return;
  }

  if (command !== "stdio") {
    console.error("Usage: boardy-mcp [stdio|http|api]");
    process.exitCode = 1;
    return;
  }

  console.error(
    `boardy-mcp stdio (backend ${config.backend}${config.backend === "mock" ? ", fixture data" : ""})`,
  );
  serveStdio(() => createBoardyMcp(backend, config.identity));
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof BoardyError || error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
