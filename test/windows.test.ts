import { describe, expect, it, vi } from "vitest";
import { InputError, ZeppError } from "../src/errors";
import { fromError, noData, ok, type Envelope } from "../src/response";
import { MAX_RANGE_DAYS, parseDateRange, splitDateRange } from "../src/time";
import { mergeByKey, NO_PACING, runWindows } from "../src/zepp/windows";

const TZ = "Asia/Jakarta";
const range = (a: string, b: string) => parseDateRange(a, b, TZ);

describe("splitDateRange", () => {
  it("returns one window for a range that fits", () => {
    expect(splitDateRange("2026-10-01", "2026-10-31", 31)).toEqual([{ startDate: "2026-10-01", endDate: "2026-10-31" }]);
    expect(splitDateRange("2026-10-15", "2026-10-15", 14)).toEqual([{ startDate: "2026-10-15", endDate: "2026-10-15" }]);
  });

  it("splits at exact boundaries, aligned to the range end, oldest first", () => {
    expect(splitDateRange("2026-10-01", "2026-10-28", 14)).toEqual([
      { startDate: "2026-10-01", endDate: "2026-10-14" },
      { startDate: "2026-10-15", endDate: "2026-10-28" }
    ]);
    // 15 days with 14-day windows: the short window is the oldest one
    expect(splitDateRange("2026-10-01", "2026-10-15", 14)).toEqual([
      { startDate: "2026-10-01", endDate: "2026-10-01" },
      { startDate: "2026-10-02", endDate: "2026-10-15" }
    ]);
  });

  it("can return newest window first", () => {
    const windows = splitDateRange("2026-10-01", "2026-10-15", 14, true);
    expect(windows[0]).toEqual({ startDate: "2026-10-02", endDate: "2026-10-15" });
    expect(windows[1]).toEqual({ startDate: "2026-10-01", endDate: "2026-10-01" });
  });

  it("covers every day exactly once for a 366-day range, across a leap day", () => {
    const windows = splitDateRange("2023-10-16", "2024-10-15", 31);
    const days = windows.reduce((n, w) => n + (Date.parse(w.endDate) - Date.parse(w.startDate)) / 86_400_000 + 1, 0);
    expect(days).toBe(366);
    expect(windows.every(w => (Date.parse(w.endDate) - Date.parse(w.startDate)) / 86_400_000 + 1 <= 31)).toBe(true);
    for (let i = 1; i < windows.length; i++) expect((Date.parse(windows[i]!.startDate) - Date.parse(windows[i - 1]!.endDate)) / 86_400_000).toBe(1);
  });
});

describe("range cap and input errors", () => {
  it("allows exactly 366 days and rejects 367 with a specific InputError", () => {
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(() => range("2025-10-15", "2026-10-15")).not.toThrow();
    let error: unknown;
    try { range("2025-10-14", "2026-10-15"); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(InputError);
    expect((error as Error).message).toBe("Date range is 367 days (2025-10-14 to 2026-10-15); the maximum is 366 days per call. Use a shorter range or split the request.");
  });

  it.each([
    [() => range("2026-10-16", "2026-10-15"), /start_date \(2026-10-16\) must be on or before end_date \(2026-10-15\)/],
    [() => range("2026/10/01", "2026-10-15"), /YYYY-MM-DD/],
    [() => range("2026-02-30", "2026-03-01"), /Invalid calendar date/],
    [() => parseDateRange("2026-10-01", "2026-10-15", "Not/AZone"), /Invalid timezone/]
  ])("explains bad input #%#", (call, message) => {
    expect(call).toThrow(InputError);
    expect(call).toThrow(message);
  });

  it("maps InputError to invalid_request with the message, and a local unsupported error to its message", () => {
    const env = fromError(new InputError("limit must be an integer from 1 to 2000"), TZ);
    expect(env).toMatchObject({ status: "invalid_request", data: null });
    expect(env.meta.warnings).toEqual(["limit must be an integer from 1 to 2000"]);
    const unsupported = fromError(new ZeppError("unsupported", "Unknown workout_id", 400), TZ);
    expect(unsupported.meta.warnings).toEqual(["Unknown workout_id"]);
  });

  it("keeps unexpected errors generic and free of secrets", () => {
    const env = fromError(new Error("boom apptoken=SECRET-TOKEN at /home/ubuntu/app.js:1\n    at stack"), TZ);
    const text = JSON.stringify(env);
    expect(text).toContain("Unexpected internal error");
    expect(text).not.toMatch(/SECRET-TOKEN|boom|stack|\/home\//);
    const upstream = fromError(new ZeppError("upstream_error", "HTTP 500 body apptoken=SECRET-TOKEN", 500), TZ);
    expect(JSON.stringify(upstream)).not.toContain("SECRET-TOKEN");
  });
});

type Row = { k: string; v: number };
const row = (k: string, v = 0): Row => ({ k, v });
const merge = (parts: Row[][]) => mergeByKey(parts, r => r.k, (a, b) => a.k.localeCompare(b.k));

describe("mergeByKey", () => {
  it("dedupes by key keeping the first row, and sorts", () => {
    expect(mergeByKey([[row("b", 1), row("a", 1)], [row("b", 2), row("c", 2)]], r => r.k, (a, b) => a.k.localeCompare(b.k)))
      .toEqual([row("a", 1), row("b", 1), row("c", 2)]);
  });
  it("combines duplicates when asked", () => {
    expect(mergeByKey([[row("a", 1)], [row("a", 2)]], r => r.k, (a, b) => a.k.localeCompare(b.k), (a, b) => ({ k: a.k, v: a.v + b.v })))
      .toEqual([row("a", 3)]);
  });
});

describe("runWindows", () => {
  const long = range("2026-07-18", "2026-10-15"); // 90 days -> 3 windows of 31
  const seen = (fn: (r: ReturnType<typeof range>) => Envelope<Row[]>) => {
    const calls: string[] = [];
    const fetch = vi.fn(async (w: ReturnType<typeof range>) => { calls.push(`${w.startDate}..${w.endDate}`); return fn(w); });
    return { calls, fetch };
  };

  it("passes a range that fits one window straight through (same range object, one call)", async () => {
    const { calls, fetch } = seen(() => ok([row("a")], TZ));
    const short = range("2026-10-01", "2026-10-31");
    const result = await runWindows(short, 31, NO_PACING, fetch, merge);
    expect(calls).toEqual(["2026-10-01..2026-10-31"]);
    expect(fetch).toHaveBeenCalledWith(short);
    expect(result.status).toBe("ok");
  });

  it("fetches sequentially oldest first with a pause between windows, then merges and dedupes", async () => {
    const sleep = vi.fn(async () => {});
    const { calls, fetch } = seen(w => ok([row(w.startDate), row("shared")], TZ));
    const result = await runWindows(long, 31, { delayMs: 250, sleep }, fetch, merge);
    expect(calls).toEqual(["2026-07-18..2026-08-14", "2026-08-15..2026-09-14", "2026-09-15..2026-10-15"]);
    expect(calls[2]!.endsWith("2026-10-15")).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(result.status).toBe("ok");
    expect(result.data).toHaveLength(4); // three distinct window keys + one shared key
    expect(new Set(result.data!.map(r => r.k)).size).toBe(4);
  });

  it("returns no_data when every window is empty", async () => {
    const { fetch } = seen(() => noData(TZ));
    expect((await runWindows(long, 31, NO_PACING, fetch, merge)).status).toBe("no_data");
  });

  it("returns partial with the failed window named when one window fails", async () => {
    let n = 0;
    const { fetch } = seen(w => (++n === 2 ? (fromError(new ZeppError("upstream_error", "HTTP 500", 500), TZ) as Envelope<Row[]>) : ok([row(w.startDate)], TZ)));
    const result = await runWindows(long, 31, NO_PACING, fetch, merge);
    expect(result.status).toBe("partial");
    expect(result.meta.partial).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.meta.warnings.some(w => /^\d{4}-\d\d-\d\d to \d{4}-\d\d-\d\d: upstream_error$/.test(w))).toBe(true);
  });

  it("converts a thrown ZeppError per window, and returns the first failure when nothing succeeded", async () => {
    const fetch = vi.fn(async () => { throw new ZeppError("upstream_error", "HTTP 500", 500); });
    const result = await runWindows(long, 31, NO_PACING, fetch, merge);
    expect(result.status).toBe("upstream_error");
    expect(result.data).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops immediately on auth_expired and on rate limiting", async () => {
    const auth = vi.fn(async () => { throw new ZeppError("auth_expired", "expired", 401); });
    expect((await runWindows(long, 31, NO_PACING, auth, merge)).status).toBe("auth_expired");
    expect(auth).toHaveBeenCalledTimes(1);
    const limited = vi.fn(async () => { throw new ZeppError("upstream_rate_limited", "slow down", 429); });
    expect((await runWindows(long, 31, NO_PACING, limited, merge)).status).toBe("upstream_rate_limited");
    expect(limited).toHaveBeenCalledTimes(1);
  });

  it("does not swallow non-Zepp errors", async () => {
    const fetch = vi.fn(async () => { throw new TypeError("bug"); });
    await expect(runWindows(long, 31, NO_PACING, fetch, merge)).rejects.toThrow("bug");
  });

  it("can go newest first and stop early once enough rows were gathered", async () => {
    const { calls, fetch } = seen(w => ok([row(w.startDate)], TZ));
    const result = await runWindows(long, 31, NO_PACING, fetch, merge, { newestFirst: true, enough: g => g.length >= 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.endsWith("2026-10-15")).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});