import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("public HTTP surface", () => {
  it("serves local health without auth", async () => {
    const response = await SELF.fetch("https://example.test/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("does not expose configured identifiers on root", async () => {
    const response = await SELF.fetch("https://example.test/");
    const text = await response.text();
    expect(text).not.toContain("1234567890");
    expect(text).not.toContain("api-mifit-us3");
  });

  it("rejects unauthenticated mcp", async () => {
    const response = await SELF.fetch("https://example.test/mcp", { method: "POST" });
    expect(response.status).toBe(401);
  });
});
