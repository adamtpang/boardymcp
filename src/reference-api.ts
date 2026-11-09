import type { IncomingMessage, ServerResponse } from "node:http";
import type { Intro, UpdateLookingForArgs } from "./domain.js";
import { BoardyError, isBoardyError } from "./errors.js";
import { createMockBackend } from "./backend/mock.js";
import type { BoardyBackend } from "./backend/types.js";
import { listenHttp, type RunningServer } from "./listen.js";

/**
 * Local stand-in for spec/openapi.yaml.
 * Every record comes from the mock backend and is labeled fixture data.
 * The only accepted credential is the configured token (default "fixture").
 */
export async function startReferenceApi(options: {
  host: string;
  port: number;
  token: string;
  backend?: BoardyBackend;
}): Promise<RunningServer> {
  const backend = options.backend ?? createMockBackend();
  const idempotent = new Map<string, unknown>();

  return listenHttp(options.host, options.port, async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname.replace(/\/$/, "") || "/";

      if (req.method === "GET" && path === "/health") {
        return sendJson(res, 200, { ok: true, fixture: true, implements: "spec/openapi.yaml" });
      }
      if (!authorized(req, options.token)) {
        return sendProblem(res, 401, "unauthorized", "Send Authorization: Bearer fixture or X-API-Key: fixture. This reference server has no other credentials.");
      }
      if (req.method === "GET" && path === "/v1/me") {
        return sendJson(res, 200, await backend.getProfile());
      }
      if (req.method === "PATCH" && path === "/v1/me/looking-for") {
        const body = await readJson(req);
        const items = Array.isArray(body.lookingFor) ? body.lookingFor : undefined;
        if (!items) {
          return sendProblem(res, 400, "validation", "lookingFor must be an array.");
        }
        const input: UpdateLookingForArgs = {
          items: items as UpdateLookingForArgs["items"],
          howItsGoing: typeof body.howItsGoing === "string" ? body.howItsGoing : undefined,
          biggestProblem: typeof body.biggestProblem === "string" ? body.biggestProblem : undefined,
          asOf: typeof body.asOf === "string" ? body.asOf : undefined,
        };
        return sendJson(res, 200, await backend.updateLookingFor(input));
      }
      if (req.method === "GET" && path === "/v1/intros") {
        const status = url.searchParams.get("status") ?? undefined;
        const limit = url.searchParams.get("limit");
        const page = await backend.listIntros({
          status: status as Intro["status"] | undefined,
          limit: limit ? Number(limit) : 20,
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        return sendJson(res, 200, { fixture: true, intros: page.items, nextCursor: page.nextCursor ?? null });
      }

      const introMatch = path.match(/^\/v1\/intros\/([^/]+)$/);
      if (req.method === "GET" && introMatch?.[1]) {
        return sendJson(res, 200, await backend.getIntro(decodeURIComponent(introMatch[1])));
      }

      if (req.method === "POST" && path === "/v1/intro-requests") {
        const key = header(req, "idempotency-key");
        if (key && idempotent.has(key)) {
          return sendJson(res, 200, idempotent.get(key));
        }
        const body = await readJson(req);
        const goal = typeof body.goal === "string" ? body.goal : "";
        const text = typeof body.body === "string" ? body.body : "";
        const subject = typeof body.subject === "string" ? body.subject : "Ask Boardy";
        if (!goal || !text) {
          return sendProblem(res, 400, "validation", "goal and body are required.");
        }
        const recorded = await backend.requestIntro({
          goal,
          send: false,
          draft: { to: "boardy@boardy.ai", from: null, subject, body: text, mailto: "mailto:boardy@boardy.ai" },
          clientRequestId: key,
        });
        const payload = {
          fixture: true,
          intro: recorded.intro,
          note: "Reference server stored a fixture request. Boardy was not contacted.",
        };
        if (key) idempotent.set(key, payload);
        return sendJson(res, 201, payload);
      }

      const respondMatch = path.match(/^\/v1\/intros\/([^/]+)\/responses$/);
      if (req.method === "POST" && respondMatch?.[1]) {
        const body = await readJson(req);
        const decision = body.decision;
        if (decision !== "accept" && decision !== "decline" && decision !== "propose_times") {
          return sendProblem(res, 400, "validation", "decision must be accept, decline, or propose_times.");
        }
        const intro = await backend.respondToIntro({
          introId: decodeURIComponent(respondMatch[1]),
          decision,
          reason: typeof body.reason === "string" ? body.reason : undefined,
          times: Array.isArray(body.times) ? body.times.filter((value): value is string => typeof value === "string") : undefined,
        });
        return sendJson(res, 200, { fixture: true, intro });
      }

      return sendProblem(res, 404, "not_found", `No route for ${req.method} ${path}.`);
    } catch (error) {
      if (isBoardyError(error)) return sendProblem(res, error.status, error.code, error.message);
      const message = error instanceof Error ? error.message : "Unexpected error";
      return sendProblem(res, 500, "upstream", message);
    }
  });
}

function authorized(req: IncomingMessage, token: string): boolean {
  const bearer = header(req, "authorization");
  const apiKey = header(req, "x-api-key");
  if (bearer?.toLowerCase() === `bearer ${token}`.toLowerCase()) return true;
  return apiKey === token;
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new BoardyError("Request body is too large.", "validation", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new BoardyError("JSON body must be an object.", "validation"));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new BoardyError("Body was not valid JSON.", "validation"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-ratelimit-policy": "proposed; numeric cap not published",
  });
  res.end(JSON.stringify(body));
}

function sendProblem(res: ServerResponse, status: number, code: string, detail: string): void {
  sendJson(res, status, {
    type: "about:blank",
    title: code,
    status,
    code,
    detail,
    fixture: true,
  });
}

export type { RunningServer };
