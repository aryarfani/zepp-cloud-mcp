import { describe, expect, it } from "vitest";
import { makeCacheKey, withZeppCache } from "../src/cache";

describe("Zepp cache", () => {
  it("hashes normalized request data and never includes secrets in the cache URL", async () => {
    const key = await makeCacheKey("heartRate", { start: 1, end: 2 });
    expect(key).toMatch(/^https:\/\/cache\.zepp-mcp\.invalid\//);
    expect(key).not.toContain("secret-zepp-token");
    expect(key).not.toContain("mcp-secret");
  });

  it("does not cache rejected loaders", async () => {
    await expect(withZeppCache("x", { id: 1 }, 120, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});
