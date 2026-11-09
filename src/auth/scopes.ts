/** Scopes advertised on the resource metadata. They match spec/openapi.yaml. */
export const MCP_SCOPES = [
  "profile:read",
  "profile:write",
  "intros:read",
  "intros:request",
  "intros:respond",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];
