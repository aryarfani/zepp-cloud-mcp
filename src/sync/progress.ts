import type { SyncWindowMode } from "./window";

export type SyncStepId = "daily_sleep" | "workouts" | "strength" | "charge" | "emotion" | "blood_pressure" | "routes" | "weight" | "streams";

/** The steps of a sync run in execution order. `enabled` says whether the configured sync runs the step at all. */
export const SYNC_STEPS: ReadonlyArray<{ id: SyncStepId; label: string; enabled: (options: { skipSteps?: ReadonlySet<string> }) => boolean }> = [
  { id: "daily_sleep", label: "Daily & sleep", enabled: o => !o.skipSteps?.has("daily_sleep") },
  { id: "workouts", label: "Workouts", enabled: o => !o.skipSteps?.has("workouts") },
  { id: "strength", label: "Strength", enabled: o => !o.skipSteps?.has("strength") },
  { id: "charge", label: "Hybrid Charge", enabled: o => !o.skipSteps?.has("charge") },
  { id: "emotion", label: "Emotion", enabled: o => !o.skipSteps?.has("emotion") },
  { id: "blood_pressure", label: "Blood pressure", enabled: o => !o.skipSteps?.has("blood_pressure") },
  { id: "routes", label: "Routes (workout details)", enabled: o => !o.skipSteps?.has("routes") },
  { id: "weight", label: "Weight", enabled: o => !o.skipSteps?.has("weight") },
  { id: "streams", label: "Streams", enabled: o => !o.skipSteps?.has("streams") }
];

/** What the dashboard may show about a running sync. Labels and dates only, nothing about credentials or upstream responses. */
export interface SyncProgress {
  steps: Array<{ id: SyncStepId; label: string }>;
  /** Index into `steps` of the step being worked on. */
  current: number;
  window_start: string;
  window_end: string;
  mode: SyncWindowMode;
  /** Local date the previous successful run covered up to (overlap mode). */
  since: string | null;
  overlap_days: number;
  /** Only when the window is fetched in more than one chunk (long windows): which chunk, newest first. */
  chunk?: { index: number; total: number };
}

export const enabledSteps = (options: { skipSteps?: ReadonlySet<string> }) => SYNC_STEPS.filter(s => s.enabled(options)).map(({ id, label }) => ({ id, label }));
