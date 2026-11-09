# What Boardy would do to make this live

This server is a starter, not a hosted Boardy product. A person can demo the tools today on invented data. They cannot sign in to their real Boardy account from Claude, ChatGPT, or Cursor through this repo alone.

Checked 9 Nov 2026, from public pages only:

- No public Boardy REST API, SDK, or MCP server. [agents.md](https://www.boardy.ai/agents.md), [llms.txt](https://www.boardy.ai/llms.txt), and [APIs.io](https://apis.io/providers/boardy/) (0 APIs).
- Assistants are told to email `boardy@boardy.ai`.
- The ChatGPT app can accept a match, decline with a reason, and show intros in progress, inside ChatGPT. That is not a public API. [ChatGPT plugin help](https://www.boardy.ai/chatgpt-plugin/help).
- Production MCP servers people already use are hosted HTTPS endpoints with OAuth: [GitHub](https://github.com/github/github-mcp-server) at `https://api.githubcopilot.com/mcp/`, [Stripe](https://docs.stripe.com/mcp) at `https://mcp.stripe.com`, [Linear](https://linear.app/docs/mcp) at `https://mcp.linear.app/mcp`, [Notion](https://developers.notion.com/guides/mcp/get-started-with-mcp) at `https://mcp.notion.com/mcp`, [Sentry](https://mcp.sentry.dev/) at `https://mcp.sentry.dev/mcp`, [Cloudflare](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/) at `https://mcp.cloudflare.com/mcp`.

Sizes below are engineering-size estimates, not calendar dates. Small means one config and a deploy of code that already exists. Medium means a new service with a reviewed security design. Large means product and data-model work on Boardy's side.

## What is already plug and play

- Local stdio server. Claude Desktop and Cursor can spawn `node dist/index.js` and call the tools. The answers are fixture data unless you change `BOARDY_BACKEND`.
- Email drafts that follow the public brief. Sending still needs the user's mailbox, their approval of the exact body, and optional SMTP.
- Streamable HTTP on `127.0.0.1`. MCP Inspector and the smoke script both call `tools/list` and a tool. With no `BOARDY_AUTH`, this port is open on the loopback interface. Do not expose that mode on a public interface.
- Tool titles, `readOnlyHint` or `destructiveHint`, structured output, and cursor pagination on `list_intros`.
- `server.json` for the MCP Registry schema `2025-12-11`, namespace `io.github.adamtpang/boardy`, npm package name `boardy-mcp`. The name was not on the npm registry when this file was written. The file has no `remotes` entry, because there is no public URL.
- An OAuth resource-server gate. `BOARDY_AUTH=oauth` serves protected resource metadata and returns `401` with a `WWW-Authenticate` challenge. It checks tokens by RFC 7662 introspection, or by a localhost-only dev bearer. It does not issue tokens.

## What is not plug and play

1. **There is no Boardy API to call.** The http backend and `spec/openapi.yaml` are a proposal. The status names are not field names from a Boardy response.
2. **There is no hosted URL.** Claude's directory and ChatGPT's custom connector both want a public `https://` server. A laptop on stdio does not qualify. Claude's submission page says a local server cannot be submitted on its own: [Submit a connector](https://claude.com/docs/connectors/building/submission).
3. **There is no authorization server.** The MCP authorization spec says the resource server and the authorization server are different roles. This repo is only the resource server. It does not implement the authorize endpoint, the token endpoint, PKCE, dynamic client registration, or Client ID Metadata Documents. Those belong to an authorization server Boardy runs, or to an identity product they already trust. Spec: [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization). ChatGPT's connector rules match that shape: [Authentication](https://developers.openai.com/plugins/build/auth).
4. **Nothing is listed.** `server.json` is not published to [registry.modelcontextprotocol.io](https://modelcontextprotocol.io/registry/quickstart). The npm package is not published, so `npx boardy-mcp` will not work until someone publishes it. Claude's directory and OpenAI's plugin review are separate submissions.
5. **The mock and the email backend do not see the user's real intros.** Logging in with a future token does not create that data. The http backend has to be pointed at a real API, and the token has to be one that API accepts.
6. **Per-tool scopes are one gate today.** The HTTP gate requires every advertised scope (`profile:read`, `profile:write`, `intros:read`, `intros:request`, `intros:respond`). A read-only token is rejected. Splitting that per tool is still to do.
7. **Origin filtering is incomplete on a public host.** Loopback keeps the SDK's localhost Origin check. A public `BOARDY_PUBLIC_URL` checks the Host header and, unless `BOARDY_ALLOWED_ORIGINS` is set, does not filter Origin. Bearer tokens are not cookies, but Boardy should set the allowlist before a public launch.

## Checklist

### 1. Decide the API. Estimate: large

Either implement `spec/openapi.yaml` or change `src/backend/http.ts` to the paths Boardy actually ships. Keep the rules that are already public:

- Both people agree before an introduction goes out. [FAQ](https://www.boardy.ai/faq).
- Email and phone stay out of the payload until both have agreed.
- A decline includes a reason. [ChatGPT plugin help](https://www.boardy.ai/chatgpt-plugin/help).
- Do not invent a numeric cap. The FAQ says caps exist and does not publish the numbers. Return 429.

The reference server (`node dist/index.js api`, token `fixture`) is a fixture implementation of the proposal. It is not a Boardy environment.

### 2. Issue user tokens. Estimate: medium

Run an authorization server that:

- Speaks OAuth 2.1 authorization code with PKCE (`S256`).
- Publishes metadata at `/.well-known/oauth-authorization-server` or OpenID Connect discovery. Clients discover it from the issuer in the protected resource metadata.
- Puts this MCP server's public URL in the token audience (`aud`), because this server rejects a token with no matching audience.
- Supports either Client ID Metadata Documents or dynamic client registration. The MCP spec says CIMD is the preferred option and DCR is the compatibility option. ChatGPT supports both, plus a pre-registered client. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [OpenAI auth](https://developers.openai.com/plugins/build/auth).
- Exposes RFC 7662 introspection, or Boardy replaces `src/auth/verifier.ts` with JWT validation against their JWKS. Introspection is the hook that exists today. JWT validation is not written.

Then set:

```bash
BOARDY_AUTH=oauth
BOARDY_PUBLIC_URL=https://mcp.boardy.ai/mcp
BOARDY_OAUTH_ISSUER=https://auth.boardy.ai
BOARDY_INTROSPECTION_URL=https://auth.boardy.ai/oauth/introspect
BOARDY_BACKEND=http
BOARDY_API_BASE_URL=https://api.boardy.ai
```

`mcp.boardy.ai`, `auth.boardy.ai`, and `api.boardy.ai` are names in this proposal. They were not live endpoints when this was written.

Do not set `BOARDY_DEV_BEARER` in production. Do not set `BOARDY_ALLOW_DEV_BEARER=1` on a public host.

When a request carries a bearer token and the backend is `http`, that token is forwarded as `Authorization: Bearer` to `BOARDY_API_BASE_URL`. The API has to accept the same token, or Boardy should exchange it for an API credential inside the verifier. That exchange is not written.

### 3. Host the process. Estimate: small, once the API and the authorization server exist

`node dist/index.js http` already serves Streamable HTTP on `/mcp`. Put it behind HTTPS on the host named by `BOARDY_PUBLIC_URL`. Bind it so the public hostname is the one clients use. Health is `GET /health` and does not require a token.

Add a `remotes` entry to `server.json` only after that URL answers:

```json
{
  "type": "streamable-http",
  "url": "https://mcp.boardy.ai/mcp"
}
```

### 4. Publish the package and the registry entry. Estimate: small

- `npm publish` for `boardy-mcp` (the `prepublishOnly` script builds `dist/`). The bin is `boardy-mcp`, which speaks stdio. Confirm the npm name still belongs to you before you publish.
- Install the publisher and publish `server.json` with the namespace you can prove. `io.github.adamtpang/boardy` matches the GitHub user who owns this repo. A `com.boardy/...` name requires proof of the `boardy.com` domain. Guide: [Publish to the MCP Registry](https://modelcontextprotocol.io/registry/quickstart). The registry checks that the npm package exists and that you own it.
- This file is not a listing. Publishing is a separate step, and it has not been done.

### 5. Submit to the client directories. Estimate: small, after the HTTPS server and OAuth work

These are reviews, not a config flag in this repo.

- Claude: remote connectors are submitted at [claude.ai/directory/manage](https://claude.com/docs/connectors/building/submission). The page requires an `https://` URL, a `title` on every tool, and a `readOnlyHint` or `destructiveHint` annotation. Those annotations are already on the tools. The page also asks for a docs URL, a privacy policy, a support contact, an icon, and reviewer credentials. A privacy policy and an icon are not in this repo.
- ChatGPT: a custom connector takes the server URL and OAuth. Docs: [Build MCP servers](https://developers.openai.com/api/docs/mcp) and [Add a custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server). Custom servers do not need `search` and `fetch` tools. A public plugin review is a further step: [Remote MCP review](https://developers.openai.com/plugins/deploy/app-review).
- Cursor and Claude Desktop can also add the URL directly, with no directory, the same way they add Stripe or Notion. That still needs the hosted server and a working login.

### 6. Leave these alone until Boardy publishes them

- Reading the user's inbox for replies from `boardy@boardy.ai`. The public guide tells an assistant who already has mail access to notice those messages. This server does not connect to mail.
- Scraping boardy.ai or calling undocumented hosts.
- A numeric rate limit. Publish the real cap, then fill in the 429 body.

## How this compares

| | This repo today | GitHub, Stripe, Linear, Notion, Sentry, Cloudflare |
| --- | --- | --- |
| User opens Claude and sees their real account | No | Yes, after OAuth or a token those products issue |
| Where it runs | The user's machine, stdio or loopback HTTP | Their HTTPS host |
| Login | None by default. Optional resource-server gate if you bring an authorization server | OAuth on the hosted server. Several also accept a bearer or API key |
| SDK | Official TypeScript SDK v2 | GitHub uses the Go SDK. Sentry's catalog pins TypeScript v2 and v1. The others document the URL, not this repo's stack |
| Registry `server.json` | In the repo, not published | Their own listings |

The gap is the product behind the tools, not another MCP framework.
