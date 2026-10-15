// Zepp strength exercise names, keyed by the numeric `actionType` Zepp stores per set.
// Hand-written from exercises the owner has actually logged and checked against the Zepp app.
// Do NOT bulk-copy third-party catalogs (e.g. Gadgetbridge's zeppos.json is AGPL-3.0).
// To add an exercise: find the set in the Zepp app, call get_strength_sets for that workout,
// read the `action_type` of the `unknown_<id>` row, then add `<id>: "Name"` below.
// Unknown ids are reported as `unknown_<id>`.
export const STRENGTH_EXERCISE_NAMES: Readonly<Record<number, string>> = {
  4: "Triceps Pushdowns",
  6: "Bench Press",
  63: "Shoulder Press",
  64: "Pull Up",
  130: "Machine Shoulder Press",
  1988: "Dip"
};

export function strengthExerciseName(actionType: number): string {
  return STRENGTH_EXERCISE_NAMES[actionType] ?? `unknown_${actionType}`;
}