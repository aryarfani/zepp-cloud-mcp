import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../../src/store/migrations";
import { EMPTY_COUNTS, ZeppStore } from "../../src/store/store";
import { normalizeWorkoutSummary } from "../../src/zepp/workouts";

const stores: ZeppStore[] = [];
const open = (file = ":memory:", migrations = MIGRATIONS) => { const s = new ZeppStore(file, migrations); stores.push(s); return s; };
const closeAll = () => { while (stores.length) { try { stores.pop()!.close(); } catch { /* already closed */ } } };
afterEach(closeAll);

const summary = () => normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52, calorie: "300" }, "Asia/Jakarta")!;

describe("migrations", () => {
  it("creates the schema and records the version", () => {
    const s = open();
    expect(s.schemaVersion()).toBe(MIGRATIONS.at(-1)!.version);
    const stats = s.stats();
    expect(stats.daily_summary.rows).toBe(0);
    expect(stats.strength_sets).toEqual({ rows: 0, workouts: 0 });
  });

  it("is idempotent on reopen and applies only new migrations (file db, creates the folder)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zepp-db-"));
    const file = path.join(dir, "nested", "zepp.db");
    try {
      const a = open(file);
      a.upsertDaily([{ date: "2026-08-31", steps: 10 }], "t");
      a.close();
      const next = [...MIGRATIONS, { version: 3, name: "test column", sql: "ALTER TABLE daily_summary ADD COLUMN note TEXT;" }];
      const b = open(file, next);
      expect(b.schemaVersion()).toBe(3);
      expect(b.stats().daily_summary.rows).toBe(1);
      b.close();
      const c = open(file, next);
      expect(c.schemaVersion()).toBe(3);
      expect(statSync(file).size).toBeGreaterThan(0);
    } finally {
      closeAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("upgrades a v1 database to v2 without losing data (new tables empty, old sync runs get zero counts)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zepp-db-"));
    const file = path.join(dir, "zepp.db");
    try {
      const v1 = open(file, [MIGRATIONS[0]!]);
      expect(v1.schemaVersion()).toBe(1);
      v1.upsertDaily([{ date: "2026-08-31", steps: 10 }], "t");
      const id = v1.startRun("manual", "2026-08-31", "2026-08-31", "2026-08-31T01:00:00.000Z");
      (v1 as any).db.prepare("UPDATE sync_runs SET finished_at = ?, ok = 1, status = 'ok', daily_rows = 1 WHERE id = ?").run("2026-08-31T01:00:01.000Z", id);
      v1.close();
      const v2 = open(file);
      expect(v2.schemaVersion()).toBe(2);
      const stats = v2.stats();
      expect(stats.daily_summary.rows).toBe(1);
      expect(stats.weight_records.rows).toBe(0);
      expect(stats.charge_samples.rows).toBe(0);
      expect(stats.event_streams).toEqual({ rows: 0, with_data: 0, checked_at: null });
      expect(v2.lastRun()!.counts).toEqual({ ...EMPTY_COUNTS, daily: 1 });
    } finally {
      closeAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a database written by a newer server", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zepp-db-"));
    const file = path.join(dir, "zepp.db");
    try {
      open(file, [...MIGRATIONS, { version: 5, name: "future", sql: "SELECT 1;" }]).close();
      expect(() => new ZeppStore(file, MIGRATIONS)).toThrow(/newer than this server supports/);
    } finally {
      closeAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rolls back a failing migration completely", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zepp-db-"));
    const file = path.join(dir, "zepp.db");
    try {
      const bad = [...MIGRATIONS, { version: 3, name: "bad", sql: "CREATE TABLE half_done (a INT); SELECT * FROM missing_table_xyz;" }];
      expect(() => new ZeppStore(file, bad)).toThrow();
      const s = open(file);
      expect(s.schemaVersion()).toBe(MIGRATIONS.at(-1)!.version);
    } finally {
      closeAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("upserts", () => {
  it("daily_summary is keyed by date; repeating a sync does not add rows", () => {
    const s = open();
    s.upsertDaily([{ date: "2026-08-31", steps: 100, distance_m: 50, resting_hr_bpm: 58 }], "t1");
    s.upsertDaily([{ date: "2026-08-31", steps: 250 }], "t2");
    s.upsertDaily([{ date: "2026-08-31", steps: 250 }], "t3");
    expect(s.stats().daily_summary).toEqual({ rows: 1, min_date: "2026-08-31", max_date: "2026-08-31" });
  });

  it("sleep is keyed by start time", () => {
    const s = open();
    const night = { sleep_date: "2026-08-31", started_at: "2026-08-30T22:00:00.000Z", ended_at: "2026-08-31T05:00:00.000Z", duration_s: 25200, stages: [], source_scope: "device" as const };
    s.upsertSleep([night], "t1");
    s.upsertSleep([{ ...night, score: 80 }], "t2");
    expect(s.stats().sleep.rows).toBe(1);
  });

  it("workouts upsert by id and strength sets are replaced, not duplicated", () => {
    const s = open();
    const w = summary();
    s.upsertWorkout(w, "2023-11-15", { trackid: "1700000000" }, "t1");
    s.upsertWorkout({ ...w, calories_kcal: 999 }, "2023-11-15", { trackid: "1700000000" }, "t2");
    expect(s.stats().workouts.rows).toBe(1);
    expect(s.isStrengthChecked(w.workout_id)).toBe(false);
    const sets = [
      { set: 0, exercise: "Pull Up", action_type: 64, reps: 10, weight_kg: null, duration_s: 31, avg_hr_bpm: 98 },
      { set: 1, exercise: "Bench Press", action_type: 6, reps: 12, weight_kg: 12, duration_s: 49, avg_hr_bpm: 106 }
    ];
    expect(s.replaceStrengthSets(w.workout_id, sets)).toBe(2);
    expect(s.replaceStrengthSets(w.workout_id, sets)).toBe(2);
    expect(s.stats().strength_sets).toEqual({ rows: 2, workouts: 1 });
    expect(s.isStrengthChecked(w.workout_id)).toBe(true);
  });
});

describe("sync runs", () => {
  it("tracks runs and closes interrupted ones", () => {
    const s = open();
    const id = s.startRun("manual", "2026-08-01", "2026-08-31", "2026-08-31T00:00:00.000Z");
    expect(s.lastSuccessfulRun()).toBeUndefined();
    expect(s.closeInterruptedRuns("2026-08-31T00:01:00.000Z")).toBe(1);
    expect(s.lastRun()).toMatchObject({ id, ok: false, status: "interrupted", error_kind: "interrupted" });
    const id2 = s.startRun("startup", "2026-08-25", "2026-08-31", "2026-08-31T01:00:00.000Z");
    s.finishRun(id2, { ok: true, status: "ok", counts: { ...EMPTY_COUNTS, daily: 1, sleep: 1, workouts: 2, strength_sets: 3 } }, "2026-08-31T01:00:05.000Z");
    expect(s.lastSuccessfulRun()).toMatchObject({ id: id2, counts: { workouts: 2, strength_sets: 3 } });
    expect(s.recentRuns(5).map(r => r.id)).toEqual([id2, id]);
  });
});