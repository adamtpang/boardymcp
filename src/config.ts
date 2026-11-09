import type { LocalIdentity } from "./domain.js";
import { BoardyError } from "./errors.js";
import type { SmtpConfig } from "./mail.js";

export interface AppConfig {
  backend: "mock" | "email" | "http";
  host: string;
  port: number;
  apiPort: number;
  referenceToken: string;
  identity: LocalIdentity;
  smtp?: SmtpConfig;
  apiBaseUrl?: string;
  apiToken?: string;
  apiKey?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function port(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new BoardyError(`${name} must be a TCP port.`, "validation");
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const backend = clean(env.BOARDY_BACKEND) ?? "mock";
  if (backend !== "mock" && backend !== "email" && backend !== "http") {
    throw new BoardyError("BOARDY_BACKEND must be mock, email, or http.", "validation");
  }

  const identity: LocalIdentity = {
    assistantName: clean(env.BOARDY_ASSISTANT_NAME) ?? "Boardy MCP",
    fullName: clean(env.BOARDY_USER_NAME),
    email: clean(env.BOARDY_USER_EMAIL),
    role: clean(env.BOARDY_USER_ROLE),
    company: clean(env.BOARDY_USER_COMPANY),
    location: clean(env.BOARDY_USER_LOCATION),
    linkedinUrl: clean(env.BOARDY_USER_LINKEDIN),
    xUrl: clean(env.BOARDY_USER_X),
    githubUrl: clean(env.BOARDY_USER_GITHUB),
    websiteUrl: clean(env.BOARDY_USER_WEBSITE),
  };

  const smtpHost = clean(env.BOARDY_SMTP_HOST);
  const smtp = smtpHost
    ? {
        host: smtpHost,
        port: port(env.BOARDY_SMTP_PORT, 587, "BOARDY_SMTP_PORT"),
        user: clean(env.BOARDY_SMTP_USER),
        pass: env.BOARDY_SMTP_PASS,
        from: clean(env.BOARDY_SMTP_FROM) ?? identity.email ?? "",
      }
    : undefined;
  if (smtp && !smtp.from) {
    throw new BoardyError("BOARDY_SMTP_FROM or BOARDY_USER_EMAIL is required when SMTP is configured.", "not_configured");
  }

  return {
    backend,
    host: clean(env.BOARDY_HTTP_HOST) ?? "127.0.0.1",
    port: port(env.PORT, 3000, "PORT"),
    apiPort: port(env.BOARDY_API_PORT, 8787, "BOARDY_API_PORT"),
    referenceToken: clean(env.BOARDY_REFERENCE_TOKEN) ?? "fixture",
    identity,
    smtp: smtp?.from ? smtp : undefined,
    apiBaseUrl: clean(env.BOARDY_API_BASE_URL),
    apiToken: clean(env.BOARDY_API_TOKEN),
    apiKey: clean(env.BOARDY_API_KEY),
  };
}
