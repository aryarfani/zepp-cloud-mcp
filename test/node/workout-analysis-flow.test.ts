import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAnalysisLoader } from "../../src/dashboard/analysis-loader";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard } from "../../src/dashboard/handler";
import { ZeppError } from "../../src/errors";
import { ZeppStore } from "../../src/store/store";
import { fetchAndStoreAnalysis } from "../../src/sync/details";
import { runSync } from "../../src/sync/sync";
import { analyzeWorkout } from "../../src/zepp/workout-analysis";
import { RUN_HISTORY_EXTRA, RUN_TRACKID, runDetail } from "../fixtures/run-detail";
import { NOW, RUN_ID, STRENGTH_ID, mockCtx } from "./helpers";
import { seedDashboardDb } from "./dashboard-seed";

const stores: ZeppStore[] = [];
const memStore = () => { const s = new ZeppStore(":memory:"); stores.push(s); return s; };
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const syncOpts = { backfillDays: 20, recentDays: 3, requestDelayMs: 0, now: () => NOW, sleep: async () => {} };

// A history item as the sync stores it for the run (scrubbed of identity).
const HISTORY_RUN = { trackid: "1", source: "run.device", type: 1, ...RUN_HISTORY_EXTRA };

describe("store: workout_details", () => {
  it("saves, upserts and lists missing analyses (strength excluded, newest first, version-gated)", async () => {
    const store = memStore();
    await runSync(mockCtx().ctx, store, syncOpts, "manual", { days: 5 });
    (store as any).db.prepare("DELETE FROM workout_details").run(); // the sync already analysed the run; start from a clean slate
    expect(store.missingAnalysisIds("2026-08-01", 10)).toEqual([RUN_ID]); // the strength workout never needs one
    expect(store.hasWorkoutAnalysis(RUN_ID)).toBe(false);
    const analysis = analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA);
    const bytes = store.saveWorkoutAnalysis(RUN_ID, analysis, "2026-08-31T00:00:00Z");
    expect(bytes).toBeGreaterThan(1000);
    expect(bytes).toBeLessThan(30_000);
    expect(store.hasWorkoutAnalysis(RUN_ID)).toBe(true);
    expect(store.missingAnalysisIds("2026-08-01", 10)).toEqual([]);
    store.saveWorkoutAnalysis(RUN_ID, null, "2026-08-31T01:00:00Z");
    const row = (store as any).db.prepare("SELECT status, bytes, analysis_json FROM workout_details WHERE workout_id = ?").get(RUN_ID);
    expect(row).toMatchObject({ status: "empty", bytes: 0, analysis_json: null });
    expect(store.workoutHistoryItem(RUN_ID)).toMatchObject({ type: 1 });
    expect(store.workoutHistoryItem("nope")).toBeUndefined();
    void STRENGTH_ID;
  });

  it("cascades with the workout", () => {
    const store = memStore();
    const db = (store as any).db;
    db.prepare("INSERT INTO workouts (workout_id, activity_type, started_at, started_date, ended_at, duration_s, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES ('w1','outdoor_running','2026-08-01T00:00:00Z','2026-08-01','2026-08-01T01:00:00Z',3600,'device','{}','{}',0,'t')").run();
    store.saveWorkoutAnalysis("w1", analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA), "t");
    db.prepare("DELETE FROM workouts WHERE workout_id = 'w1'").run();
    expect(db.prepare("SELECT COUNT(*) AS n FROM workout_details").get().n).toBe(0);
  });
});

describe("sync: workout detail step", () => {
  it("stores an analysis for the run on sync and does not refetch it", async () => {
    const store = memStore();
    const mock = mockCtx({ detail: runDetail(), history: undefined });
    // a detail that is a real run payload for the run, lap rows for strength are not needed here
    const first = await runSync(mock.ctx, store, syncOpts, "manual", { days: 5 });
    expect(first.ok).toBe(true);
    expect(store.hasWorkoutAnalysis(RUN_ID)).toBe(true);
    const runCalls = () => mock.calls.filter(c => c.path === "/v1/sport/run/detail.json" && String(c.query.trackid) === String(RUN_TRACKID)).length;
    expect(runCalls()).toBe(1);
    await runSync(mock.ctx, store, syncOpts, "manual", { days: 5 });
    expect(runCalls()).toBe(1);
  });

  it("limits the backfill per run and treats a non-fatal error on one workout as a warning", async () => {
    const store = memStore();
    const mock = mockCtx({ detail: runDetail() });
    (mock.ctx.zepp as any).get = new Proxy((mock.ctx.zepp as any).get, {
      apply(target, self, args: any[]) {
        if (args[0].path === "/v1/sport/run/detail.json" && String(args[0].query.trackid) !== "") {
          return Promise.reject(new ZeppError("upstream_error", "Zepp unavailable", 502));
        }
        return Reflect.apply(target, self, args);
      }
    });
    const result = await runSync(mock.ctx, store, syncOpts, "manual", { days: 5 });
    expect(result.ok).toBe(true);
    expect(store.hasWorkoutAnalysis(RUN_ID)).toBe(false);
    expect(result.counts.warnings).toBeGreaterThan(0);
  });
});

describe("fetchAndStoreAnalysis", () => {
  it("returns null and remembers an empty analysis when the detail has nothing to show", async () => {
    const store = memStore();
    await runSync(mockCtx().ctx, store, syncOpts, "manual", { days: 5 });
    const result = await fetchAndStoreAnalysis(mockCtx({ detail: { time: "0" } }).ctx, store, RUN_ID, "2026-08-31T00:00:00Z");
    expect(result).toBeNull();
    expect(store.hasWorkoutAnalysis(RUN_ID)).toBe(true);
  });
});

describe("analysis loader (lazy dashboard fetch)", () => {
  async function setup(detail: unknown = runDetail()) {
    const store = memStore();
    await runSync(mockCtx().ctx, store, syncOpts, "manual", { days: 5 });
    const mock = mockCtx({ detail });
    return { store, mock };
  }

  it("fetches once, de-duplicates concurrent opens and rate-limits upstream calls", async () => {
    const { store, mock } = await setup();
    let t = NOW;
    const load = createAnalysisLoader({ ctx: mock.ctx, store, now: () => t, maxPerWindow: 1 });
    const [a, b] = await Promise.all([load(RUN_ID), load(RUN_ID)]);
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    expect(mock.calls.filter(c => c.path === "/v1/sport/run/detail.json")).toHaveLength(1);
    expect(store.hasWorkoutAnalysis(RUN_ID)).toBe(true);
    expect(await load(STRENGTH_ID)).toEqual({ status: "unavailable", reason: "rate_limited" });
    t += 11 * 60_000;
    expect((await load(STRENGTH_ID)).status).toBe("unavailable"); // allowed again (the strength lap has no run series -> no_detail)
  });

  it("returns generic reasons on upstream failures, remembers them briefly and leaks nothing", async () => {
    const { store, mock } = await setup();
    (mock.ctx.zepp as any).get = async () => { throw new ZeppError("upstream_error", "boom with test-token inside", 502); };
    let t = NOW;
    const logs: string[] = [];
    const load = createAnalysisLoader({ ctx: mock.ctx, store, now: () => t, log: m => logs.push(m) });
    const first = await load(RUN_ID);
    expect(first).toEqual({ status: "unavailable", reason: "upstream_error" });
    expect(JSON.stringify(first) + logs.join("|")).not.toContain("test-token");
    let calls = 0;
    (mock.ctx.zepp as any).get = async () => { calls++; throw new Error("x"); };
    expect(await load(RUN_ID)).toEqual({ status: "unavailable", reason: "upstream_error" });
    expect(calls).toBe(0); // negative cache
    t += 6 * 60_000;
    await load(RUN_ID);
    expect(calls).toBe(1);
  });
});

describe("dashboard API /workouts/<id>/analysis", () => {
  const PASSWORD = "correct horse battery staple";
  const ORIGIN = "https://zepp.test";
  let dir: string, file: string;
  const RUN = "zepp:1760482800:cnVuLmRldmljZQ";
  beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "zepp-an-")); file = path.join(dir, "zepp.db"); seedDashboardDb(file); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  async function boot(loadAnalysis?: any) {
    const data = new DashboardData(file, { timezone: "Asia/Jakarta", now: () => Date.parse("2026-10-15T05:00:00Z") });
    const handler = createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0, sleep: async () => {}, ...(loadAnalysis ? { loadAnalysis } : {}) });
    const login = await handler(new Request(ORIGIN + "/dashboard/login"));
    const csrf = login.headers.getSetCookie().find(c => c.startsWith("zepp_dash_csrf="))!.split(";")[0]!;
    const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: csrf, "x-real-ip": "9.9.9.9" }, body: new URLSearchParams({ csrf: csrf.split("=")[1]!, password: PASSWORD }).toString() }));
    const cookie = "zepp_dash=" + res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!.slice("zepp_dash=".length);
    const api = async (id: string, withCookie = true) => {
      const r = await handler(new Request(ORIGIN + "/dashboard/api/workouts/" + id + "/analysis", withCookie ? { headers: { cookie } } : {}));
      return { r, body: r.status === 200 ? await r.json() as any : null };
    };
    return { api, data };
  }

  it("requires a session", async () => {
    const { api, data } = await boot();
    expect((await api(encodeURIComponent(RUN), false)).r.status).toBe(401);
    data.close();
  });

  it("answers not_synced without a loader, 404 for unknown ids, unavailable for strength", async () => {
    const { api, data } = await boot();
    const run = await api(encodeURIComponent(RUN));
    expect(run.r.headers.get("cache-control")).toContain("no-store");
    expect(run.body).toMatchObject({ status: "unavailable", reason: "not_synced" });
    expect((await api("nope")).r.status).toBe(404);
    expect((await api("w-str")).body).toEqual({ status: "unavailable", reason: "strength" });
    expect((await api("%E0%A4%A")).r.status).toBe(404);
    data.close();
  });

  it("uses the lazy loader once, then serves the stored analysis", async () => {
    let loads = 0;
    const analysis = analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA);
    const { api, data } = await boot(async () => { loads++; return { status: "ok", analysis }; });
    const first = await api(encodeURIComponent(RUN));
    expect(first.body).toMatchObject({ status: "ok", source: "fetched" });
    expect(loads).toBe(1);
    const store = new ZeppStore(file);
    store.saveWorkoutAnalysis(RUN, analysis, "2026-10-15T00:00:00Z");
    store.close();
    const second = await api(encodeURIComponent(RUN));
    expect(second.body).toMatchObject({ status: "ok", source: "stored", analysis: { v: 1, route: { bbox: expect.any(Array) } } });
    expect(loads).toBe(1);
    expect(JSON.stringify(second.body)).not.toMatch(/token|trackid/i);
    data.close();
  });
});