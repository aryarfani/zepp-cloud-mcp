import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { strengthExerciseName } from "./strength-exercises";
import { fetchWorkoutRaw } from "./workouts";

// Zepp stores one `data.lap` row per set for strength workouts: ';'-separated rows, ','-separated columns
// (62 columns on older firmware, 70 on newer; the columns used here are identical in both).
// Verified against real workouts: 0 set index, 1 duration s, 4 avg HR, 21 weight kg, 22 reps,
// 28 actionType (exercise id), 43 duration ms. Other columns are ignored on purpose.
const COL = { set: 0, durationS: 1, avgHr: 4, weightKg: 21, reps: 22, actionType: 28, durationMs: 43 } as const;
const MIN_COLUMNS = COL.durationMs + 1;

export interface StrengthSet {
  set: number;
  exercise: string;
  action_type: number;
  reps: number;
  /** null for bodyweight: Zepp uses -1 (none) or 0 (e.g. dips) when no external weight was set. */
  weight_kg: number | null;
  duration_s: number | null;
  avg_hr_bpm: number | null;
}

export interface StrengthExerciseSummary {
  exercise: string;
  action_type: number;
  sets: number;
  total_reps: number;
  /** Sum of weight_kg * reps over sets with a valid (>0) weight; 0 for pure bodyweight exercises. */
  volume_kg: number;
  max_weight_kg: number | null;
}

export interface StrengthSetsResult {
  workout_id: string;
  sets: StrengthSet[];
  exercises: StrengthExerciseSummary[];
  totals: { sets: number; reps: number; volume_kg: number };
}

export interface ParsedStrengthLap { sets: StrengthSet[]; malformed: number; ignored: number }

const round1 = (n: number) => Math.round(n * 10) / 10;

function num(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse `data.lap`. Malformed rows are counted and skipped; rows with no reps (e.g. non-strength laps) are ignored. */
export function parseStrengthLap(lap: unknown): ParsedStrengthLap {
  const result: ParsedStrengthLap = { sets: [], malformed: 0, ignored: 0 };
  if (typeof lap !== "string") return result;
  for (const raw of lap.split(";")) {
    if (raw.trim() === "") continue;
    const c = raw.split(",");
    const set = num(c[COL.set]);
    const reps = num(c[COL.reps]);
    const actionType = num(c[COL.actionType]);
    if (c.length < MIN_COLUMNS || set === undefined || !Number.isInteger(set) || set < 0
      || reps === undefined || !Number.isInteger(reps) || reps < 0 || reps > 10_000
      || actionType === undefined || !Number.isInteger(actionType) || actionType < -1) {
      result.malformed++;
      continue;
    }
    if (reps === 0 || actionType < 0) { result.ignored++; continue; }
    const weight = num(c[COL.weightKg]);
    const durationMs = num(c[COL.durationMs]);
    const durationS = durationMs !== undefined && durationMs > 0 ? durationMs / 1000 : num(c[COL.durationS]);
    const hr = num(c[COL.avgHr]);
    result.sets.push({
      set, exercise: strengthExerciseName(actionType), action_type: actionType, reps,
      weight_kg: weight !== undefined && weight > 0 && weight <= 1000 ? weight : null,
      duration_s: durationS !== undefined && durationS >= 0 && durationS <= 86_400 ? round1(durationS) : null,
      avg_hr_bpm: hr !== undefined && hr >= 20 && hr <= 250 ? Math.round(hr) : null
    });
  }
  result.sets.sort((a, b) => a.set - b.set);
  return result;
}

export function rollupStrengthSets(sets: readonly StrengthSet[]): { exercises: StrengthExerciseSummary[]; totals: StrengthSetsResult["totals"] } {
  const byType = new Map<number, StrengthExerciseSummary>();
  let totalReps = 0;
  let totalVolume = 0;
  for (const s of sets) {
    let ex = byType.get(s.action_type);
    if (!ex) {
      ex = { exercise: s.exercise, action_type: s.action_type, sets: 0, total_reps: 0, volume_kg: 0, max_weight_kg: null };
      byType.set(s.action_type, ex);
    }
    ex.sets++;
    ex.total_reps += s.reps;
    totalReps += s.reps;
    if (s.weight_kg !== null) {
      ex.volume_kg += s.weight_kg * s.reps;
      totalVolume += s.weight_kg * s.reps;
      ex.max_weight_kg = ex.max_weight_kg === null ? s.weight_kg : Math.max(ex.max_weight_kg, s.weight_kg);
    }
  }
  const exercises = [...byType.values()].map(e => ({ ...e, volume_kg: round1(e.volume_kg) }));
  return { exercises, totals: { sets: sets.length, reps: totalReps, volume_kg: round1(totalVolume) } };
}

/** True when the workout detail carries at least one usable strength set row (used by get_workout). */
export function hasStrengthSets(detail: Record<string, unknown>): boolean {
  return parseStrengthLap(detail.lap).sets.length > 0;
}

export async function getStrengthSets(ctx: ServiceContext, workoutId: string): Promise<Envelope<StrengthSetsResult>> {
  const detail = await fetchWorkoutRaw(ctx, workoutId);
  const parsed = parseStrengthLap(detail.lap);
  const tz = ctx.config.USER_TIMEZONE;
  if (parsed.sets.length === 0) {
    const warnings = ["No strength set data found for this workout. It may not be a strength workout, or Zepp did not record sets."];
    if (parsed.malformed) warnings.push(`Skipped ${parsed.malformed} malformed lap row(s).`);
    return noData(tz, warnings);
  }
  const warnings: string[] = [];
  if (parsed.malformed) warnings.push(`Skipped ${parsed.malformed} malformed lap row(s).`);
  if (parsed.ignored) warnings.push(`Ignored ${parsed.ignored} lap row(s) without reps or exercise id.`);
  const { exercises, totals } = rollupStrengthSets(parsed.sets);
  return ok({ workout_id: workoutId, sets: parsed.sets, exercises, totals }, tz, { warnings });
}