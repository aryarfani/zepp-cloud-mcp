// Zepp strength exercise names, keyed by the numeric `actionType` Zepp stores per set (lap column 28).
// Resolution order: the owner's own names below (hand-checked against the Zepp app) > the Gadgetbridge catalog
// (strength-exercise-catalog.ts, AGPL-3.0, see its header) > `unknown_<id>`. Id 0 is Zepp's "unassigned" set and is never named.
// To correct or override a catalog name: find the set in the Zepp app, call get_strength_sets for that workout,
// read the `action_type`, then add `<id>: "Name"` below (this table always wins).
import { STRENGTH_EXERCISE_CATALOG } from "./strength-exercise-catalog";

export const STRENGTH_EXERCISE_NAMES: Readonly<Record<number, string>> = {
  4: "Triceps Pushdowns",
  6: "Bench Press",
  63: "Shoulder Press",
  64: "Pull Up",
  130: "Machine Shoulder Press",
  1988: "Dip"
};

export type ExerciseNameSource = "owner" | "catalog" | "unknown";

const has = (table: Readonly<Record<number, string>>, id: number) => Object.prototype.hasOwnProperty.call(table, id);

export function strengthExerciseSource(actionType: number): ExerciseNameSource {
  if (actionType === 0) return "unknown";
  if (has(STRENGTH_EXERCISE_NAMES, actionType)) return "owner";
  if (has(STRENGTH_EXERCISE_CATALOG, actionType)) return "catalog";
  return "unknown";
}

export function strengthExerciseName(actionType: number): string {
  if (actionType === 0) return "unknown_0";
  return STRENGTH_EXERCISE_NAMES[actionType] ?? STRENGTH_EXERCISE_CATALOG[actionType] ?? `unknown_${actionType}`;
}
