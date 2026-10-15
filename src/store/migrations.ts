export interface Migration { version: number; name: string; sql: string }

/** Append-only. Never edit an applied migration; add a new version instead. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
CREATE TABLE daily_summary (
  date TEXT PRIMARY KEY,
  steps INTEGER,
  distance_m REAL,
  active_calories_kcal REAL,
  resting_hr_bpm REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sleep (
  started_at TEXT PRIMARY KEY,
  sleep_date TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_s INTEGER NOT NULL,
  score REAL,
  stages_json TEXT NOT NULL,
  source_scope TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sleep_date ON sleep (sleep_date);

CREATE TABLE workouts (
  workout_id TEXT PRIMARY KEY,
  activity_type TEXT NOT NULL,
  zepp_type INTEGER,
  started_at TEXT NOT NULL,
  started_date TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_s INTEGER NOT NULL,
  distance_m REAL,
  calories_kcal REAL,
  avg_hr_bpm REAL,
  max_hr_bpm REAL,
  training_load REAL,
  vo2max_ml_kg_min REAL,
  source_scope TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  strength_checked INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_workouts_started ON workouts (started_at);
CREATE INDEX idx_workouts_date ON workouts (started_date);

CREATE TABLE strength_sets (
  workout_id TEXT NOT NULL REFERENCES workouts (workout_id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  set_no INTEGER NOT NULL,
  exercise TEXT NOT NULL,
  action_type INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight_kg REAL,
  duration_s REAL,
  avg_hr_bpm INTEGER,
  PRIMARY KEY (workout_id, seq)
);
CREATE INDEX idx_strength_exercise ON strength_sets (action_type);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  daily_rows INTEGER NOT NULL DEFAULT 0,
  sleep_rows INTEGER NOT NULL DEFAULT 0,
  workout_rows INTEGER NOT NULL DEFAULT 0,
  strength_set_rows INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error_message TEXT
);
CREATE INDEX idx_sync_runs_started ON sync_runs (started_at);
`
  }
];