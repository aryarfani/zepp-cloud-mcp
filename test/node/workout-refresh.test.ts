import { expect, it, vi } from "vitest";
import { EMPTY_COUNTS, ZeppStore } from "../../src/store/store";
import { createWorkoutRefresher } from "../../src/sync/workout-refresh";
import { fetchWorkoutHistoryWithCoverage, normalizeWorkoutSummary } from "../../src/zepp/workouts";
import { parseDateRange } from "../../src/time";
import { lapRow, mockCtx } from "./helpers";

it("recognizes Zepp's negative end cursor as complete, but rejects malformed rows", async () => {
  const range = parseDateRange("2026-08-31", "2026-08-31", "Asia/Jakarta");
  const good = mockCtx();
  expect((await fetchWorkoutHistoryWithCoverage(good.ctx, range)).complete).toBe(true);
  const bad = mockCtx({ history: { data: { next: -1, summary: [null] } } });
  expect((await fetchWorkoutHistoryWithCoverage(bad.ctx, range)).complete).toBe(false);
});

it("syncs stale data once for concurrent reads and records complete history coverage", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const run = vi.fn(async () => {
      const id = store.startRun("manual", "2026-10-29", "2026-10-31", new Date(now).toISOString());
      store.finishRun(id, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
      return { ok: true };
    });
    const history = vi.fn(async () => ({ items: [], complete: true }));
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", sync: { isRunning: () => false, run }, history, detail: async () => ({}), now: () => now, waitMs: 1000 });
    await Promise.all([refresh({ start: "2026-10-01", end: "2026-10-02" }), refresh({ start: "2026-10-01", end: "2026-10-02" })]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
    expect(store.workoutCoverage("2026-10-01", "2026-10-02", "2026-10-30")).toBe(true);
    await refresh({ start: "2026-10-01", end: "2026-10-02" });
    expect(history).toHaveBeenCalledTimes(1);
  } finally { store.close(); }
});

it("keeps existing sets and retries later when detail is malformed", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const run = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(run, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date(now).toISOString());
    store.replaceStrengthSets(workout.workout_id, [{ set: 0, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 }]);
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", history: async () => ({ items: [], complete: true }), detail: async () => ({ lap: lapRow([0, 30, 100, -1, 9, 0]) + ";bad" }), now: () => now, waitMs: 1000 });
    expect((await refresh({ workoutId: workout.workout_id, detail: true })).join(" ")).toMatch(/malformed/i);
    expect(store.effectiveStrengthSets(workout.workout_id)[0]!.reps).toBe(8);
    expect(store.strengthDetailRefreshedAt(workout.workout_id)).toBeNull();
  } finally { store.close(); }
});

it("does not mark an empty newly discovered strength detail fresh", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const run = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(run, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date(now).toISOString());
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", history: async () => ({ items: [], complete: true }), detail: async () => ({ lap: "" }), now: () => now, waitMs: 1000 });
    expect((await refresh({ workoutId: workout.workout_id, detail: true })).join(" ")).toMatch(/no recognizable strength/i);
    expect(store.strengthDetailRefreshedAt(workout.workout_id)).toBeNull();
    expect(store.localWorkout(workout.workout_id)!.strengthChecked).toBe(false);
  } finally { store.close(); }
});

it("does not record coverage if upstream pagination was incomplete", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const id = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(id, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", sync: { isRunning: () => false, run: async () => ({ ok: true }) }, history: async () => ({ items: [], complete: false }), detail: async () => ({}), now: () => now, waitMs: 1000 });
    expect((await refresh({ start: "2026-10-01", end: "2026-10-01" })).join(" ")).toMatch(/incomplete/i);
    expect(store.workoutCoverage("2026-10-01", "2026-10-01", "2026-10-30")).toBe(false);
  } finally { store.close(); }
});

it("limits upstream requests when many saturated windows cannot be completed", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const id = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(id, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    const history = vi.fn(async () => ({ items: [], complete: false }));
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", history, detail: async () => ({}), now: () => now, waitMs: 1000 });
    const warnings = await refresh({ start: "2026-10-01", end: "2026-10-31" });
    expect(history).toHaveBeenCalledTimes(40);
    expect(warnings.join(" ")).toMatch(/request limit/i);
  } finally { store.close(); }
});

it("returns an explicit warning and does not claim coverage when sync or history fails", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", sync: { isRunning: () => false, run: async () => ({ ok: false }) }, history: async () => { throw new Error("offline"); }, detail: async () => ({}), waitMs: 1000 });
    const warnings = await refresh({ start: "2026-01-01", end: "2026-01-02" });
    expect(warnings.join(" ")).toMatch(/sync.*failed/i);
    expect(warnings.join(" ")).toMatch(/coverage/i);
    expect(store.workoutCoverage("2026-01-01", "2026-01-02", "2020-01-01")).toBe(false);
  } finally { store.close(); }
});

it("bounds the caller wait while continuing one shared refresh in the background", async () => {
  const store = new ZeppStore(":memory:");
  try {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const sync = vi.fn(async () => { await gate; return { ok: true }; });
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", sync: { isRunning: () => false, run: sync }, history: async () => ({ items: [], complete: true }), detail: async () => ({}), waitMs: 10 });
    const request = { start: "2026-01-01", end: "2026-01-01" };
    const warnings = await Promise.all([refresh(request), refresh(request)]);
    expect(warnings[0]!.join(" ")).toMatch(/still running/i);
    expect(sync).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(store.workoutCoverage("2026-01-01", "2026-01-01", "2020-01-01")).toBe(true));
  } finally { store.close(); }
});

it("waits for a running sync even when an earlier success is recent", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const run = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(run, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    let running = true;
    const history = vi.fn(async () => ({ items: [], complete: true }));
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", sync: { isRunning: () => running, run: async () => ({ ok: true }) }, history, detail: async () => ({}), now: () => now, waitMs: 10 });
    expect((await refresh({ start: "2026-10-01", end: "2026-10-01" })).join(" ")).toMatch(/still running/i);
    expect(history).not.toHaveBeenCalled();
    running = false;
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(1));
  } finally { store.close(); }
});

it("never overwrites newer source sets when another sync finishes during detail fetch", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const run = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(run, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, new Date(now).toISOString());
    const initial = { set: 0, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 };
    store.replaceStrengthSets(workout.workout_id, [initial], ["old"]);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const detail = vi.fn(async () => { await gate; return { lap: lapRow([0, 30, 100, -1, 8, 0]) }; });
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", history: async () => ({ items: [], complete: true }), detail, now: () => now, waitMs: 1000 });
    const pending = refresh({ workoutId: workout.workout_id, detail: true });
    await vi.waitFor(() => expect(detail).toHaveBeenCalled());
    store.replaceStrengthSets(workout.workout_id, [{ ...initial, reps: 12 }], ["new"]);
    release();
    expect((await pending).join(" ")).toMatch(/changed.*refresh/i);
    expect(store.effectiveStrengthSets(workout.workout_id)[0]!.reps).toBe(12);
  } finally { store.close(); }
});

it("searches the correct day for a missing workout with a millisecond track ID", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const run = store.startRun("manual", "2026-10-01", "2026-10-31", new Date(now).toISOString());
    store.finishRun(run, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date(now).toISOString());
    const workout = normalizeWorkoutSummary({ trackid: "1700000000000", source: "run.device", endTime: 1700000600000, type: 1 }, "UTC")!;
    const history = vi.fn(async (_range: ReturnType<typeof parseDateRange>) => ({ items: [{ summary: workout, raw: {} }], complete: true }));
    const refresh = createWorkoutRefresher({ store, timezone: "UTC", history, detail: async () => ({}), now: () => now, waitMs: 1000 });
    expect(await refresh({ workoutId: workout.workout_id, detail: false })).toEqual([]);
    expect(history.mock.calls[0]![0]).toMatchObject({ startDate: "2023-11-14", endDate: "2023-11-14" });
    expect(store.localWorkout(workout.workout_id)).not.toBeNull();
  } finally { store.close(); }
});
