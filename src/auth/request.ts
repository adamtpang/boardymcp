import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestAuth {
  token?: string;
  host?: string;
}

export const requestAuth = new AsyncLocalStorage<RequestAuth>();

/** Bearer token for this HTTP request, when the OAuth gate accepted one. */
export function currentAccessToken(): string | undefined {
  return requestAuth.getStore()?.token;
}

export function currentHost(): string | undefined {
  return requestAuth.getStore()?.host;
}
