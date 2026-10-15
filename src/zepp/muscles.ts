// Muscle groups worked by a strength workout, estimated from the exercise ids of its sets (see strength-muscle-catalog.ts).
// This is NOT measured by the watch: it is the Gadgetbridge/Zepp catalogue's idea of which muscles each exercise trains.
import { MUSCLE_IDS, STRENGTH_MUSCLE_CATALOG } from "./strength-muscle-catalog";

export { MUSCLE_IDS };
export interface MuscleSummary { p: string[]; s: string[] }

const KNOWN = new Set<string>(MUSCLE_IDS);
const has = (id: number) => Object.prototype.hasOwnProperty.call(STRENGTH_MUSCLE_CATALOG, id);
const split = (text: string) => text.split(" ").filter(m => m && KNOWN.has(m));

/** Primary and secondary muscle ids for one exercise id; empty for ids without muscle data (0, unknown ids, events). */
export function exerciseMuscles(actionType: number): MuscleSummary {
  if (!has(actionType)) return { p: [], s: [] };
  const [p, s] = STRENGTH_MUSCLE_CATALOG[actionType]!;
  return { p: split(p), s: split(s) };
}

/**
 * Aggregates muscles over the exercise ids of a workout's sets. A muscle that is primary for any exercise is primary;
 * otherwise a muscle that is secondary for any exercise is secondary. Returns null when no id has muscle data.
 */
export function aggregateMuscles(actionTypes: Iterable<number>): MuscleSummary | null {
  const primary = new Set<string>(), secondary = new Set<string>();
  for (const id of actionTypes) {
    const m = exerciseMuscles(id);
    m.p.forEach(x => primary.add(x));
    m.s.forEach(x => secondary.add(x));
  }
  for (const x of primary) secondary.delete(x);
  if (!primary.size && !secondary.size) return null;
  const order = (set: Set<string>) => MUSCLE_IDS.filter(m => set.has(m)) as string[];
  return { p: order(primary), s: order(secondary) };
}
