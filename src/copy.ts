/** People and introductions shipped with the mock backend. Not a Boardy account. */
export const FIXTURE_BANNER =
  "Fixture data. These people and introductions are invented for the demo. Nothing here is a Boardy account, and nothing was sent to Boardy.";

export const LOCAL_CONFIG_BANNER =
  "This brief comes from local configuration. Boardy was not queried, and Boardy has not confirmed it.";

export const DRAFT_NOT_SENT =
  "Nothing was sent. Show the user the To address, the From address, the subject, and the full body. Send only after they approve that exact text. Sending shares the contents with Boardy.";

export const EMAIL_UNSUPPORTED =
  "Boardy's public agent guide can send a brief to boardy@boardy.ai. It cannot list introductions, read a profile back, or record an accept or decline. Those need the API proposed in spec/openapi.yaml. The mock backend can demo them with fixture data.";

export const API_NOT_PUBLISHED =
  "BOARDY_API_BASE_URL is not set. Boardy has not published this API. spec/openapi.yaml is a proposal, and the local reference server (boardy-mcp api) can exercise it with fixture data.";

export const SERVER_INSTRUCTIONS = [
  "Unofficial Boardy MCP. Not affiliated with Boardy.",
  "The default backend is fixture data and never contacts Boardy.",
  "Do not email boardy@boardy.ai until the user approves the exact text, from their own mailbox.",
  "An introduction happens only after both people agree. Do not invent email, phone, or status.",
  "If a tool says this backend cannot do it, tell the user that.",
  "Status names here are a proposal, not a Boardy API.",
].join(" ");

export const DOCS = {
  agents: "https://www.boardy.ai/agents.md",
  agentskill: "https://www.boardy.ai/agentskill.md",
  faq: "https://www.boardy.ai/faq",
  chatgptHelp: "https://www.boardy.ai/chatgpt-plugin/help",
  llms: "https://www.boardy.ai/llms.txt",
  apisIo: "https://apis.io/providers/boardy/",
} as const;
