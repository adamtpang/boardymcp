import { MCP_SCOPES } from "./auth/scopes.js";
import type { LocalIdentity } from "./domain.js";
import { BoardyError } from "./errors.js";
import type { SmtpConfig } from "./mail.js";

export interface OAuthSettings {
  /** Canonical MCP URL. Clients send this as the RFC 8707 resource. */
  resource: URL;
  /** Authorization server issuer. This process does not issue tokens. */
  issuer: string;
  scopes: string[];
  devBearer?: string;
  allowDevBearerOffLoopback: boolean;
  introspectionUrl?: string;
  introspectionAuthorization?: string;
  allowedOrigins: string[];
}

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
  oauth?: OAuthSettings;
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

  const host = clean(env.BOARDY_HTTP_HOST) ?? "127.0.0.1";
  const listenPort = port(env.PORT, 3000, "PORT");
  const oauth = loadOAuth(env, host, listenPort);

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
    host,
    port: listenPort,
    apiPort: port(env.BOARDY_API_PORT, 8787, "BOARDY_API_PORT"),
    referenceToken: clean(env.BOARDY_REFERENCE_TOKEN) ?? "fixture",
    identity,
    smtp: smtp?.from ? smtp : undefined,
    apiBaseUrl: clean(env.BOARDY_API_BASE_URL),
    apiToken: clean(env.BOARDY_API_TOKEN),
    apiKey: clean(env.BOARDY_API_KEY),
    oauth,
  };
}

function loadOAuth(env: NodeJS.ProcessEnv, host: string, listenPort: number): OAuthSettings | undefined {
  const mode = clean(env.BOARDY_AUTH) ?? "off";
  if (mode === "off") return undefined;
  if (mode !== "oauth") {
    throw new BoardyError("BOARDY_AUTH must be off or oauth.", "validation");
  }

  const issuer = clean(env.BOARDY_OAUTH_ISSUER);
  if (!issuer) {
    throw new BoardyError(
      "BOARDY_AUTH=oauth requires BOARDY_OAUTH_ISSUER. That is your authorization server's issuer URL. This process does not issue tokens, run dynamic client registration, or publish Client ID Metadata Documents.",
      "not_configured",
    );
  }

  const resourceRaw = clean(env.BOARDY_PUBLIC_URL) ?? `http://${host}:${listenPort}/mcp`;
  let resource: URL;
  try {
    resource = new URL(resourceRaw);
  } catch {
    throw new BoardyError("BOARDY_PUBLIC_URL must be an absolute URL, including the /mcp path.", "validation");
  }
  if (resource.hash || resource.search) {
    throw new BoardyError("BOARDY_PUBLIC_URL must not have a query or fragment.", "validation");
  }

  const devBearer = clean(env.BOARDY_DEV_BEARER);
  const introspectionUrl = clean(env.BOARDY_INTROSPECTION_URL);
  if (!devBearer && !introspectionUrl) {
    throw new BoardyError(
      "BOARDY_AUTH=oauth needs a way to check tokens. Set BOARDY_INTROSPECTION_URL to an RFC 7662 introspection endpoint, or BOARDY_DEV_BEARER for a localhost-only shared secret. Unsigned tokens are rejected.",
      "not_configured",
    );
  }

  return {
    resource,
    issuer,
    scopes: [...MCP_SCOPES],
    devBearer,
    allowDevBearerOffLoopback: clean(env.BOARDY_ALLOW_DEV_BEARER) === "1",
    introspectionUrl,
    introspectionAuthorization: clean(env.BOARDY_INTROSPECTION_AUTHORIZATION),
    allowedOrigins: (clean(env.BOARDY_ALLOWED_ORIGINS) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
