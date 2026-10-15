import { describe, expect, it } from "vitest";
import { enabledSteps, SYNC_STEPS } from "../src/sync/progress";
import { parseSyncConfig } from "../src/sync/config";
import { computeSyncWindow, MAX_SMART_DAYS } from "../src/sync/window";

const base = { today: "2026-10-15", backfillDays: 90, recentDays: 7, overlapDays: 2 };

describe("computeSyncWindow", () => {
  it("first run (no successful run) keeps the configured backfill", () => {
    expect(computeSyncWindow({ ...base, lastSuccessEnd: undefined })).toEqual({ start: "2026-07-18", end: "2026-10-15", days: 90, mode: "backfill", since: null, truncated: false });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: null, backfillDays: 5 })).toMatchObject({ start: "2026-10-11", days: 5, mode: "backfill" });
  });

  it("starts at the last success date minus the overlap, through today", () => {
    // yesterday's run: 14 Oct - 2 = 12 Oct .. 15 Oct
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-14" })).toEqual({ start: "2026-10-12", end: "2026-10-15", days: 4, mode: "overlap", since: "2026-10-14", truncated: false });
    // a gap longer than the old 7 day window (last success 12 days ago) is caught up: 3 Oct - 2 = 1 Oct .. 15 Oct
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-03" })).toMatchObject({ start: "2026-10-01", days: 15, mode: "overlap" });
    // month boundary
    expect(computeSyncWindow({ ...base, today: "2026-03-02", lastSuccessEnd: "2026-02-28" })).toMatchObject({ start: "2026-02-26", days: 5 });
  });

  it("applies the overlap setting, including none", () => {
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-10", overlapDays: 0 })).toMatchObject({ start: "2026-10-10", days: 6 });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-10", overlapDays: 5 })).toMatchObject({ start: "2026-10-05", days: 11 });
  });

  it("clamps: at least 3 days (or SYNC_RECENT_DAYS when smaller) and at most 31 days", () => {
    // already synced today with no overlap: 1 day wanted, floor 3
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-15", overlapDays: 0 })).toMatchObject({ start: "2026-10-13", days: 3, mode: "overlap", truncated: false });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-15", overlapDays: 0, recentDays: 1 })).toMatchObject({ days: 1 });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-15", overlapDays: 0, recentDays: 2 })).toMatchObject({ days: 2 });
    // exactly at the cap, then beyond it
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-09-17" })).toMatchObject({ start: "2026-09-15", days: 31, truncated: false });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-09-16" })).toMatchObject({ start: "2026-09-15", days: 31, truncated: true });
    const long = computeSyncWindow({ ...base, lastSuccessEnd: "2026-06-01" });
    expect(long).toMatchObject({ days: MAX_SMART_DAYS, start: "2026-09-15", end: "2026-10-15", truncated: true });
    expect(MAX_SMART_DAYS).toBe(31);
  });

  it("an explicit days override always wins", () => {
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-14", overrideDays: 7 })).toEqual({ start: "2026-10-09", end: "2026-10-15", days: 7, mode: "override", since: null, truncated: false });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: undefined, overrideDays: 1 })).toMatchObject({ days: 1, mode: "override" });
    expect(computeSyncWindow({ ...base, lastSuccessEnd: "2026-01-01", overrideDays: 60 })).toMatchObject({ days: 60 }); // not clamped to 31
  });

  it("never yields an empty window when the last success is in the future (clock skew)", () => {
    const w = computeSyncWindow({ ...base, lastSuccessEnd: "2026-10-20" });
    expect(w.end).toBe("2026-10-15");
    expect(w.days).toBeGreaterThanOrEqual(3);
    expect(w.start <= w.end).toBe(true);
  });
});

describe("sync config and steps", () => {
  it("reads SYNC_OVERLAP_DAYS (default 2, 0..14, invalid falls back)", () => {
    expect(parseSyncConfig({}).overlapDays).toBe(2);
    expect(parseSyncConfig({ SYNC_OVERLAP_DAYS: "0" }).overlapDays).toBe(0);
    expect(parseSyncConfig({ SYNC_OVERLAP_DAYS: "5" }).overlapDays).toBe(5);
    expect(parseSyncConfig({ SYNC_OVERLAP_DAYS: "15" }).overlapDays).toBe(2);
    expect(parseSyncConfig({ SYNC_OVERLAP_DAYS: "-1" }).overlapDays).toBe(2);
    expect(parseSyncConfig({ SYNC_OVERLAP_DAYS: "x" }).overlapDays).toBe(2);
  });

  it("lists the steps in order, leaving out disabled ones", () => {
    expect(enabledSteps({}).map(s => s.label)).toEqual(["Daily & sleep", "Workouts", "Strength", "Hybrid Charge", "Emotion", "Blood pressure", "Routes (workout details)", "Weight", "Streams"]);
    expect(enabledSteps({ skipSteps: new Set(["emotion", "weight"]) }).map(s => s.id)).toEqual(["daily_sleep", "workouts", "strength", "charge", "blood_pressure", "routes", "streams"]);
    expect(SYNC_STEPS.length).toBe(9);
  });
});
