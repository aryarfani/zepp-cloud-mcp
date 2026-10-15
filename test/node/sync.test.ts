import { afterEach, describe, expect, it } from "vitest";
import { ZeppError } from "../../src/errors";
import { ZeppStore } from "../../src/store/store";
import { parseSyncConfig } from "../../src/sync/config";
import { createSyncService } from "../../src/sync/service";
import { addIsoDays, runSync, type SyncOptions } from "../../src/sync/sync";
import { NOW, RUN_ID, STRENGTH_ID, config, mockCtx } from "./helpers";

const stores: ZeppStore[] = [];
const memStore = () => { const s = new ZeppStore(":memory:"); stores.push(s); return s; };
afterEach(() => { while (stores.length) stores.pop()!.close(); });

const sleeps: number[] = [];
const opts = (over: Partial<SyncOptions> = {}): SyncOptions => ({
  backfillDays: 20, recentDays: 3, requestDelayMs: 250, now: () => NOW, sleep: async ms => { sleeps.push(ms); }, ...over
});

describe("runSync with a mocked Zepp client", () => {
  it("backfills on the first run, then only the recent window", async () => {
    sleeps.length = 0;
    const store = memStore();
    const { ctx, calls } = mockCtx();

    const first = await runSync(ctx, store, opts(), "startup");
    expect(first).toMatchObject({ ok: true, status: "ok", trigger: "startup", range: { start: "2026-08-12", end: "2026-08-31" } });
    expect(first.counts.daily).toBeGreaterThan(0);
    expect(first.counts.sleep).toBeGreaterThan(0);
    expect(first.counts.workouts).toBeGreaterThan(0);
    // 20 days at 14-day windows = 2 windows x (band_data + history), plus one detail request for the strength workout.
    expect(calls.filter(c => c.path === "/v1/data/band_data.json")).toHaveLength(2);
    expect(calls.filter(c => c.path === "/v1/sport/run/history.json").length).toBeGreaterThanOrEqual(2);
    expect(calls.filter(c => c.path === "/v1/sport/run/detail.json")).toHaveLength(1);
    // sequential with a pause between requests
    expect(sleeps.length).toBe(calls.length - 1);
    expect(sleeps.every(ms => ms === 250)).toBe(true);

    calls.length = 0;
    const second = await runSync(ctx, store, opts(), "scheduled");
    expect(second.range).toEqual({ start: "2026-08-29", end: "2026-08-31" });
    expect(calls.filter(c => c.path === "/v1/data/band_data.json")).toHaveLength(1);
    expect(calls.filter(c => c.path === "/v1/sport/run/detail.json")).toHaveLength(0); // already checked
  });

  it("is idempotent: syncing the same window twice leaves identical row counts", async () => {
    const store = memStore();
    const { ctx } = mockCtx();
    await runSync(ctx, store, opts(), "manual", { days: 5 });
    const a = store.stats();
    await runSync(ctx, store, opts(), "manual", { days: 5 });
    await runSync(ctx, store, opts(), "manual", { days: 5 });
    const b = store.stats();
    expect({ ...b, sync_runs: 0, db_bytes: 0 }).toEqual({ ...a, sync_runs: 0, db_bytes: 0 });
    expect(b.sync_runs.rows).toBe(3);
  });

  it("stores daily, sleep, workouts (with raw JSON) and derived strength sets", async () => {
    const store = memStore();
    await runSync(mockCtx().ctx, store, opts(), "manual", { days: 5 });
    const stats = store.stats();
    expect(stats.daily_summary.max_date).toBe("2026-08-31");
    expect(stats.workouts).toMatchObject({ rows: 2, min_date: "2026-08-31", max_date: "2026-08-31" });
    expect(stats.strength_sets).toEqual({ rows: 4, workouts: 1 });
    expect(store.isStrengthChecked(STRENGTH_ID)).toBe(true);
    expect(store.isStrengthChecked(RUN_ID)).toBe(false); // runs are never inspected for sets
    const db = (store as any).db;
    const row = db.prepare("SELECT raw_json, activity_type FROM workouts WHERE workout_id = ?").get(STRENGTH_ID);
    expect(row.activity_type).toBe("strength");
    expect(JSON.parse(row.raw_json)).toMatchObject({ type: 52, calorie: "300.0" });
    const sets = db.prepare("SELECT exercise, reps, weight_kg FROM strength_sets WHERE workout_id = ? ORDER BY seq").all(STRENGTH_ID);
    expect(sets[0]).toMatchObject({ exercise: "Pull Up", reps: 10, weight_kg: null });
    expect(sets[2]).toMatchObject({ exercise: "Bench Press", weight_kg: 17.5 });
  });

  it("records auth_expired as a failed run instead of throwing, and keeps the next run as a backfill", async () => {
    const store = memStore();
    const { ctx } = mockCtx({ failPath: "band_data" });
    const result = await runSync(ctx, store, opts(), "startup");
    expect(result).toMatchObject({ ok: false, status: "auth_expired", error: { kind: "auth_expired" } });
    expect(result.error!.message).toContain("ZEPP_APP_TOKEN");
    expect(store.lastRun()).toMatchObject({ ok: false, status: "auth_expired", error_kind: "auth_expired" });
    expect(store.lastSuccessfulRun()).toBeUndefined();
    const retry = await runSync(mockCtx().ctx, store, opts(), "startup");
    expect(retry.range.start).toBe(addIsoDays("2026-08-31", -19)); // still a full backfill
  });

  it("keeps data written before a failure and stops on rate limiting", async () => {
    const store = memStore();
    const { ctx, calls } = mockCtx({ failPath: "history", failWith: new ZeppError("upstream_rate_limited", "limited", 429, "30") });
    const result = await runSync(ctx, store, opts(), "manual", { days: 5 });
    expect(result).toMatchObject({ ok: false, status: "upstream_rate_limited" });
    expect(result.error!.message).toContain("retry after 30");
    expect(store.stats().daily_summary.rows).toBeGreaterThan(0);
    expect(calls.filter(c => c.path === "/v1/sport/run/history.json")).toHaveLength(1);
  });

  it("a single unreadable workout detail is a warning, not a failed run, and is retried next time", async () => {
    const store = memStore();
    const bad = mockCtx({ detail: { nothing: "recognizable" } });
    const result = await runSync(bad.ctx, store, opts(), "manual", { days: 5 });
    expect(result).toMatchObject({ ok: true, status: "ok_with_warnings", counts: { warnings: 1, strength_sets: 0 } });
    expect(store.isStrengthChecked(STRENGTH_ID)).toBe(false);
    const fixed = await runSync(mockCtx().ctx, store, opts(), "manual", { days: 5 });
    expect(fixed.counts.strength_sets).toBe(4);
    expect(store.isStrengthChecked(STRENGTH_ID)).toBe(true);
  });

  it("records an unexpected internal error instead of crashing", async () => {
    const store = memStore();
    const { ctx } = mockCtx();
    (ctx.zepp as any).get = async () => { throw new TypeError("boom"); };
    const result = await runSync(ctx, store, opts(), "manual", { days: 2 });
    expect(result).toMatchObject({ ok: false, status: "internal_error" });
  });
});

describe("sync service", () => {
  it("runs one sync at a time and reports status", async () => {
    const store = memStore();
    const { ctx } = mockCtx();
    const config2 = parseSyncConfig({ SYNC_BACKFILL_DAYS: "5", SYNC_REQUEST_DELAY_MS: "0" });
    const service = createSyncService({ ctx, store, config: config2, now: () => NOW });
    const first = service.run("manual");
    expect(service.isRunning()).toBe(true);
    expect(await service.run("manual")).toBeUndefined(); // overlapping call is skipped
    const result = await first;
    expect(result?.ok).toBe(true);
    expect(service.isRunning()).toBe(false);

    const status = service.status();
    expect(status).toMatchObject({
      enabled: true, running: false,
      last_run: { ok: true, status: "ok", trigger: "manual" },
      tables: { workouts: { rows: 2 }, strength_sets: { rows: 4, workouts: 1 } },
      db: { schema_version: 1 }
    });
    expect(status.last_success_at).toBeTruthy();
    expect(status.schedule.timezone).toBe(config.USER_TIMEZONE);
    expect(JSON.stringify(status)).not.toContain("test-token");
  });
});

describe("parseSyncConfig", () => {
  it("applies defaults and ignores invalid values", () => {
    expect(parseSyncConfig({})).toEqual({ enabled: true, hour: 4, backfillDays: 90, recentDays: 7, requestDelayMs: 400, dbPath: "data/zepp.db" });
    expect(parseSyncConfig({ SYNC_ENABLED: "false", SYNC_HOUR: "23", SYNC_BACKFILL_DAYS: "30", ZEPP_DB_PATH: "x/y.db" }))
      .toMatchObject({ enabled: false, hour: 23, backfillDays: 30, dbPath: "x/y.db" });
    expect(parseSyncConfig({ SYNC_HOUR: "24", SYNC_BACKFILL_DAYS: "-5", SYNC_RECENT_DAYS: "abc", SYNC_REQUEST_DELAY_MS: "1.5" }))
      .toMatchObject({ hour: 4, backfillDays: 90, recentDays: 7, requestDelayMs: 400 });
  });
});
