import { describe, expect, it } from "vitest";
import { ZeppError } from "../src/errors";
import { fromError, noData } from "../src/response";

describe("response envelopes", () => {
  it("preserves a no-data distinction", () => {
    expect(noData("Asia/Jakarta").status).toBe("no_data");
  });

  it("maps Zepp auth error without leaking diagnostics", () => {
    const env = fromError(new ZeppError("auth_expired", "expired", 401), "Asia/Jakarta");
    expect(env).toMatchObject({ status: "auth_expired", data: null });
    expect(JSON.stringify(env)).not.toContain("apptoken");
  });
});
