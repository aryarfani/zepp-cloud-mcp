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
  },
  {
    version: 2,
    name: "weight_bp_charge_emotion_streams",
    sql: `
CREATE TABLE weight_records (
  measured_at TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  height_cm REAL,
  bmi REAL,
  body_style INTEGER,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_weight_date ON weight_records (date);

CREATE TABLE blood_pressure (
  measured_at TEXT NOT NULL,
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  systolic_mmhg INTEGER NOT NULL,
  diastolic_mmhg INTEGER NOT NULL,
  pulse_bpm INTEGER,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (measured_at, source)
);
CREATE INDEX idx_bp_date ON blood_pressure (date);

CREATE TABLE charge_samples (
  ts_ms INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  total REAL NOT NULL,
  mental REAL,
  physical REAL,
  status INTEGER
);
CREATE INDEX idx_charge_samples_date ON charge_samples (date);

CREATE TABLE charge_insights (
  ts_ms INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  insight_type INTEGER,
  insight REAL,
  insight_id INTEGER,
  raw_json TEXT NOT NULL
);
CREATE INDEX idx_charge_insights_date ON charge_insights (date);

CREATE TABLE emotion_events (
  source TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  date TEXT NOT NULL,
  value REAL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, ts_ms)
);
CREATE INDEX idx_emotion_date ON emotion_events (date);

CREATE TABLE event_streams (
  stream_id TEXT PRIMARY KEY,
  family TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sub_type TEXT,
  decoded_by TEXT,
  status TEXT NOT NULL,
  latest_event_at TEXT,
  window_days INTEGER NOT NULL,
  checked_at TEXT NOT NULL
);

ALTER TABLE sync_runs ADD COLUMN weight_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN blood_pressure_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN charge_sample_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN charge_insight_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN emotion_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN event_stream_rows INTEGER NOT NULL DEFAULT 0;
`  },
  {
    version: 3,
    name: "workout detail analysis",
    sql: `
-- Compact per-workout analysis (series, splits, zones, route) derived from Zepp's detail payload; the raw payload is not kept.
CREATE TABLE workout_details (
  workout_id TEXT PRIMARY KEY REFERENCES workouts (workout_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  analysis_json TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL
);
`
  },
  {
    version: 4,
    name: "recovery days",
    sql: `
-- One row per wake-up date with the recovery figures Zepp reports (HRV, readiness, SpO2 dips / ODI). Additive only.
CREATE TABLE recovery_days (
  date TEXT PRIMARY KEY,
  hrv_ms REAL,
  hrv_samples INTEGER,
  readiness INTEGER,
  sleep_hrv REAL,
  sleep_rhr REAL,
  hrv_score INTEGER,
  rhr_score INTEGER,
  hrv_baseline REAL,
  rhr_baseline REAL,
  odi REAL,
  odi_events INTEGER,
  spo2_dips INTEGER,
  spo2_low INTEGER,
  updated_at TEXT NOT NULL
);
ALTER TABLE sync_runs ADD COLUMN recovery_rows INTEGER NOT NULL DEFAULT 0;
`
  }
];
