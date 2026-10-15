import { afterEach, describe, expect, it } from "vitest";
import { ZeppStore } from "../../src/store/store";
import type { SyncProgress } from "../../src/sync/progress";
import { createSyncService } from "../../src/sync/service";
import { addIsoDays, runSync, type SyncOptions } from "../../src/sync/sync";
import { NOW, config, mockCtx } from "./helpers";

const stores: ZeppStore[] = [];
const memStore = () => { const s = new ZeppStore(":memory:"); stores.push(s); return s; };
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const DAY = 86_400_000;
const TODAY = "2026-08-31"; // NOW in Jakarta
const opts = (over: Partial<SyncOptions> = {}): SyncOptions => ({ backfillDays: 20, recentDays: 3, overlapDays: 2, requestDelayMs: 0, now: () => NOW, ...over });
const stat = (s: ZeppStore) => ({ ...s.stats(), sync_runs: 0, db_bytes: 0 });

describe("runSync window", () => {
  it("first run uses the backfill; the next run starts at the last success minus the overlap", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    const first = await runSync(ctx, store, opts(), "scheduled");
    expect(first.window).toEqual({ mode: "backfill", days: 20, since: null, truncated: false });
    expect(first.range).toEqual({ start: addIsoDays(TODAY, -19), end: TODAY });
    expect(store.lastRun()).toMatchObject({ range_start: first.range.start, range_end: TODAY });

    // same day again: last success today, 2 days overlap -> 3 days
    const same = await runSync(ctx, store, opts(), "scheduled");
    expect(same.window).toMatchObject({ mode: "overlap", days: 3, since: TODAY });
    expect(same.range).toEqual({ start: addIsoDays(TODAY, -2), end: TODAY });

    // next day: 1 + 2 overlap + 1 = 4 days
    const next = await runSync(ctx, store, opts({ now: () => NOW + DAY }), "scheduled");
    expect(next.range).toEqual({ start: addIsoDays(TODAY, -2), end: addIsoDays(TODAY, 1) });
    expect(next.window.days).toBe(4);
  });

  it("catches up a gap longer than the old 7 day window, and caps it at 31 days", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    await runSync(ctx, store, opts(), "scheduled", { days: 5 });
    const tenDays = await runSync(ctx, store, opts({ recentDays: 7, now: () => NOW + 10 * DAY }), "scheduled");
    expect(tenDays.window).toMatchObject({ mode: "overlap", days: 13, since: TODAY, truncated: false });
    expect(tenDays.range.start).toBe(addIsoDays(TODAY, -2));
    // a long gap: capped at 31 days, flagged
    const store2 = memStore();
    await runSync(ctx, store2, opts(), "scheduled", { days: 5 });
    const longGap = await runSync(ctx, store2, opts({ now: () => NOW + 80 * DAY }), "scheduled");
    expect(longGap.window).toMatchObject({ days: 31, truncated: true });
    expect(longGap.range).toEqual({ start: addIsoDays(addIsoDays(TODAY, 80), -30), end: addIsoDays(TODAY, 80) });
  });

  it("honours the overlap setting, an explicit days override, and ignores failed runs when finding the last success", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    await runSync(ctx, store, opts(), "scheduled", { days: 5 });
    expect((await runSync(ctx, store, opts({ overlapDays: 0 }), "scheduled")).range.start).toBe(addIsoDays(TODAY, -2)); // floor of 3 days
    expect((await runSync(ctx, store, opts({ overlapDays: 5 }), "scheduled")).range.start).toBe(addIsoDays(TODAY, -5));
    const forced = await runSync(ctx, store, opts({ now: () => NOW + 3 * DAY }), "manual", { days: 7 });
    expect(forced.window).toMatchObject({ mode: "override", days: 7 });
    // a failed run does not move the last success
    const bad = mockCtx({ failPath: "band_data", failWith: new (await import("../../src/errors")).ZeppError("auth_expired", "expired", 401) });
    const failed = await runSync(bad.ctx, store, opts({ now: () => NOW + 20 * DAY }), "scheduled");
    expect(failed.ok).toBe(false);
    const after = await runSync(ctx, store, opts({ now: () => NOW + 21 * DAY }), "scheduled");
    expect(after.window.since).toBe(addIsoDays(TODAY, 3)); // last success was the forced run on day +3, not the failed one
  });

  it("re-fetching an overlapping window is idempotent", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    await runSync(ctx, store, opts(), "scheduled");
    const a = stat(store);
    await runSync(ctx, store, opts(), "scheduled");
    await runSync(ctx, store, opts(), "scheduled");
    expect(stat(store)).toEqual(a);
  });
});

describe("runSync progress", () => {
  const steps = ["Daily & sleep", "Workouts", "Strength", "Hybrid Charge", "Emotion", "Blood pressure", "Routes (workout details)", "Weight", "Streams"];

  it("reports the ordered steps, each step in order, and the window", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    const seen: SyncProgress[] = [];
    await runSync(ctx, store, opts({ onProgress: p => seen.push(structuredClone(p)) }), "manual", { days: 5 });
    expect(seen.length).toBe(9);
    expect(seen.map(p => p.current)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(seen.every(p => p.steps.map(s => s.label).join("|") === steps.join("|"))).toBe(true);
    expect(seen[0]).toMatchObject({ window_start: addIsoDays(TODAY, -4), window_end: TODAY, mode: "override", since: null, overlap_days: 2 });
    expect(seen[0]!.chunk).toBeUndefined();
    expect(Object.keys(seen[0]!).sort()).toEqual(["current", "mode", "overlap_days", "since", "steps", "window_end", "window_start"]);
  });

  it("reports window mode and the since date for an overlap run, and chunks for long windows", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    const seen: SyncProgress[] = [];
    const first = await runSync(ctx, store, opts({ backfillDays: 20, onProgress: p => seen.push(structuredClone(p)) }), "scheduled");
    expect(first.window.mode).toBe("backfill");
    expect(seen[0]).toMatchObject({ mode: "backfill", window_start: addIsoDays(TODAY, -19) });
    // 20 days at 14 per request = two windows; the step cycle runs once per window, the tail steps once
    expect(seen.filter(p => p.chunk).map(p => `${p.chunk!.index}/${p.chunk!.total}`)).toEqual(["1/2", "1/2", "1/2", "1/2", "1/2", "1/2", "2/2", "2/2", "2/2", "2/2", "2/2", "2/2"]);
    expect(seen.slice(-3).map(p => p.steps[p.current]!.label)).toEqual(["Routes (workout details)", "Weight", "Streams"]);
    expect(seen.slice(-3).every(p => !p.chunk)).toBe(true);
    seen.length = 0;
    await runSync(ctx, store, opts({ onProgress: p => seen.push(structuredClone(p)) }), "scheduled");
    expect(seen[0]).toMatchObject({ mode: "overlap", since: TODAY, window_start: addIsoDays(TODAY, -2) });
  });

  it("only lists and runs enabled steps", async () => {
    const store = memStore(); const { ctx, calls } = mockCtx();
    const seen: SyncProgress[] = [];
    const r = await runSync(ctx, store, opts({ skipSteps: new Set(["weight", "emotion", "streams"]), onProgress: p => seen.push(structuredClone(p)) }), "manual", { days: 5 });
    expect(r.ok).toBe(true);
    expect(seen[0]!.steps.map(s => s.id)).toEqual(["daily_sleep", "workouts", "strength", "charge", "blood_pressure", "routes"]);
    expect(seen.map(p => p.current)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.counts.weight).toBe(0);
    expect(r.counts.emotion_events).toBe(0);
    expect(r.counts.event_streams).toBe(0);
    expect(r.counts.charge_samples).toBeGreaterThan(0);
    expect(calls.some(c => /weight/i.test(c.path))).toBe(false);
  });

  it("a throwing progress callback never breaks the run", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    const r = await runSync(ctx, store, opts({ onProgress: () => { throw new Error("boom"); } }), "manual", { days: 5 });
    expect(r.ok).toBe(true);
  });

  it("the service exposes progress only while a run is in progress", async () => {
    const store = memStore(); const { ctx } = mockCtx();
    const service = createSyncService({ ctx, store, config: { enabled: true, hour: 4, backfillDays: 5, recentDays: 3, overlapDays: 2, requestDelayMs: 0, dbPath: ":memory:" }, now: () => NOW });
    expect(service.status().progress).toBeNull();
    const run = service.run("manual");
    const mid = service.status();
    expect(mid.running).toBe(true);
    expect(mid.progress).toMatchObject({ current: 0, mode: "backfill", window_start: addIsoDays(TODAY, -4), window_end: TODAY });
    expect(mid.progress!.steps).toHaveLength(9);
    expect(mid.settings.overlap_days).toBe(2);
    await run;
    expect(service.status().progress).toBeNull();
    expect(service.status().running).toBe(false);
    // the progress carries no credentials
    expect(JSON.stringify(mid)).not.toContain(config.ZEPP_APP_TOKEN);
  });
});
