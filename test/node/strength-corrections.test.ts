import { expect, it } from "vitest";
import { ZeppStore } from "../../src/store/store";
import { normalizeWorkoutSummary } from "../../src/zepp/workouts";
import { DashboardData } from "../../src/dashboard/data";
import { rollupStrengthSets } from "../../src/zepp/strength";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MIGRATIONS } from "../../src/store/migrations";
import { DatabaseSync } from "node:sqlite";
import { parseStrengthLap } from "../../src/zepp/strength";
import { lapRow } from "./helpers";

it("preserves a per-set correction after the original sets are refreshed", () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "Asia/Jakarta")!;
    store.upsertWorkout(workout, "2023-11-15", {}, new Date().toISOString());
    const sets = [{ set: 1, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 }];
    store.replaceStrengthSets(workout.workout_id, sets, ["source-1"]);
    const first = store.effectiveStrengthSets(workout.workout_id)[0]!;
    store.updateStrengthSet(workout.workout_id, first.id, { exercise: "Pull Up", reps: 10 });
    store.replaceStrengthSets(workout.workout_id, sets, ["source-1"]);
    expect(store.effectiveStrengthSets(workout.workout_id)[0]).toMatchObject({ id: first.id, exercise: "Pull Up", reps: 10, weight_kg: null });
  } finally { store.close(); }
});

it("groups distinct custom exercises separately even without an exercise id", () => {
  const base = { set: 1, action_type: -1, reps: 5, weight_kg: 20, duration_s: null, avg_hr_bpm: null };
  const result = rollupStrengthSets([{ ...base, exercise: "Bench" }, { ...base, exercise: "Row" }]);
  expect(result.exercises.map(e => e.exercise)).toEqual(["Bench", "Row"]);
  expect(result.totals.volume_kg).toBe(200);
});

it("shows corrected and added sets consistently in dashboard workout and exercises", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zepp-corrections-"));
  const file = path.join(dir, "data.db");
  const store = new ZeppStore(file);
  const dashboard = new DashboardData(file, { timezone: "Asia/Jakarta" });
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "Asia/Jakarta")!;
    store.upsertWorkout(workout, "2023-11-15", {}, new Date().toISOString());
    store.replaceStrengthSets(workout.workout_id, [{ set: 1, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 }]);
    const id = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    store.updateStrengthSet(workout.workout_id, id, { exercise: "Pull Up", reps: 10 });
    store.createStrengthSet(workout.workout_id, { exercise: "Bench Press", reps: 5, weight_kg: 30 });
    expect(dashboard.workout(workout.workout_id)!.sets).toEqual(expect.arrayContaining([expect.objectContaining({ exercise: "Pull Up", reps: 10 }), expect.objectContaining({ exercise: "Bench Press", reps: 5 })]));
    expect(dashboard.exercises().exercises).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pull Up" }), expect.objectContaining({ name: "Bench Press" })]));
    expect(dashboard.workouts({ limit: 10, offset: 0 }).workouts[0]).toMatchObject({ strength_sets: 2 });
    expect(dashboard.status()).toMatchObject({ strength_sets: 2 });
    expect(store.stats().strength_sets).toMatchObject({ rows: 2 });
  } finally { dashboard.close(); store.close(); rmSync(dir, { recursive: true, force: true }); }
});

it("keeps additions and deletions through refresh and flags changed source rows", () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000001", source: "run.device", endTime: 1700000600, type: 52 }, "Asia/Jakarta")!;
    store.upsertWorkout(workout, "2023-11-15", {}, new Date().toISOString());
    const original = { set: 1, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 };
    store.replaceStrengthSets(workout.workout_id, [original], ["old"]);
    const id = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    store.updateStrengthSet(workout.workout_id, id, { exercise: "Pull Up" });
    const added = store.createStrengthSet(workout.workout_id, { exercise: "Bench Press", reps: 5, weight_kg: 30 });
    store.replaceStrengthSets(workout.workout_id, [{ ...original, reps: 9 }], ["changed"]);
    expect(store.strengthConflicts(workout.workout_id)).toContain(id);
    expect(store.strengthConflictDetails(workout.workout_id)).toEqual([expect.objectContaining({ id, exercise: "Pull Up", original: expect.objectContaining({ reps: 8 }) })]);
    store.discardStrengthConflict(workout.workout_id, id);
    expect(store.strengthConflicts(workout.workout_id)).toEqual([]);
    expect(store.effectiveStrengthSets(workout.workout_id).find(s => s.id === added.id)).toMatchObject({ exercise: "Bench Press", reps: 5 });
    store.deleteStrengthSet(workout.workout_id, added.id);
    expect(store.effectiveStrengthSets(workout.workout_id).some(s => s.id === added.id)).toBe(false);
  } finally { store.close(); }
});

it("keeps distinct source IDs when rows are reordered and preserves deletion tombstones", () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000002", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date().toISOString());
    const a = { set: 0, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 };
    const b = { ...a, set: 1, reps: 10 };
    store.replaceStrengthSets(workout.workout_id, [a, b], ["source-a", "source-b"]);
    const [first, second] = store.effectiveStrengthSets(workout.workout_id);
    store.updateStrengthSet(workout.workout_id, first!.id, { exercise: "Rows" });
    store.deleteStrengthSet(workout.workout_id, second!.id);
    store.replaceStrengthSets(workout.workout_id, [b, a], ["source-b", "source-a"]);
    expect(store.effectiveStrengthSets(workout.workout_id)).toMatchObject([{ id: first!.id, exercise: "Rows" }]);
    expect(store.strengthConflicts(workout.workout_id)).toEqual([]);
  } finally { store.close(); }
});

it("does not attach a correction to an indistinguishable source set after refresh", () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000005", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date().toISOString());
    const set = { set: 0, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 };
    store.replaceStrengthSets(workout.workout_id, [set, { ...set, set: 1 }], ["same raw data", "same raw data"]);
    const id = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    store.updateStrengthSet(workout.workout_id, id, { exercise: "Rows" });
    store.replaceStrengthSets(workout.workout_id, [set, { ...set, set: 1 }], ["same raw data", "same raw data"]);
    expect(store.strengthConflicts(workout.workout_id)).toContain(id);
    expect(store.effectiveStrengthSets(workout.workout_id).every(s => s.exercise === "unknown_0")).toBe(true);
  } finally { store.close(); }
});

it("matches using the full source row even when indistinguishable displayed sets are renumbered", () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000006", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date().toISOString());
    const row = (set: number, marker: string) => { const c = lapRow([set, 30, 100, -1, 8, 0]).split(","); c[3] = marker; return c.join(","); };
    const before = parseStrengthLap(row(0, "a") + ";" + row(1, "b"));
    store.replaceStrengthSets(workout.workout_id, before.sets, before.sourceKeys);
    const id = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    store.updateStrengthSet(workout.workout_id, id, { exercise: "Rows" });
    const after = parseStrengthLap(row(0, "b") + ";" + row(1, "a"));
    store.replaceStrengthSets(workout.workout_id, after.sets, after.sourceKeys);
    expect(store.effectiveStrengthSets(workout.workout_id)).toMatchObject([{ exercise: "unknown_0" }, { id, exercise: "Rows" }]);
    expect(store.strengthConflicts(workout.workout_id)).toEqual([]);
  } finally { store.close(); }
});

it("migrates existing v4 sets and keeps corrections and IDs after reopening", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zepp-upgrade-"));
  const file = path.join(dir, "zepp.db");
  const old = new ZeppStore(file, MIGRATIONS.filter(m => m.version <= 4));
  const workout = normalizeWorkoutSummary({ trackid: "1700000003", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
  old.upsertWorkout(workout, "2023-11-14", {}, new Date().toISOString());
  old.close();
  const raw = new DatabaseSync(file);
  raw.prepare("INSERT INTO strength_sets (workout_id, seq, set_no, exercise, action_type, reps) VALUES (?, 0, 0, 'unknown_0', 0, 8)").run(workout.workout_id);
  raw.close();
  let store = new ZeppStore(file);
  try {
    const id = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    expect(id).toBeTruthy();
    store.updateStrengthSet(workout.workout_id, id, { exercise: "Pull Up", reps: 12 });
    store.close();
    store = new ZeppStore(file);
    expect(store.effectiveStrengthSets(workout.workout_id)).toMatchObject([{ id, exercise: "Pull Up", reps: 12 }]);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

it("rejects invalid values and cannot discard a matched correction", () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000004", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date().toISOString());
    store.replaceStrengthSets(workout.workout_id, [{ set: 0, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: null, avg_hr_bpm: null }]);
    const id = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    expect(() => store.updateStrengthSet(workout.workout_id, id, { reps: -1 })).toThrow(/reps/i);
    expect(() => store.updateStrengthSet(workout.workout_id, id, { weight_kg: -1 })).toThrow(/weight/i);
    expect(() => store.createStrengthSet(workout.workout_id, { exercise: "  ", reps: 1, weight_kg: null })).toThrow(/exercise/i);
    expect(() => store.updateStrengthSet(workout.workout_id, "missing", { reps: 1 })).toThrow(/not found/i);
    store.updateStrengthSet(workout.workout_id, id, { reps: 12, weight_kg: 0 });
    expect(() => store.discardStrengthConflict(workout.workout_id, id)).toThrow(/not found/i);
    expect(store.effectiveStrengthSets(workout.workout_id)[0]).toMatchObject({ reps: 12, weight_kg: 0 });
  } finally { store.close(); }
});
