import { noData, ok } from "../response";
import type { ZeppStore } from "../store/store";
import { rollupStrengthSets } from "../zepp/strength";

export type RefreshRequest = { start: string; end: string } | { workoutId: string; detail: boolean };
export interface SetChanges { exercise?: string; reps?: number; weight_kg?: number | null }
export interface NewSet { exercise: string; reps: number; weight_kg: number | null }

export function createLocalWorkoutAccess(deps: { store: ZeppStore; timezone: string; refresh: (request: RefreshRequest) => Promise<string[]> }) {
  const { store, timezone, refresh } = deps;
  const output = <T>(data: T, warnings: string[] = []) => ({ ...ok(data, timezone, { source: "sqlite", partial: warnings.length > 0, warnings }), status: warnings.length ? "partial" as const : "ok" as const });
  const missing = (warnings: string[]) => ({ ...noData(timezone, warnings), status: warnings.length ? "partial" as const : "no_data" as const, meta: { ...noData(timezone, warnings).meta, source: "sqlite" as const, partial: warnings.length > 0 } });
  const mutation = <T>(fn: () => T) => output(fn());
  return {
    async list(start: string, end: string, activityType: string | undefined, limit: number) {
      const warnings = await refresh({ start, end });
      const result = store.localWorkouts(start, end, activityType, limit);
      return result.length ? output(result, warnings) : missing(warnings);
    },
    async get(workoutId: string) {
      const warnings = await refresh({ workoutId, detail: true });
      const result = store.localWorkout(workoutId);
      if (!result) return missing([...warnings, "Workout is not available in the local store."]);
      const conflicts = store.strengthConflicts(workoutId);
      if (conflicts.length) warnings.push(`${conflicts.length} saved set correction(s) could not be matched after source data changed.`);
      const sets = store.effectiveStrengthSets(workoutId);
      const available = store.localWorkoutAvailableDetail(workoutId);
      if (sets.length) available.push("strength_sets");
      if (result.summary.zepp_type !== 52 || available.some(item => item !== "strength_sets")) warnings.push("Detail availability is based on stored analysis and may be incomplete; sample and route tools can query Zepp directly.");
      return output({ ...result.summary, available_detail: available }, warnings);
    },
    async sets(workoutId: string) {
      const warnings = await refresh({ workoutId, detail: true });
      if (!store.localWorkout(workoutId)) return missing([...warnings, "Workout is not available in the local store."]);
      const sets = store.effectiveStrengthSets(workoutId);
      const conflicts = store.strengthConflictDetails(workoutId);
      if (conflicts.length) warnings.push(`${conflicts.length} saved set correction(s) could not be matched after source data changed; inspect conflicts before applying them to current sets.`);
      return output({ workout_id: workoutId, sets, ...rollupStrengthSets(sets), conflicts }, warnings);
    },
    async create(workoutId: string, values: NewSet) { return mutation(() => store.createStrengthSet(workoutId, values)); },
    async update(workoutId: string, id: string, values: SetChanges) { return mutation(() => { store.updateStrengthSet(workoutId, id, values); return store.effectiveStrengthSets(workoutId).find(s => s.id === id)!; }); },
    async remove(workoutId: string, id: string) { return mutation(() => { store.deleteStrengthSet(workoutId, id); return { workout_id: workoutId, id, deleted: true }; }); },
    async discardConflict(workoutId: string, id: string) { return mutation(() => { store.discardStrengthConflict(workoutId, id); return { workout_id: workoutId, id, discarded: true }; }); }
  };
}

export type LocalWorkoutAccess = ReturnType<typeof createLocalWorkoutAccess>;
