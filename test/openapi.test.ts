import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface OpenApiDoc {
  openapi: string;
  info: { title: string; description: string };
  paths: Record<string, unknown>;
  components: {
    securitySchemes: Record<string, { type: string }>;
  };
}

describe("proposed OpenAPI document", () => {
  const doc = parse(readFileSync(new URL("../spec/openapi.yaml", import.meta.url), "utf8")) as OpenApiDoc;

  it("is a proposal, with OAuth and an API key, and the routes the MCP client calls", () => {
    expect(doc.openapi.startsWith("3.1")).toBe(true);
    expect(doc.info.description.toLowerCase()).toContain("proposal");
    expect(doc.info.description.toLowerCase()).toContain("not a published boardy api");
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual(["apiKey", "oauth2"]);
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/v1/intro-requests",
      "/v1/intros",
      "/v1/intros/{introId}",
      "/v1/intros/{introId}/responses",
      "/v1/me",
      "/v1/me/looking-for",
    ]);
  });
});
