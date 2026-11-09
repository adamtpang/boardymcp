import { API_NOT_PUBLISHED, DOCS } from "../copy.js";
import type { Intro, Profile, UpdateLookingForArgs } from "../domain.js";
import { BoardyError } from "../errors.js";
import type { BoardyBackend, RequestRecord, RespondRecord } from "./types.js";

interface HttpBackendOptions {
  baseUrl?: string;
  token?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

interface ProblemBody {
  detail?: string;
  title?: string;
  code?: string;
  status?: number;
}

export function createHttpBackend(options: HttpBackendOptions): BoardyBackend {
  const fetchImpl = options.fetchImpl ?? fetch;
  const configured = Boolean(options.baseUrl);

  async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    if (!options.baseUrl) {
      throw new BoardyError(API_NOT_PUBLISHED, "not_configured");
    }
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    if (options.apiKey) headers.set("x-api-key", options.apiKey);
    if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);

    let response: Response;
    try {
      response = await fetchImpl(new URL(path, options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`), {
        ...init,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw new BoardyError(`Could not reach ${options.baseUrl}: ${message}`, "upstream", 502);
    }

    const text = await response.text();
    const body = text ? (JSON.parse(text) as ProblemBody & T) : ({} as T);
    if (!response.ok) {
      const problem = body as ProblemBody;
      throw new BoardyError(
        problem.detail || problem.title || `API responded ${response.status}`,
        problem.code === "not_found"
          ? "not_found"
          : problem.code === "validation"
            ? "validation"
            : "upstream",
        response.status,
      );
    }
    return body as T;
  }

  return {
    kind: "http",
    capabilities() {
      return {
        kind: "http",
        configured,
        fixture: false,
        sendsEmail: false,
        operations: {
          getProfile: configured,
          updateLookingFor: configured,
          listIntros: configured,
          getIntro: configured,
          requestIntro: configured,
          respondToIntro: configured,
        },
        notes: [
          configured
            ? `HTTP client pointed at ${options.baseUrl}. If that is the local reference server, responses are fixture data.`
            : API_NOT_PUBLISHED,
          "This client speaks spec/openapi.yaml. It does not call undocumented Boardy hosts.",
          "Auth is a bearer token or X-API-Key you supply. This server does not run an OAuth flow itself.",
        ],
        docs: {
          agents: DOCS.agents,
          agentskill: DOCS.agentskill,
          faq: DOCS.faq,
          chatgptHelp: DOCS.chatgptHelp,
          proposal: "spec/openapi.yaml",
        },
      };
    },
    async getProfile() {
      return call<Profile>("v1/me");
    },
    async updateLookingFor(input: UpdateLookingForArgs) {
      return call<Profile>("v1/me/looking-for", {
        method: "PATCH",
        body: JSON.stringify({
          lookingFor: input.items,
          howItsGoing: input.howItsGoing,
          biggestProblem: input.biggestProblem,
          asOf: input.asOf,
        }),
      });
    },
    async listIntros(filter) {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.limit) params.set("limit", String(filter.limit));
      if (filter.cursor) params.set("cursor", filter.cursor);
      const query = params.size ? `?${params.toString()}` : "";
      const body = await call<{ intros: Intro[]; nextCursor?: string | null }>(`v1/intros${query}`);
      return { items: body.intros, nextCursor: body.nextCursor ?? undefined };
    },
    async getIntro(id: string) {
      return call<Intro>(`v1/intros/${encodeURIComponent(id)}`);
    },
    async requestIntro(input: RequestRecord) {
      const body = await call<{ intro: Intro }>("v1/intro-requests", {
        method: "POST",
        idempotencyKey: input.clientRequestId,
        body: JSON.stringify({
          goal: input.goal,
          subject: input.draft.subject,
          body: input.draft.body,
          linkedinUrl: linkedinFromBody(input.draft.body),
        }),
      });
      return { intro: body.intro, emailSent: false };
    },
    async respondToIntro(input: RespondRecord) {
      const body = await call<{ intro: Intro }>(`v1/intros/${encodeURIComponent(input.introId)}/responses`, {
        method: "POST",
        body: JSON.stringify({
          decision: input.decision,
          reason: input.reason,
          times: input.times,
        }),
      });
      return body.intro;
    },
  };
}

function linkedinFromBody(body: string): string | undefined {
  const line = body.split("\n").find((entry) => entry.startsWith("LinkedIn: "));
  return line?.slice("LinkedIn: ".length).trim();
}
