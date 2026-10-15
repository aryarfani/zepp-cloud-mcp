import { afterEach, describe, expect, it } from "vitest";
import { ZeppError } from "../../src/errors";
import { ZeppStore } from "../../src/store/store";
import { runSync, type SyncOptions } from "../../src/sync/sync";
import { NOW, mockCtx } from "./helpers";

const stores: ZeppStore[] = [];
const memStore = () => { const s = new ZeppStore(":memory:"); stores.push(s); return s; };
afterEach(() => { while (stores.length) stores.pop()!.close(); });
const opts = (over: Partial<SyncOptions> = {}): SyncOptions => ({ backfillDays: 20, recentDays: 3, requestDelayMs: 0, now: () => NOW, ...over });
const rows = (store: ZeppStore, sql: string) => (store as any).db.prepare(sql).all() as Array<Record<string, any>>;

describe("sync of weight, hybrid charge, blood pressure, emotion and event streams", () => {
  it("stores each data type, scrubs identifiers from raw JSON, and reports counts in the run and stats", async () => {
    const store = memStore();
    const result = await runSync(mockCtx().ctx, store, opts(), "manual", { days: 5 });
    expect(result).toMatchObject({ ok: true, status: "ok", counts: { weight: 1, blood_pressure: 0, charge_samples: 3, charge_insights: 1, emotion_events: 1 } });
    expect(result.counts.event_streams).toBeGreaterThan(10);

    expect(rows(store, "SELECT weight_kg, height_cm, bmi, date FROM weight_records")).toEqual([{ weight_kg: 64.5, height_cm: 166, bmi: 23.4, date: "2026-08-30" }]);
    expect(rows(store, "SELECT total, mental, date FROM charge_samples ORDER BY ts_ms").map(r => r.total)).toEqual([36, 38, 40]);
    expect(rows(store, "SELECT source, value, date FROM emotion_events")).toEqual([{ source: "spot_stress", value: 44, date: "2026-08-31" }]);
    const streams = rows(store, "SELECT stream_id, status FROM event_streams");
    expect(streams.find(s => s.stream_id === "hybrid_charge")).toMatchObject({ status: "has_data" });
    expect(streams.find(s => s.stream_id === "emotion")).toMatchObject({ status: "empty" });

    const raw = rows(store, "SELECT raw_json FROM weight_records").concat(rows(store, "SELECT raw_json FROM emotion_events"), rows(store, "SELECT raw_json FROM charge_insights"));
    expect(JSON.stringify(raw)).not.toContain("SECRET-SN");

    const stats = store.stats();
    expect(stats.weight_records).toEqual({ rows: 1, min_date: "2026-08-30", max_date: "2026-08-30" });
    expect(stats.charge_samples).toMatchObject({ rows: 3, min_date: "2026-08-31", max_date: "2026-08-31" });
    expect(stats.blood_pressure.rows).toBe(0);
    expect(stats.event_streams.with_data).toBeGreaterThanOrEqual(2);
    expect(store.lastRun()!.counts).toMatchObject({ weight: 1, charge_samples: 3, charge_insights: 1, emotion_events: 1 });
  });

  it("is idempotent across repeated runs", async () => {
    const store = memStore();
    const { ctx } = mockCtx();
    await runSync(ctx, store, opts(), "manual", { days: 5 });
    const a = store.stats();
    await runSync(ctx, store, opts(), "manual", { days: 5 });
    const b = store.stats();
    expect({ ...b, sync_runs: 0, db_bytes: 0, event_streams: 0 }).toEqual({ ...a, sync_runs: 0, db_bytes: 0, event_streams: 0 });
    expect(b.event_streams.rows).toBe(a.event_streams.rows);
  });

  it("stores readable blood pressure readings when Zepp returns them", async () => {
    const store = memStore();
    const bp = [{ time: Math.floor(Date.parse("2026-08-30T03:00:00Z") / 1000), systolic: 118, diastolic: 76, pulse: 60 }];
    const result = await runSync(mockCtx({ bloodPressure: bp }).ctx, store, opts(), "manual", { days: 5 });
    expect(result.counts.blood_pressure).toBeGreaterThanOrEqual(1);
    expect(rows(store, "SELECT systolic_mmhg, diastolic_mmhg, pulse_bpm FROM blood_pressure")).toEqual([{ systolic_mmhg: 118, diastolic_mmhg: 76, pulse_bpm: 60 }]);
  });

  it("an unreadable optional stream is a warning and the rest of the run still completes", async () => {
    const store = memStore();
    const result = await runSync(mockCtx({ weight: { nope: true } }).ctx, store, opts(), "manual", { days: 5 });
    expect(result).toMatchObject({ ok: true, status: "ok_with_warnings" });
    expect(result.counts.warnings).toBeGreaterThanOrEqual(1);
    expect(result.counts.charge_samples).toBe(3);
    expect(store.stats().weight_records.rows).toBe(0);
  });

  it("auth_expired in an optional stream still fails the run (recorded, not thrown) and keeps earlier data", async () => {
    const store = memStore();
    const { ctx } = mockCtx({ failPath: "weightRecords", failWith: new ZeppError("auth_expired", "expired", 401) });
    const result = await runSync(ctx, store, opts(), "manual", { days: 5 });
    expect(result).toMatchObject({ ok: false, status: "auth_expired" });
    expect(store.stats().charge_samples.rows).toBe(3);
  });
});