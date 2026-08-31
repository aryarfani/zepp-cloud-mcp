import { describe, expect, it } from "vitest";
import { parseDateRange, previousIsoDate } from "../src/time";

describe("parseDateRange", () => {
  it("accepts exactly 31 inclusive days", () => {
    const range = parseDateRange("2026-08-01", "2026-08-31", "Asia/Jakarta");
    expect(range.days).toBe(31);
  });

  it("rejects 32 inclusive days", () => {
    expect(() => parseDateRange("2026-07-31", "2026-08-31", "Asia/Jakarta")).toThrow(/31/);
  });

  it("uses the configured timezone rather than UTC day boundaries", () => {
    const range = parseDateRange("2026-08-31", "2026-08-31", "Asia/Jakarta");
    expect(range.startIso).toContain("+07:00");
    expect(range.fromSec).toBe(Math.floor(range.fromMs / 1000));
  });

  it("returns the previous ISO date", () => {
    expect(previousIsoDate("2026-03-01")).toBe("2026-02-28");
  });
});
