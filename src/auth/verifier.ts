import { createHash, timingSafeEqual } from "node:crypto";
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { currentHost } from "./request.js";

export interface VerifierOptions {
  resource: URL;
  scopes: readonly string[];
  devBearer?: string;
  allowDevBearerOffLoopback: boolean;
  introspectionUrl?: string;
  introspectionAuthorization?: string;
  fetchImpl?: typeof fetch;
}

export function createTokenVerifier(options: VerifierOptions): OAuthTokenVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (options.devBearer && safeEqual(token, options.devBearer)) {
        if (!devBearerAllowed(options.allowDevBearerOffLoopback)) {
          throw new OAuthError(
            OAuthErrorCode.InvalidToken,
            "The dev bearer is a localhost shared secret, not an OAuth access token. It is refused for this host.",
          );
        }
        return authInfo(token, "dev-bearer", [...options.scopes], options.resource);
      }
      if (!options.introspectionUrl) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          "This server does not accept that token. Set BOARDY_INTROSPECTION_URL to your authorization server, or use the localhost dev bearer.",
        );
      }
      return introspect(token, options, fetchImpl);
    },
  };
}

function devBearerAllowed(allowOffLoopback: boolean): boolean {
  if (allowOffLoopback) return true;
  const raw = currentHost() ?? "";
  const host = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : (raw.split(":")[0] ?? raw);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

async function introspect(token: string, options: VerifierOptions, fetchImpl: typeof fetch): Promise<AuthInfo> {
  let response: Response;
  try {
    const headers = new Headers({
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    });
    if (options.introspectionAuthorization) {
      headers.set(
        "authorization",
        options.introspectionAuthorization.startsWith("Bearer ")
          ? options.introspectionAuthorization
          : `Bearer ${options.introspectionAuthorization}`,
      );
    }
    response = await fetchImpl(options.introspectionUrl!, {
      method: "POST",
      headers,
      body: new URLSearchParams({ token }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "introspection failed";
    throw new OAuthError(OAuthErrorCode.ServerError, `Token introspection could not be reached: ${message}`);
  }

  if (!response.ok) {
    throw new OAuthError(OAuthErrorCode.ServerError, `Token introspection returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    active?: boolean;
    scope?: string;
    exp?: number;
    client_id?: string;
    sub?: string;
    aud?: string | string[];
  };

  if (body.active !== true || typeof body.exp !== "number") {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "The authorization server says this token is not active.");
  }

  const audiences = body.aud === undefined ? [] : Array.isArray(body.aud) ? body.aud : [body.aud];
  if (!audiences.some((value) => sameResource(value, options.resource))) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "The token has no audience for this MCP server. The authorization server must set aud to the resource URL.",
    );
  }

  const scopes = (body.scope ?? "").split(/\s+/).filter(Boolean);
  const missing = options.scopes.filter((scope) => !scopes.includes(scope));
  if (missing.length > 0) {
    throw new OAuthError(OAuthErrorCode.InsufficientScope, `The token is missing scopes: ${missing.join(" ")}`);
  }

  return authInfo(token, body.client_id || body.sub || "unknown", scopes, options.resource, body.exp);
}

function authInfo(token: string, clientId: string, scopes: string[], resource: URL, expiresAt?: number): AuthInfo {
  return {
    token,
    clientId,
    scopes,
    expiresAt: expiresAt ?? Math.floor(Date.now() / 1000) + 60 * 60,
    resource,
  };
}

function sameResource(audience: string, resource: URL): boolean {
  try {
    const url = new URL(audience);
    const left = url.href.replace(/\/$/, "");
    const right = resource.href.replace(/\/$/, "");
    return left === right;
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}
