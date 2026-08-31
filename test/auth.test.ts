import { describe, expect, it } from "vitest";
import { requireBearer } from "../src/auth";
import { parseConfig } from "../src/config";

describe("requireBearer", () => {
  it("accepts exactly the configured bearer token", () => {
    const request = new Request("https://example.test/mcp", {
      headers: { authorization: "Bearer mcp-secret" }
    });
    expect(requireBearer(request, "mcp-secret")).toBe(true);
  });

  it("rejects missing, wrong-scheme, and wrong tokens", () => {
    expect(requireBearer(new Request("https://example.test/mcp"), "s")).toBe(false);
    expect(requireBearer(new Request("https://example.test/mcp", { headers: { authorization: "Basic s" } }), "s")).toBe(false);
    expect(requireBearer(new Request("https://example.test/mcp", { headers: { authorization: "Bearer x" } }), "s")).toBe(false);
  });
});

describe("parseConfig", () => {
  it("accepts the approved region and derives us3", () => {
    const config = parseConfig({
      MCP_SECRET: "mcp",
      ZEPP_APP_TOKEN: "zepp",
      ZEPP_USER_ID: "1234567890",
      ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
      USER_TIMEZONE: "Asia/Jakarta"
    });
    expect(config.regionLabel).toBe("us3");
  });

  it("rejects non-Zepp hosts and non-numeric user ids", () => {
    expect(() => parseConfig({
      MCP_SECRET: "mcp",
      ZEPP_APP_TOKEN: "zepp",
      ZEPP_USER_ID: "abc",
      ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
      USER_TIMEZONE: "Asia/Jakarta"
    })).toThrow();
    expect(() => parseConfig({
      MCP_SECRET: "mcp",
      ZEPP_APP_TOKEN: "zepp",
      ZEPP_USER_ID: "1234567890",
      ZEPP_REGION_HOST: "https://evil.example",
      USER_TIMEZONE: "Asia/Jakarta"
    })).toThrow();
  });
});
