import { describe, expect, it } from "vitest";
import { ZeppError } from "../src/errors";
import { fromError } from "../src/response";

describe("public error sanitization", () => {
  it("does not echo arbitrary upstream messages", () => {
    const secretish = "upstream said apptoken=SHOULD_NOT_LEAK and private payload";
    const envelope = fromError(new ZeppError("upstream_error", secretish, 500), "Asia/Jakarta");
    expect(JSON.stringify(envelope)).not.toContain(secretish);
    expect(JSON.stringify(envelope)).not.toContain("SHOULD_NOT_LEAK");
    expect(envelope.status).toBe("upstream_error");
  });

  it("returns only the rotation instruction for expired Zepp auth", () => {
    const envelope = fromError(new ZeppError("auth_expired", "raw upstream credential detail", 401), "Asia/Jakarta");
    expect(envelope.meta.warnings).toEqual(["ZEPP_APP_TOKEN must be replaced in Cloudflare Worker secrets."]);
  });
});
