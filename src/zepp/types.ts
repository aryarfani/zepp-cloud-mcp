export type SourceScope = "device" | "user_fused" | "unknown";

export interface HeartRateDay {
  date: string;
  min_bpm?: number;
  avg_bpm?: number;
  max_bpm?: number;
  resting_bpm?: number;
  sample_count: number;
  source_scope: SourceScope;
}

export interface DailySummary {
  date: string;
  steps?: number;
  distance_m?: number;
  active_calories_kcal?: number;
  resting_hr_bpm?: number;
}

export interface SleepStageSegment {
  start: string;
  end: string;
  stage: "awake" | "light" | "deep" | "rem" | "unknown";
}

export interface SleepNight {
  sleep_date: string;
  started_at: string;
  ended_at: string;
  duration_s: number;
  score?: number;
  stages: SleepStageSegment[];
  source_scope: SourceScope;
}

export interface MetricPoint {
  time: string;
  value: number;
  unit: string;
  source_scope: SourceScope;
}

export interface RecoveryDay {
  date: string;
  hrv_sdnn_ms?: number;
  hrv_rmssd_ms?: number;
  readiness_score?: number;
  stress_avg?: number;
  spo2_avg_pct?: number;
  respiratory_rate_bpm?: number;
  source_scope: SourceScope;
}

export interface TrainingStatusDay {
  date: string;
  sport_load?: number;
  vo2max_ml_kg_min?: number;
  lactate_threshold_hr_bpm?: number;
  lactate_threshold_pace_s_per_km?: number;
}
