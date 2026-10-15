import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BloodPressureEntry } from "../zepp/blood-pressure";
import type { ChargeInsight, ChargeSample } from "../zepp/charge";
import type { EmotionEntry } from "../zepp/emotion";
import type { StreamAvailability } from "../zepp/event-manifest";
import type { DailySummary, SleepNight } from "../zepp/types";
import type { WeightEntry } from "../zepp/weight";
import type { StrengthSet } from "../zepp/strength";
import { sportConfidence, sportKey } from "../zepp/sport-catalog";
import { strengthExerciseName } from "../zepp/strength-exercises";
import type { WorkoutSummary } from "../zepp/workouts";
import { MIGRATIONS, type Migration } from "./migrations";

type Param = string | number | null;

export type SyncTrigger = "startup" | "scheduled" | "manual";

export interface SyncRunCounts {
  daily: number; sleep: number; workouts: number; strength_sets: number;
  weight: number; blood_pressure: number; charge_samples: number; charge_insights: number; emotion_events: number; event_streams: number;
  warnings: number;
}

export const EMPTY_COUNTS: SyncRunCounts = {
  daily: 0, sleep: 0, workouts: 0, strength_sets: 0, weight: 0, blood_pressure: 0, charge_samples: 0, charge_insights: 0, emotion_events: 0, event_streams: 0, warnings: 0
};

export interface SyncRunRow {
  id: number;
  trigger: SyncTrigger;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  status: string;
  range_start: string;
  range_end: string;
  counts: SyncRunCounts;
  error_kind: string | null;
  error_message: string | null;
}

export interface TableCoverage { rows: number; min_date: string | null; max_date: string | null }

export interface StoreStats {
  schema_version: number;
  daily_summary: TableCoverage;
  sleep: TableCoverage;
  workouts: TableCoverage;
  strength_sets: { rows: number; workouts: number };
  weight_records: TableCoverage;
  blood_pressure: TableCoverage;
  charge_samples: TableCoverage;
  charge_insights: TableCoverage;
  emotion_events: TableCoverage;
  event_streams: { rows: number; with_data: number; checked_at: string | null };
  sync_runs: { rows: number };
  db_bytes: number | null;
}

const n = (v: number | null | undefined): Param => (v === undefined || v === null || !Number.isFinite(v) ? null : v);

function mapRun(r: Record<string, unknown>): SyncRunRow {
  return {
    id: Number(r.id),
    trigger: r.trigger as SyncTrigger,
    started_at: String(r.started_at),
    finished_at: r.finished_at === null ? null : String(r.finished_at),
    ok: Number(r.ok) === 1,
    status: String(r.status),
    range_start: String(r.range_start),
    range_end: String(r.range_end),
    counts: {
      daily: Number(r.daily_rows), sleep: Number(r.sleep_rows), workouts: Number(r.workout_rows),
      strength_sets: Number(r.strength_set_rows), weight: Number(r.weight_rows), blood_pressure: Number(r.blood_pressure_rows),
      charge_samples: Number(r.charge_sample_rows), charge_insights: Number(r.charge_insight_rows), emotion_events: Number(r.emotion_rows),
      event_streams: Number(r.event_stream_rows), warnings: Number(r.warning_count)
    },
    error_kind: r.error_kind === null ? null : String(r.error_kind),
    error_message: r.error_message === null ? null : String(r.error_message)
  };
}

export class ZeppStore {
  private readonly db: DatabaseSync;

  constructor(readonly file: string, private readonly migrations: readonly Migration[] = MIGRATIONS) {
    const inMemory = file === ":memory:";
    if (!inMemory) mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    try {
      if (!inMemory) {
        try { chmodSync(file, 0o600); } catch { /* best effort (e.g. Windows) */ }
        this.db.exec("PRAGMA journal_mode = WAL");
      }
      this.db.exec("PRAGMA foreign_keys = ON");
      this.db.exec("PRAGMA busy_timeout = 5000");
      this.migrate();
    } catch (e) {
      this.db.close(); // do not leak the handle (and file lock) when opening or migrating fails
      throw e;
    }
  }

  close(): void { this.db.close(); }

  // ---- migrations -------------------------------------------------------------------------------------------------
  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const known = [...this.migrations].sort((a, b) => a.version - b.version);
    const applied = new Set((this.db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map(r => Number(r.version)));
    const latestKnown = known.at(-1)?.version ?? 0;
    for (const v of applied) {
      if (v > latestKnown) throw new Error(`Database schema version ${v} is newer than this server supports (${latestKnown})`);
    }
    for (const m of known) {
      if (applied.has(m.version)) continue;
      this.transaction(() => {
        this.db.exec(m.sql);
        this.db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, new Date().toISOString());
      });
    }
  }

  schemaVersion(): number {
    const row = this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
    return row.v ?? 0;
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      try { this.db.exec("ROLLBACK"); } catch { /* already rolled back */ }
      throw e;
    }
  }

  // ---- upserts (idempotent: keyed by date / start time / workout id) ---------------------------------------------
  upsertDaily(rows: readonly DailySummary[], updatedAt: string): number {
    // COALESCE keeps a previously stored value when a later response omits that field.
    const stmt = this.db.prepare(`
INSERT INTO daily_summary (date, steps, distance_m, active_calories_kcal, resting_hr_bpm, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(date) DO UPDATE SET
  steps = COALESCE(excluded.steps, steps),
  distance_m = COALESCE(excluded.distance_m, distance_m),
  active_calories_kcal = COALESCE(excluded.active_calories_kcal, active_calories_kcal),
  resting_hr_bpm = COALESCE(excluded.resting_hr_bpm, resting_hr_bpm),
  updated_at = excluded.updated_at`);
    return this.transaction(() => {
      for (const r of rows) stmt.run(r.date, n(r.steps), n(r.distance_m), n(r.active_calories_kcal), n(r.resting_hr_bpm), updatedAt);
      return rows.length;
    });
  }

  upsertSleep(rows: readonly SleepNight[], updatedAt: string): number {
    const stmt = this.db.prepare(`
INSERT INTO sleep (started_at, sleep_date, ended_at, duration_s, score, stages_json, source_scope, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(started_at) DO UPDATE SET
  sleep_date = excluded.sleep_date, ended_at = excluded.ended_at, duration_s = excluded.duration_s,
  score = COALESCE(excluded.score, score), stages_json = excluded.stages_json,
  source_scope = excluded.source_scope, updated_at = excluded.updated_at`);
    return this.transaction(() => {
      for (const r of rows) stmt.run(r.started_at, r.sleep_date, r.ended_at, r.duration_s, n(r.score), JSON.stringify(r.stages), r.source_scope, updatedAt);
      return rows.length;
    });
  }

  upsertWorkout(summary: WorkoutSummary, startedDate: string, raw: unknown, updatedAt: string): void {
    this.db.prepare(`
INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal,
  avg_hr_bpm, max_hr_bpm, training_load, vo2max_ml_kg_min, source_scope, summary_json, raw_json, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workout_id) DO UPDATE SET
  activity_type = excluded.activity_type, zepp_type = excluded.zepp_type, started_at = excluded.started_at,
  started_date = excluded.started_date, ended_at = excluded.ended_at, duration_s = excluded.duration_s,
  distance_m = excluded.distance_m, calories_kcal = excluded.calories_kcal, avg_hr_bpm = excluded.avg_hr_bpm,
  max_hr_bpm = excluded.max_hr_bpm, training_load = excluded.training_load, vo2max_ml_kg_min = excluded.vo2max_ml_kg_min,
  source_scope = excluded.source_scope, summary_json = excluded.summary_json, raw_json = excluded.raw_json,
  updated_at = excluded.updated_at`).run(
      summary.workout_id, summary.activity_type, n(summary.zepp_type), summary.started_at, startedDate, summary.ended_at,
      summary.duration_s, n(summary.distance_m), n(summary.calories_kcal), n(summary.heart_rate?.avg_bpm), n(summary.heart_rate?.max_bpm),
      n(summary.training_load), n(summary.vo2max_ml_kg_min), summary.source_scope, JSON.stringify(summary), JSON.stringify(raw), updatedAt);
  }

  /** Replace all stored sets for a workout and mark its detail as checked (one transaction, safe to repeat). */
  replaceStrengthSets(workoutId: string, sets: readonly StrengthSet[]): number {
    const insert = this.db.prepare(`
INSERT INTO strength_sets (workout_id, seq, set_no, exercise, action_type, reps, weight_kg, duration_s, avg_hr_bpm)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    return this.transaction(() => {
      this.db.prepare("DELETE FROM strength_sets WHERE workout_id = ?").run(workoutId);
      sets.forEach((s, seq) => insert.run(workoutId, seq, s.set, s.exercise, s.action_type, s.reps, n(s.weight_kg), n(s.duration_s), n(s.avg_hr_bpm)));
      this.db.prepare("UPDATE workouts SET strength_checked = 1 WHERE workout_id = ?").run(workoutId);
      return sets.length;
    });
  }

  /**
   * Re-derive the stored `strength_sets.exercise` label from `action_type` with the current name tables.
   * Idempotent: only rows whose label differs are touched, so a second run changes nothing. Returns the number of rows updated.
   */
  rederiveExerciseNames(): number {
    const types = this.db.prepare("SELECT DISTINCT action_type FROM strength_sets").all() as Array<{ action_type: number }>;
    const update = this.db.prepare("UPDATE strength_sets SET exercise = ? WHERE action_type = ? AND exercise <> ?");
    return this.transaction(() => {
      let changed = 0;
      for (const { action_type } of types) {
        const name = strengthExerciseName(Number(action_type));
        changed += Number(update.run(name, action_type, name).changes);
      }
      return changed;
    });
  }

  /**
   * Re-derive stored workout labels that were saved as `unknown:<code>` before the sport catalog knew the code.
   * Only rows still labelled `unknown:<code>` are touched (an explicit title from Zepp is never overwritten), so a second run changes nothing.
   * Updates both the `activity_type` column and the copy inside `summary_json`. Returns the number of rows updated.
   */
  rederiveSportTypes(): number {
    const rows = this.db.prepare("SELECT DISTINCT zepp_type AS t FROM workouts WHERE zepp_type IS NOT NULL AND activity_type = 'unknown:' || zepp_type").all() as Array<{ t: number }>;
    const update = this.db.prepare(
      "UPDATE workouts SET activity_type = ?, summary_json = json_set(CASE WHEN json_valid(summary_json) THEN summary_json ELSE '{}' END, '$.activity_type', ?) WHERE zepp_type = ? AND activity_type = 'unknown:' || zepp_type");
    const addConfidence = this.db.prepare(
      "UPDATE workouts SET summary_json = json_set(summary_json, '$.type_confidence', ?) WHERE zepp_type = ? AND activity_type = ? AND json_valid(summary_json)");
    return this.transaction(() => {
      let changed = 0;
      for (const { t } of rows) {
        const key = sportKey(Number(t));
        if (!key) continue;
        changed += Number(update.run(key, key, t).changes);
        const conf = sportConfidence(Number(t), key);
        if (conf && conf !== "verified") addConfidence.run(conf, t, key);
      }
      return changed;
    });
  }

  isStrengthChecked(workoutId: string): boolean {
    const row = this.db.prepare("SELECT strength_checked AS c FROM workouts WHERE workout_id = ?").get(workoutId) as { c: number } | undefined;
    return row?.c === 1;
  }

  upsertWeight(entries: readonly WeightEntry[], updatedAt: string): number {
    const stmt = this.db.prepare(`
INSERT INTO weight_records (measured_at, date, weight_kg, height_cm, bmi, body_style, raw_json, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(measured_at) DO UPDATE SET
  date = excluded.date, weight_kg = excluded.weight_kg, height_cm = excluded.height_cm, bmi = excluded.bmi,
  body_style = excluded.body_style, raw_json = excluded.raw_json, updated_at = excluded.updated_at`);
    return this.transaction(() => {
      for (const { record: r, raw } of entries) stmt.run(r.measured_at, r.date, r.weight_kg, n(r.height_cm), n(r.bmi), n(r.body_style), JSON.stringify(raw), updatedAt);
      return entries.length;
    });
  }

  upsertBloodPressure(entries: readonly BloodPressureEntry[], updatedAt: string): number {
    const stmt = this.db.prepare(`
INSERT INTO blood_pressure (measured_at, source, date, systolic_mmhg, diastolic_mmhg, pulse_bpm, raw_json, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(measured_at, source) DO UPDATE SET
  date = excluded.date, systolic_mmhg = excluded.systolic_mmhg, diastolic_mmhg = excluded.diastolic_mmhg,
  pulse_bpm = excluded.pulse_bpm, raw_json = excluded.raw_json, updated_at = excluded.updated_at`);
    return this.transaction(() => {
      for (const { reading: r, raw } of entries) stmt.run(r.measured_at, r.source, r.date, r.systolic_mmhg, r.diastolic_mmhg, n(r.pulse_bpm), JSON.stringify(raw), updatedAt);
      return entries.length;
    });
  }

  upsertChargeSamples(samples: readonly ChargeSample[]): number {
    const stmt = this.db.prepare(`
INSERT INTO charge_samples (ts_ms, date, total, mental, physical, status) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(ts_ms) DO UPDATE SET date = excluded.date, total = excluded.total, mental = excluded.mental,
  physical = excluded.physical, status = excluded.status`);
    return this.transaction(() => {
      for (const s of samples) stmt.run(s.ts_ms, s.date, s.total, n(s.mental), n(s.physical), n(s.status));
      return samples.length;
    });
  }

  upsertChargeInsights(insights: readonly ChargeInsight[]): number {
    const stmt = this.db.prepare(`
INSERT INTO charge_insights (ts_ms, date, insight_type, insight, insight_id, raw_json) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(ts_ms) DO UPDATE SET date = excluded.date, insight_type = excluded.insight_type, insight = excluded.insight,
  insight_id = excluded.insight_id, raw_json = excluded.raw_json`);
    return this.transaction(() => {
      for (const i of insights) stmt.run(i.ts_ms, i.date, n(i.insight_type), n(i.insight), n(i.insight_id), JSON.stringify(i.raw));
      return insights.length;
    });
  }

  upsertEmotion(entries: readonly EmotionEntry[], updatedAt: string): number {
    const stmt = this.db.prepare(`
INSERT INTO emotion_events (source, ts_ms, date, value, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(source, ts_ms) DO UPDATE SET date = excluded.date, value = excluded.value, raw_json = excluded.raw_json,
  updated_at = excluded.updated_at`);
    return this.transaction(() => {
      for (const e of entries) stmt.run(e.event.source, e.ts_ms, e.event.date, n(e.event.value), JSON.stringify(e.raw), updatedAt);
      return entries.length;
    });
  }

  upsertEventStreams(streams: readonly StreamAvailability[], windowDays: number, checkedAt: string): number {
    const stmt = this.db.prepare(`
INSERT INTO event_streams (stream_id, family, event_type, sub_type, decoded_by, status, latest_event_at, window_days, checked_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(stream_id) DO UPDATE SET family = excluded.family, event_type = excluded.event_type, sub_type = excluded.sub_type,
  decoded_by = excluded.decoded_by, status = excluded.status, latest_event_at = excluded.latest_event_at,
  window_days = excluded.window_days, checked_at = excluded.checked_at`);
    return this.transaction(() => {
      for (const s of streams) stmt.run(s.id, s.family, s.event_type, s.sub_type, s.decoded_by, s.status, s.latest_event_at, windowDays, checkedAt);
      return streams.length;
    });
  }

  // ---- sync runs ---------------------------------------------------------------------------------------------------
  startRun(trigger: SyncTrigger, rangeStart: string, rangeEnd: string, startedAt: string): number {
    const r = this.db.prepare("INSERT INTO sync_runs (trigger, started_at, range_start, range_end) VALUES (?, ?, ?, ?)").run(trigger, startedAt, rangeStart, rangeEnd);
    return Number(r.lastInsertRowid);
  }

  finishRun(id: number, result: { ok: boolean; status: string; counts: SyncRunCounts; error_kind?: string; error_message?: string }, finishedAt: string): void {
    this.db.prepare(`
UPDATE sync_runs SET finished_at = ?, ok = ?, status = ?, daily_rows = ?, sleep_rows = ?, workout_rows = ?, strength_set_rows = ?,
  weight_rows = ?, blood_pressure_rows = ?, charge_sample_rows = ?, charge_insight_rows = ?, emotion_rows = ?, event_stream_rows = ?,
  warning_count = ?, error_kind = ?, error_message = ? WHERE id = ?`).run(
      finishedAt, result.ok ? 1 : 0, result.status, result.counts.daily, result.counts.sleep, result.counts.workouts,
      result.counts.strength_sets, result.counts.weight, result.counts.blood_pressure, result.counts.charge_samples,
      result.counts.charge_insights, result.counts.emotion_events, result.counts.event_streams,
      result.counts.warnings, result.error_kind ?? null, result.error_message ?? null, id);
  }

  /** Runs left open by a crash or restart are closed as failed so they cannot look like a live run. */
  closeInterruptedRuns(finishedAt: string): number {
    const r = this.db.prepare(`
UPDATE sync_runs SET finished_at = ?, ok = 0, status = 'interrupted', error_kind = 'interrupted',
  error_message = 'Server stopped before the sync finished' WHERE finished_at IS NULL`).run(finishedAt);
    return Number(r.changes);
  }

  lastRun(): SyncRunRow | undefined {
    const r = this.db.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").get();
    return r ? mapRun(r as Record<string, unknown>) : undefined;
  }

  lastSuccessfulRun(): SyncRunRow | undefined {
    const r = this.db.prepare("SELECT * FROM sync_runs WHERE ok = 1 ORDER BY id DESC LIMIT 1").get();
    return r ? mapRun(r as Record<string, unknown>) : undefined;
  }

  recentRuns(limit = 5): SyncRunRow[] {
    return (this.db.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map(mapRun);
  }

  // ---- stats -------------------------------------------------------------------------------------------------------
  private coverage(table: string, dateColumn: string): TableCoverage {
    const r = this.db.prepare(`SELECT COUNT(*) AS rows, MIN(${dateColumn}) AS min_date, MAX(${dateColumn}) AS max_date FROM ${table}`).get() as
      { rows: number; min_date: string | null; max_date: string | null };
    return { rows: Number(r.rows), min_date: r.min_date, max_date: r.max_date };
  }

  stats(): StoreStats {
    const sets = this.db.prepare("SELECT COUNT(*) AS rows, COUNT(DISTINCT workout_id) AS workouts FROM strength_sets").get() as { rows: number; workouts: number };
    const runs = this.db.prepare("SELECT COUNT(*) AS rows FROM sync_runs").get() as { rows: number };
    const streams = this.db.prepare("SELECT COUNT(*) AS rows, COALESCE(SUM(status = 'has_data'), 0) AS with_data, MAX(checked_at) AS checked_at FROM event_streams").get() as
      { rows: number; with_data: number; checked_at: string | null };
    let bytes: number | null = null;
    if (this.file !== ":memory:" && existsSync(this.file)) {
      // In WAL mode recent writes live in the -wal file until checkpointed, so count both.
      bytes = statSync(this.file).size + (existsSync(this.file + "-wal") ? statSync(this.file + "-wal").size : 0);
    }
    return {
      schema_version: this.schemaVersion(),
      daily_summary: this.coverage("daily_summary", "date"),
      sleep: this.coverage("sleep", "sleep_date"),
      workouts: this.coverage("workouts", "started_date"),
      strength_sets: { rows: Number(sets.rows), workouts: Number(sets.workouts) },
      weight_records: this.coverage("weight_records", "date"),
      blood_pressure: this.coverage("blood_pressure", "date"),
      charge_samples: this.coverage("charge_samples", "date"),
      charge_insights: this.coverage("charge_insights", "date"),
      emotion_events: this.coverage("emotion_events", "date"),
      event_streams: { rows: Number(streams.rows), with_data: Number(streams.with_data), checked_at: streams.checked_at },
      sync_runs: { rows: Number(runs.rows) },
      db_bytes: bytes
    };
  }
}

export function openStore(file: string, migrations: readonly Migration[] = MIGRATIONS): ZeppStore {
  return new ZeppStore(file, migrations);
}