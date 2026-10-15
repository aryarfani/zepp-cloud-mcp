// Fetch one workout's detail from Zepp, reduce it to a compact analysis and store it. Used by the daily sync and by the dashboard's lazy fetch.
import type { ServiceContext } from "../services";
import type { ZeppStore } from "../store/store";
import { analyzeWorkout, type WorkoutAnalysis } from "../zepp/workout-analysis";
import { fetchWorkoutRaw } from "../zepp/workouts";

/** Returns the analysis (null when the detail had nothing to show). Upstream errors propagate to the caller. */
export async function fetchAndStoreAnalysis(ctx: ServiceContext, store: ZeppStore, workoutId: string, nowIso: string): Promise<WorkoutAnalysis | null> {
  const detail = await fetchWorkoutRaw(ctx, workoutId);
  const analysis = analyzeWorkout(detail, store.workoutHistoryItem(workoutId) ?? {});
  const useful = Boolean(analysis.series || analysis.route || analysis.splits.length);
  store.saveWorkoutAnalysis(workoutId, useful ? analysis : null, nowIso);
  return useful ? analysis : null;
}