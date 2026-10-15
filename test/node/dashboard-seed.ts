import { DatabaseSync } from "node:sqlite";
import { ZeppStore } from "../../src/store/store";

const T0 = "2026-10-15T00:00:00.000Z";

/** Creates the schema and a small data set around 2026-10-15 (used by the dashboard tests and the jsdom smoke check). */
export function seedDashboardDb(file: string): void {
  const store = new ZeppStore(file); // creates the schema
  store.close();
  const db = new DatabaseSync(file);
  const u = "2026-10-15T00:00:00Z";
  for (let i = 0; i < 5; i++) {
    const date = `2026-10-${String(11 + i).padStart(2, "0")}`;
    db.prepare("INSERT INTO daily_summary (date, steps, distance_m, active_calories_kcal, resting_hr_bpm, updated_at) VALUES (?,?,?,?,?,?)").run(date, 6000 + i * 1000, 4000 + i, 300, i === 4 ? null : 60 + i, u);
  }
  db.prepare("INSERT INTO daily_summary (date, steps, updated_at) VALUES (?,?,?)").run("2026-06-01", 1234, u); // outside 30/90 days
  const stages = JSON.stringify([
    { start: "2026-10-14T16:00:00.000Z", end: "2026-10-14T18:00:00.000Z", stage: "light" },
    { start: "2026-10-14T18:00:00.000Z", end: "2026-10-14T19:30:00.000Z", stage: "deep" },
    { start: "2026-10-14T19:30:00.000Z", end: "2026-10-14T23:00:00.000Z", stage: "rem" }
  ]);
  db.prepare("INSERT INTO sleep (started_at, sleep_date, ended_at, duration_s, score, stages_json, source_scope, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("2026-10-14T16:00:00.000Z", "2026-10-15", "2026-10-14T23:00:00.000Z", 25200, 82, stages, "device", u);
  db.prepare("INSERT INTO sleep (started_at, sleep_date, ended_at, duration_s, score, stages_json, source_scope, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("2026-10-14T06:00:00.000Z", "2026-10-14", "2026-10-14T07:00:00.000Z", 3600, null, "not json", "device", u);
  const w = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  w.run("w-run", "outdoor_running", 1, "2026-10-14T23:00:00.000Z", "2026-10-15", "2026-10-15T00:00:00.000Z", 3600, 10000, 600, 150, 175, "device", "{}", "{\"secret\":\"raw-only\"}", 0, u);
  w.run("w-str", "strength_training", 52, "2026-10-13T01:00:00.000Z", "2026-10-13", "2026-10-13T02:00:00.000Z", 3600, null, 300, 120, 150, "device", "{}", "{}", 1, u);
  const s = db.prepare("INSERT INTO strength_sets (workout_id, seq, set_no, exercise, action_type, reps, weight_kg, duration_s, avg_hr_bpm) VALUES (?,?,?,?,?,?,?,?,?)");
  s.run("w-str", 0, 0, "unknown_64", 64, 10, null, 31, 98);
  s.run("w-str", 1, 1, "Bench Press", 6, 12, 40, 49, 106);
  s.run("w-str", 2, 2, "unknown_9999", 9999, 8, 15, 40, 110);
  db.prepare("INSERT INTO weight_records (measured_at, date, weight_kg, height_cm, bmi, body_style, raw_json, updated_at) VALUES (?,?,?,?,?,?,?,?)").run("2026-10-14T03:00:00Z", "2026-10-14", 64.5, 166, 23.4, 0, "{}", u);
  db.prepare("INSERT INTO weight_records (measured_at, date, weight_kg, height_cm, bmi, body_style, raw_json, updated_at) VALUES (?,?,?,?,?,?,?,?)").run("2026-08-01T03:00:00Z", "2026-08-01", 66, 166, 24, 0, "{}", u);
  const c = db.prepare("INSERT INTO charge_samples (ts_ms, date, total, mental, physical, status) VALUES (?,?,?,?,?,?)");
  const base = Date.parse(T0);
  for (let i = 0; i < 12; i++) c.run(base + i * 60_000, "2026-10-15", 40 + i, 7, 66, 0);
  c.run(base - 86_400_000, "2026-10-14", 30, 6, 60, 0);
  db.prepare("INSERT INTO charge_insights (ts_ms, date, insight_type, insight, insight_id, raw_json) VALUES (?,?,?,?,?,?)").run(base, "2026-10-15", 3, 29, 1, "{}");
  db.prepare("INSERT INTO emotion_events (source, ts_ms, date, value, raw_json, updated_at) VALUES (?,?,?,?,?,?)").run("single_stress", base, "2026-10-15", 44, "{}", u);
  db.prepare("INSERT INTO sync_runs (trigger, started_at, finished_at, ok, status, range_start, range_end, daily_rows) VALUES (?,?,?,?,?,?,?,?)").run("scheduled", "2026-10-15T04:00:00Z", "2026-10-15T04:03:00Z", 1, "ok", "2026-10-08", "2026-10-15", 8);
  db.close();
}
