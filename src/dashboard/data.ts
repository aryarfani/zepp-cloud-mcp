// Read-only queries over the local SQLite store for the dashboard. Parameterized SQL only; no upstream Zepp calls.
import { existsSync, statSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { addIsoDays } from "../time";
import { type MuscleSummary, aggregateMuscles } from "../zepp/muscles";
import { type RouteThumb, routeThumb } from "./thumbs";
import { sportConfidence } from "../zepp/sport-catalog";
import { strengthExerciseName, strengthExerciseSource } from "../zepp/strength-exercises";

type Row = Record<string, unknown>;

export const DASHBOARD_MAX_DAYS = 366;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
export const WORKOUT_PAGE_MAX = 100;
const STAGES = ["deep", "light", "rem", "awake"] as const;

/** Tables shown in the status footer: [table, date column]. A fixed list, never taken from a request. */
const COVERAGE: ReadonlyArray<readonly [string, string]> = [
  ["daily_summary", "date"], ["sleep", "sleep_date"], ["workouts", "started_date"], ["weight_records", "date"],
  ["blood_pressure", "date"], ["charge_samples", "date"], ["emotion_events", "date"], ["recovery_days", "date"]
];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function todayIn(timezone: string, now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

export interface DashboardDataOptions { timezone: string; now?: () => number }

export class DashboardData {
  private db: DatabaseSync | null = null;
  private readonly now: () => number;
  readonly timezone: string;

  constructor(private readonly file: string, options: DashboardDataOptions) {
    this.timezone = options.timezone;
    this.now = options.now ?? (() => Date.now());
  }

  /** Opens the database read-only on first use. Returns false (never throws) when the store does not exist or cannot be read. */
  private open(): DatabaseSync | null {
    if (this.db) return this.db;
    if (!existsSync(this.file)) return null;
    try {
      const db = new DatabaseSync(this.file, { readOnly: true });
      db.exec("PRAGMA busy_timeout = 3000");
      db.exec("PRAGMA query_only = ON");
      this.db = db;
      return db;
    } catch {
      return null;
    }
  }

  close(): void { try { this.db?.close(); } catch { /* ignore */ } this.db = null; }

  private all(sql: string, ...params: SQLInputValue[]): Row[] {
    const db = this.open();
    return db ? (db.prepare(sql).all(...params) as Row[]) : [];
  }
  private get(sql: string, ...params: SQLInputValue[]): Row | null {
    return this.all(sql, ...params)[0] ?? null;
  }
  private count(table: string): number {
    return COVERAGE.some(([t]) => t === table) || ["strength_sets", "sync_runs", "charge_insights", "event_streams"].includes(table)
      ? Number(this.get(`SELECT COUNT(*) AS c FROM ${table}`)?.c ?? 0) : 0;
  }

  available(): boolean { return this.open() !== null; }
  today(): string { return todayIn(this.timezone, this.now()); }
  private since(days: number): string { return addIsoDays(this.today(), -(days - 1)); }

  // ---- overview -----------------------------------------------------------------------------------------------------
  overview() {
    if (!this.available()) return { available: false, timezone: this.timezone, today: this.today() };
    const daily = this.get("SELECT date, steps, distance_m, active_calories_kcal, resting_hr_bpm FROM daily_summary ORDER BY date DESC LIMIT 1");
    const restingHr = this.get("SELECT date, resting_hr_bpm FROM daily_summary WHERE resting_hr_bpm IS NOT NULL ORDER BY date DESC LIMIT 1");
    const sleepRow = this.get("SELECT sleep_date, started_at, ended_at, duration_s, score, stages_json FROM sleep ORDER BY started_at DESC LIMIT 1");
    const chargeDate = str(this.get("SELECT date FROM charge_samples ORDER BY ts_ms DESC LIMIT 1")?.date);
    let charge: Row | null = null;
    if (chargeDate) {
      const agg = this.get("SELECT COUNT(*) AS samples, MIN(total) AS min, MAX(total) AS max, AVG(total) AS avg FROM charge_samples WHERE date = ?", chargeDate);
      const last = this.get("SELECT total, mental, physical, ts_ms FROM charge_samples WHERE date = ? ORDER BY ts_ms DESC LIMIT 1", chargeDate);
      const first = this.get("SELECT total FROM charge_samples WHERE date = ? ORDER BY ts_ms ASC LIMIT 1", chargeDate);
      charge = { date: chargeDate, ...agg, first: num(first?.total), last: num(last?.total), mental: num(last?.mental), physical: num(last?.physical), last_at_ms: num(last?.ts_ms) };
    }
    const workoutRow = this.get("SELECT workout_id, activity_type, zepp_type, started_at, started_date, duration_s, distance_m, calories_kcal, avg_hr_bpm FROM workouts ORDER BY started_at DESC LIMIT 1");
    const workout = workoutRow ? this.withConfidence(workoutRow) : workoutRow;
    const weight = this.get("SELECT measured_at, date, weight_kg, bmi FROM weight_records ORDER BY measured_at DESC LIMIT 1");
    const bp = this.get("SELECT measured_at, date, systolic_mmhg, diastolic_mmhg, pulse_bpm FROM blood_pressure ORDER BY measured_at DESC LIMIT 1");
    return {
      available: true, timezone: this.timezone, today: this.today(),
      daily, resting_hr: restingHr,
      sleep: sleepRow ? this.sleepNight(sleepRow) : null,
      charge, workout, weight, blood_pressure: bp
    };
  }

  private sleepNight(row: Row) {
    return {
      sleep_date: row.sleep_date, started_at: row.started_at, ended_at: row.ended_at, duration_s: row.duration_s, score: num(row.score),
      stage_s: stageSeconds(str(row.stages_json))
    };
  }

  // ---- trends -------------------------------------------------------------------------------------------------------
  trends(days: number) {
    if (!this.available()) return { available: false, days };
    const start = this.since(days);
    const end = this.today();
    const daily = this.all("SELECT date, steps, distance_m, active_calories_kcal, resting_hr_bpm FROM daily_summary WHERE date >= ? AND date <= ? ORDER BY date", start, end);
    const nights = this.all("SELECT sleep_date, started_at, ended_at, duration_s, score, stages_json FROM sleep WHERE sleep_date >= ? AND sleep_date <= ? ORDER BY started_at", start, end);
    const byDate = new Map<string, { sleep_date: string; duration_s: number; score: number | null; sessions: number; longest: number; stage_s: Record<string, number> | null }>();
    for (const n of nights) {
      const date = String(n.sleep_date);
      const duration = Number(n.duration_s) || 0;
      const stages = stageSeconds(str(n.stages_json));
      const cur = byDate.get(date) ?? { sleep_date: date, duration_s: 0, score: null, sessions: 0, longest: -1, stage_s: null };
      cur.duration_s += duration; cur.sessions += 1;
      if (duration > cur.longest) { cur.longest = duration; cur.score = num(n.score); }
      if (stages) { cur.stage_s ??= {}; for (const [k, v] of Object.entries(stages)) cur.stage_s[k] = (cur.stage_s[k] ?? 0) + v; }
      byDate.set(date, cur);
    }
    const sleep = [...byDate.values()].map(({ longest: _l, ...rest }) => rest);
    return {
      available: true, days, start, end, timezone: this.timezone,
      daily, sleep,
      charge: this.chargeDays(start, end),
      weight: this.all("SELECT measured_at, date, weight_kg, bmi FROM weight_records WHERE date >= ? AND date <= ? ORDER BY measured_at", start, end),
      blood_pressure: this.all("SELECT measured_at, date, systolic_mmhg, diastolic_mmhg, pulse_bpm FROM blood_pressure WHERE date >= ? AND date <= ? ORDER BY measured_at", start, end),
      stress: this.all("SELECT date, source, AVG(value) AS avg, COUNT(*) AS n FROM emotion_events WHERE date >= ? AND date <= ? AND value IS NOT NULL GROUP BY date, source ORDER BY date", start, end)
    };
  }

  private chargeDays(start: string, end: string): Row[] {
    return this.all(
      `SELECT c.date AS date, COUNT(*) AS samples, MIN(c.total) AS min, MAX(c.total) AS max, AVG(c.total) AS avg, AVG(c.mental) AS mental, AVG(c.physical) AS physical,
              (SELECT total FROM charge_samples l WHERE l.date = c.date ORDER BY l.ts_ms DESC LIMIT 1) AS last
         FROM charge_samples c WHERE c.date >= ? AND c.date <= ? GROUP BY c.date ORDER BY c.date`, start, end);
  }

  /** Hybrid Charge per day, plus 5-minute averaged samples for one date when `date` is given. */
  charge(days: number, date?: string) {
    if (!this.available()) return { available: false, days };
    const start = this.since(days);
    const end = this.today();
    const out: Record<string, unknown> = { available: true, days, start, end, timezone: this.timezone, days_data: this.chargeDays(start, end) };
    if (date) {
      out.date = date;
      out.samples = this.all(
        "SELECT (ts_ms / 300000) * 300000 AS t, AVG(total) AS total, AVG(mental) AS mental, AVG(physical) AS physical FROM charge_samples WHERE date = ? GROUP BY ts_ms / 300000 ORDER BY t", date);
      out.insights = this.all("SELECT ts_ms, insight_type, insight, insight_id FROM charge_insights WHERE date = ? ORDER BY ts_ms", date);
    }
    return out;
  }

  // ---- recovery -----------------------------------------------------------------------------------------------------
  /** Per-date HRV, resting HR, readiness and SpO2 dips for the Recovery page. Only what is stored: missing figures stay null. */
  recovery(days: number) {
    if (!this.available()) return { available: false, days };
    const start = this.since(days);
    const end = this.today();
    let rec: Row[] = [];
    try {
      rec = this.all(
        "SELECT date, hrv_ms, hrv_samples, readiness, sleep_hrv, sleep_rhr, hrv_score, rhr_score, hrv_baseline, rhr_baseline, odi, odi_events, spo2_dips, spo2_low FROM recovery_days WHERE date >= ? AND date <= ? ORDER BY date", start, end);
    } catch { /* database from before the recovery table: nothing stored yet */ }
    const rest = new Map(this.all("SELECT date, resting_hr_bpm FROM daily_summary WHERE date >= ? AND date <= ? AND resting_hr_bpm IS NOT NULL", start, end).map(r => [String(r.date), num(r.resting_hr_bpm)]));
    const byDate = new Map(rec.map(r => [String(r.date), r]));
    const dates = [...new Set([...byDate.keys(), ...rest.keys()])].sort();
    const series = dates.map(date => {
      const r = byDate.get(date);
      const hrv = num(r?.hrv_ms) ?? num(r?.sleep_hrv);
      return {
        date, hrv_ms: hrv, hrv_source: num(r?.hrv_ms) !== null ? "overnight_samples" : hrv !== null ? "readiness" : null,
        resting_hr_bpm: rest.get(date) ?? num(r?.sleep_rhr), resting_hr_source: rest.has(date) ? "daily" : num(r?.sleep_rhr) !== null ? "readiness" : null,
        readiness: num(r?.readiness), hrv_baseline: num(r?.hrv_baseline), rhr_baseline: num(r?.rhr_baseline),
        odi: num(r?.odi), odi_events: num(r?.odi_events), spo2_dips: num(r?.spo2_dips), spo2_low: num(r?.spo2_low)
      };
    });
    const nums = (k: "hrv_ms" | "resting_hr_bpm" | "readiness" | "odi") => series.map(x => x[k]).filter((v): v is number => v !== null);
    const mean = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
    const lastReadiness = [...series].reverse().find(x => x.readiness !== null);
    const dipNights = series.filter(x => x.spo2_dips !== null);
    return {
      available: true, days, start, end, timezone: this.timezone, series,
      summary: {
        avg_hrv_ms: mean(nums("hrv_ms")), hrv_days: nums("hrv_ms").length,
        avg_resting_hr_bpm: mean(nums("resting_hr_bpm")), resting_hr_days: nums("resting_hr_bpm").length,
        avg_readiness: mean(nums("readiness")), readiness_days: nums("readiness").length,
        latest_readiness: lastReadiness ? { date: lastReadiness.date, value: lastReadiness.readiness } : null,
        spo2_dips_total: dipNights.length ? dipNights.reduce((a, x) => a + (x.spo2_dips ?? 0), 0) : null,
        spo2_nights: dipNights.length, avg_odi: mean(nums("odi")),
        spo2_low: dipNights.reduce<number | null>((m, x) => (x.spo2_low !== null && (m === null || x.spo2_low < m) ? x.spo2_low : m), null)
      }
    };
  }

  // ---- training -----------------------------------------------------------------------------------------------------
  /** Week/month totals and weekly distance for the last 8 weeks, from the stored workouts (weeks start on Monday, local dates). */
  training(weeks = 8) {
    if (!this.available()) return { available: false };
    const today = this.today();
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const thisWeek = addIsoDays(today, -dow);
    const firstWeek = addIsoDays(thisWeek, -7 * (weeks - 1));
    const monthStart = `${today.slice(0, 7)}-01`;
    const prevMonthEnd = addIsoDays(monthStart, -1);
    const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
    const total = (from: string, to: string) => {
      const r = this.get("SELECT COUNT(*) AS n, COALESCE(SUM(distance_m), 0) AS dist, COALESCE(SUM(duration_s), 0) AS dur, COALESCE(SUM(calories_kcal), 0) AS kcal FROM workouts WHERE started_date >= ? AND started_date <= ?", from, to);
      return { from, to, count: Number(r?.n ?? 0), distance_m: Number(r?.dist ?? 0), duration_s: Number(r?.dur ?? 0), calories_kcal: Number(r?.kcal ?? 0) };
    };
    const rows = this.all("SELECT started_date, distance_m, duration_s FROM workouts WHERE started_date >= ? AND started_date <= ?", firstWeek, today);
    const series = Array.from({ length: weeks }, (_, i) => ({ week_start: addIsoDays(firstWeek, 7 * i), distance_m: 0, duration_s: 0, count: 0 }));
    for (const r of rows) {
      const i = Math.floor((Date.parse(`${String(r.started_date)}T00:00:00Z`) - Date.parse(`${firstWeek}T00:00:00Z`)) / (7 * 86_400_000));
      const w = series[i];
      if (!w) continue;
      w.count++; w.distance_m += num(r.distance_m) ?? 0; w.duration_s += num(r.duration_s) ?? 0;
    }
    const sports = this.all(
      "SELECT activity_type, COUNT(*) AS n, COALESCE(SUM(duration_s), 0) AS dur, COALESCE(SUM(distance_m), 0) AS dist FROM workouts WHERE started_date >= ? AND started_date <= ? GROUP BY activity_type ORDER BY dur DESC LIMIT 6", monthStart, today)
      .map(r => ({ activity_type: String(r.activity_type), count: Number(r.n), duration_s: Number(r.dur), distance_m: Number(r.dist) }));
    return {
      available: true, timezone: this.timezone, today, week_start: thisWeek,
      this_week: total(thisWeek, today), last_week: total(addIsoDays(thisWeek, -7), addIsoDays(thisWeek, -1)),
      this_month: total(monthStart, today), last_month: total(prevMonthStart, prevMonthEnd),
      weeks: series, sports
    };
  }

  // ---- workouts -----------------------------------------------------------------------------------------------------
  workouts(opts: { days?: number; type?: string; q?: string; limit: number; offset: number }) {
    if (!this.available()) return { available: false, workouts: [], total: 0, types: [] };
    const where: string[] = []; const params: SQLInputValue[] = [];
    if (opts.days !== undefined) { where.push("started_date >= ?"); params.push(this.since(opts.days)); }
    if (opts.type) { where.push("activity_type = ?"); params.push(opts.type); }
    // Free-text search: every word must match the sport name, the ISO date or a month name.
    for (const word of (opts.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
      const month = MONTHS.findIndex(m => word.length >= 3 && m.startsWith(word));
      const like = `%${word.replace(/[\\%_]/g, "")}%`;
      if (month >= 0) { where.push("(replace(activity_type, '_', ' ') LIKE ? OR started_date LIKE ? OR substr(started_date, 6, 2) = ?)"); params.push(like, like, String(month + 1).padStart(2, "0")); }
      else { where.push("(replace(activity_type, '_', ' ') LIKE ? OR started_date LIKE ?)"); params.push(like, like); }
    }
    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(WORKOUT_PAGE_MAX, opts.limit));
    const rows = this.all(
      `SELECT workout_id, activity_type, zepp_type, started_at, started_date, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, training_load,
              (SELECT COUNT(*) FROM strength_sets s WHERE s.workout_id = w.workout_id) AS strength_sets
         FROM workouts w${clause} ORDER BY started_at DESC LIMIT ? OFFSET ?`, ...params, limit, Math.max(0, opts.offset));
    const extras = this.rowExtras(rows);
    return {
      available: true, timezone: this.timezone, workouts: rows.map(r => ({ ...this.withConfidence(r), ...extras(String(r.workout_id), Number(r.strength_sets) > 0) })),
      total: Number(this.get(`SELECT COUNT(*) AS c FROM workouts${clause}`, ...params)?.c ?? 0),
      types: this.all("SELECT activity_type AS type, MIN(zepp_type) AS zepp_type, COUNT(*) AS n FROM workouts GROUP BY activity_type ORDER BY n DESC").map(r => this.withConfidence(r, "type"))
    };
  }

  /**
   * Cheap per-row extras for the list, computed for the whole page with two small queries (no upstream calls, no per-row fetch):
   * `muscles` for strength workouts (estimated from exercise ids) and `thumb` (a normalised, downsampled route) for workouts
   * whose analysis is already stored. Rows with neither get nothing, so their JSON is unchanged.
   */
  private rowExtras(rows: Array<Record<string, unknown>>): (id: string, strength: boolean) => { muscles?: MuscleSummary; thumb?: RouteThumb } {
    const muscles = new Map<string, MuscleSummary>(), thumbs = new Map<string, RouteThumb>();
    const strengthIds = rows.filter(r => Number(r.strength_sets) > 0).map(r => String(r.workout_id));
    const otherIds = rows.filter(r => !(Number(r.strength_sets) > 0)).map(r => String(r.workout_id));
    if (strengthIds.length) {
      const marks = strengthIds.map(() => "?").join(",");
      const byWorkout = new Map<string, number[]>();
      for (const r of this.all(`SELECT workout_id, action_type FROM strength_sets WHERE workout_id IN (${marks}) GROUP BY workout_id, action_type`, ...strengthIds)) {
        const list = byWorkout.get(String(r.workout_id)) ?? []; list.push(Number(r.action_type)); byWorkout.set(String(r.workout_id), list);
      }
      for (const [id, types] of byWorkout) { const m = aggregateMuscles(types); if (m) muscles.set(id, m); }
    }
    if (otherIds.length) {
      const marks = otherIds.map(() => "?").join(",");
      try {
        for (const r of this.all(`SELECT workout_id, json_extract(analysis_json, '$.route.points') AS pts FROM workout_details WHERE status = 'ok' AND workout_id IN (${marks})`, ...otherIds)) {
          if (typeof r.pts !== "string") continue;
          let pts: unknown; try { pts = JSON.parse(r.pts); } catch { continue; }
          const t = routeThumb(pts); if (t) thumbs.set(String(r.workout_id), t);
        }
      } catch { /* older database without workout_details: no thumbnails */ }
    }
    return (id, strength) => {
      const out: { muscles?: MuscleSummary; thumb?: RouteThumb } = {};
      if (strength && muscles.has(id)) out.muscles = muscles.get(id)!;
      if (!strength && thumbs.has(id)) out.thumb = thumbs.get(id)!;
      return out;
    };
  }

  /** Adds `type_confidence` ("reference" or "inferred") when the sport name is only a guess from the type number. */
  private withConfidence(row: Record<string, unknown>, typeKey = "activity_type"): Record<string, unknown> {
    const code = row.zepp_type === null || row.zepp_type === undefined ? undefined : Number(row.zepp_type);
    const conf = sportConfidence(code, String(row[typeKey]));
    return { ...row, type_confidence: conf && conf !== "verified" ? conf : null };
  }

  workout(id: string) {
    if (!this.available()) return null;
    const w = this.get(
      `SELECT workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, training_load,
              vo2max_ml_kg_min, strength_checked FROM workouts WHERE workout_id = ?`, id);
    if (!w) return null;
    const sets = this.all("SELECT seq, set_no, action_type, reps, weight_kg, duration_s, avg_hr_bpm FROM strength_sets WHERE workout_id = ? ORDER BY seq", id)
      .map(s => {
        const actionType = Number(s.action_type);
        const name = strengthExerciseName(actionType);
        return { ...s, exercise: name, known: !name.startsWith("unknown_") };
      });
    // Estimated from the exercise ids of the sets (null when no id has muscle data, e.g. unknown_0 / unassigned only).
    const muscles = aggregateMuscles(sets.map(s => Number((s as Record<string, unknown>).action_type)));
    return { timezone: this.timezone, workout: this.withConfidence(w), sets, muscles };
  }

  /** Stored workout analysis (series, splits, zones, route), or null when none was stored yet. */
  analysis(id: string): { status: string; fetched_at: string; analysis: unknown } | null {
    if (!this.available()) return null;
    let row: Row | null;
    try { row = this.get("SELECT status, analysis_json, fetched_at FROM workout_details WHERE workout_id = ?", id); } catch { return null; }
    if (!row) return null;
    let analysis: unknown = null;
    if (typeof row.analysis_json === "string") { try { analysis = JSON.parse(row.analysis_json); } catch { analysis = null; } }
    return { status: String(row.status), fetched_at: String(row.fetched_at), analysis };
  }

  // ---- weight / exercises / status ----------------------------------------------------------------------------------
  weight(days: number) {
    if (!this.available()) return { available: false, days, records: [] };
    return {
      available: true, days, timezone: this.timezone,
      records: this.all("SELECT measured_at, date, weight_kg, height_cm, bmi FROM weight_records WHERE date >= ? AND date <= ? ORDER BY measured_at", this.since(days), this.today())
    };
  }

  /** Every exercise id seen in strength sets, with whether it has a name. Unknown ids carry usage hints for mapping them later. */
  exercises() {
    if (!this.available()) return { available: false, exercises: [] };
    const rows = this.all(
      `SELECT s.action_type AS action_type, COUNT(*) AS sets, COUNT(DISTINCT s.workout_id) AS workouts, MIN(w.started_date) AS first_date, MAX(w.started_date) AS last_date,
              AVG(s.reps) AS avg_reps, MAX(s.weight_kg) AS max_weight_kg, MAX(w.workout_id) AS example_workout_id
         FROM strength_sets s JOIN workouts w ON w.workout_id = s.workout_id GROUP BY s.action_type ORDER BY COUNT(*) DESC`);
    const exercises = rows.map(r => {
      const name = strengthExerciseName(Number(r.action_type));
      return { ...r, name, known: !name.startsWith("unknown_"), source: strengthExerciseSource(Number(r.action_type)) };
    });
    return { available: true, exercises, unknown_count: exercises.filter(e => !e.known).length };
  }

  status(extra?: unknown) {
    if (!this.available()) return { available: false, timezone: this.timezone, ...(extra ? { sync: extra } : {}) };
    const run = (where: string) => this.get(
      `SELECT id, trigger, started_at, finished_at, ok, status, range_start, range_end, daily_rows, sleep_rows, workout_rows, strength_set_rows, warning_count, error_kind FROM sync_runs${where} ORDER BY id DESC LIMIT 1`);
    const coverage = COVERAGE.map(([table, col]) => {
      const r = this.get(`SELECT COUNT(*) AS rows, MIN(${col}) AS first, MAX(${col}) AS last FROM ${table}`);
      return { table, rows: Number(r?.rows ?? 0), first: str(r?.first), last: str(r?.last) };
    });
    let bytes: number | null = null;
    try { bytes = statSync(this.file).size; } catch { /* ignore */ }
    return {
      available: true, timezone: this.timezone, now: new Date(this.now()).toISOString(),
      last_run: run(""), last_success: run(" WHERE ok = 1"),
      recent_runs: this.all("SELECT id, trigger, started_at, ok, status, error_kind FROM sync_runs ORDER BY id DESC LIMIT 5"),
      coverage, strength_sets: this.count("strength_sets"), charge_insights: this.count("charge_insights"),
      schema_version: Number(this.get("SELECT MAX(version) AS v FROM schema_migrations")?.v ?? 0),
      db_bytes: bytes, ...(extra ? { sync: extra } : {})
    };
  }
}

/** Seconds per sleep stage from a stored stages_json (an array of { start, end, stage }); null when it cannot be read. */
export function stageSeconds(json: string | null): Record<string, number> | null {
  if (!json) return null;
  try {
    const segments = JSON.parse(json) as unknown;
    if (!Array.isArray(segments)) return null;
    const out: Record<string, number> = {};
    for (const seg of segments as Array<{ start?: string; end?: string; stage?: string }>) {
      const a = Date.parse(seg.start ?? ""); const b = Date.parse(seg.end ?? "");
      const stage = (STAGES as readonly string[]).includes(seg.stage ?? "") ? seg.stage! : "unknown";
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) out[stage] = (out[stage] ?? 0) + Math.round((b - a) / 1000);
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}