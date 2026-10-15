import { describe, expect, it } from "vitest";
import { getStrengthSets, hasStrengthSets, parseStrengthLap, rollupStrengthSets } from "../src/zepp/strength";
import { STRENGTH_EXERCISE_NAMES } from "../src/zepp/strength-exercises";
import { encodeWorkoutId } from "../src/zepp/workouts";
import { parseConfig } from "../src/config";
import type { ServiceContext } from "../src/services";

// [set, duration_s, avg_hr, weight_kg, reps, action_type]
const SETS: Array<[number, number, number, number, number, number]> = [
  [0, 31, 98, -1, 10, 64],
  [1, 49, 106, 12, 12, 6], [2, 41, 125, 17.5, 12, 6], [3, 34, 127, 20, 10, 6], [4, 25, 123, 20, 7, 6],
  [5, 35, 134, 12.5, 10, 63], [6, 24, 130, 12.5, 10, 63], [7, 25, 128, 12.5, 10, 63], [8, 24, 126, 12.5, 8, 63],
  [9, 14, 135, 0, 12, 1988], [10, 2, 127, 0, 10, 1988], [11, 191, 131, 0, 10, 1988], [12, 31, 122, 0, 10, 1988],
  [13, 21, 128, 10, 12, 130], [14, 23, 122, 20, 12, 130], [15, 22, 125, 20, 10, 130],
  [16, 43, 132, 20, 12, 4], [17, 36, 135, 36, 12, 4], [18, 14, 146, 36, 12, 4], [19, 63, 141, 36, 10, 4]
];

function row(s: [number, number, number, number, number, number], columns = 62): string {
  const c: Array<string | number> = Array.from({ length: columns }, () => -1);
  c[0] = s[0]; c[1] = s[1]; c[2] = 0; c[3] = "s00000000000"; c[4] = s[2];
  c[21] = s[3].toFixed(1); c[22] = s[4]; c[28] = s[5]; c[43] = s[1] * 1000 + 123;
  return c.join(",");
}
const LAP = SETS.map(s => row(s)).join(";");

describe("parseStrengthLap", () => {
  it("maps columns and exercise names", () => {
    const { sets, malformed, ignored } = parseStrengthLap(LAP);
    expect(sets).toHaveLength(20);
    expect(malformed + ignored).toBe(0);
    expect(sets[0]).toEqual({ set: 0, exercise: "Pull Up", action_type: 64, reps: 10, weight_kg: null, duration_s: 31.1, avg_hr_bpm: 98 });
    expect(sets[2]).toMatchObject({ exercise: "Bench Press", reps: 12, weight_kg: 17.5 });
    expect(sets[9]).toMatchObject({ exercise: "Dip", weight_kg: null });
    expect(sets[19]).toMatchObject({ exercise: "Triceps Pushdowns", reps: 10, weight_kg: 36 });
  });

  it("accepts 70-column rows and ignores a trailing separator", () => {
    expect(parseStrengthLap(SETS.map(s => row(s, 70)).join(";") + ";").sets).toHaveLength(20);
  });

  it("falls back to unknown_<id> and keeps only the seeded names", () => {
    expect(Object.keys(STRENGTH_EXERCISE_NAMES).map(Number).sort((a, b) => a - b)).toEqual([4, 6, 63, 64, 130, 1988]);
    expect(parseStrengthLap(row([0, 20, 100, 15, 8, 9999])).sets[0]?.exercise).toBe("unknown_9999");
  });

  it("skips malformed rows and ignores rows without reps", () => {
    const lap = [row(SETS[1]!), "1,2,3", row([2, 10, 90, 10, Number.NaN, 6]), row([3, 10, 90, 10, 0, 0]), row([4, 10, 90, 10, 5, 6])].join(";");
    const r = parseStrengthLap(lap);
    expect(r.sets.map(s => s.set)).toEqual([1, 4]);
    expect(r.malformed).toBe(2);
    expect(r.ignored).toBe(1);
  });

  it("handles missing, empty and non-string lap", () => {
    for (const v of [undefined, null, "", 5, {}]) expect(parseStrengthLap(v).sets).toEqual([]);
    expect(hasStrengthSets({})).toBe(false);
    expect(hasStrengthSets({ lap: LAP })).toBe(true);
  });
});

describe("rollupStrengthSets", () => {
  it("computes per-exercise and total volume from valid weights only", () => {
    const { exercises, totals } = rollupStrengthSets(parseStrengthLap(LAP).sets);
    expect(exercises.map(e => e.exercise)).toEqual(["Pull Up", "Bench Press", "Shoulder Press", "Dip", "Machine Shoulder Press", "Triceps Pushdowns"]);
    expect(exercises[0]).toEqual({ exercise: "Pull Up", action_type: 64, sets: 1, total_reps: 10, volume_kg: 0, max_weight_kg: null });
    expect(exercises[1]).toMatchObject({ sets: 4, total_reps: 41, volume_kg: 12 * 12 + 17.5 * 12 + 200 + 140, max_weight_kg: 20 });
    expect(exercises[3]).toMatchObject({ sets: 4, total_reps: 42, volume_kg: 0, max_weight_kg: null });
    expect(exercises[5]).toMatchObject({ sets: 4, total_reps: 46, volume_kg: 240 + 432 + 432 + 360, max_weight_kg: 36 });
    expect(totals.sets).toBe(20);
    expect(totals.volume_kg).toBe(exercises.reduce((a, e) => a + e.volume_kg, 0));
  });
});

describe("getStrengthSets", () => {
  // The Zepp cache is keyed by trackid, so every case uses its own trackid.
  let nextTrack = 1791976557;
  function setup(detail: Record<string, unknown>): { ctx: ServiceContext; id: string } {
    const trackid = String(nextTrack++);
    const config = parseConfig({ MCP_SECRET: "x".repeat(32), ZEPP_APP_TOKEN: "t", ZEPP_USER_ID: "1", ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com", USER_TIMEZONE: "Asia/Jakarta" } as never);
    const zepp = { get: async () => ({ data: { trackid, ...detail } }) };
    return { ctx: { config, zepp } as unknown as ServiceContext, id: encodeWorkoutId(trackid, "run.10944771.huami.com") };
  }

  it("returns sets, rollup and totals in the standard envelope", async () => {
    const { ctx, id } = setup({ lap: LAP, strengthSets: [] });
    const env = await getStrengthSets(ctx, id);
    expect(env.status).toBe("ok");
    expect(env.data?.workout_id).toBe(id);
    expect(env.data?.sets).toHaveLength(20);
    expect(env.data?.exercises).toHaveLength(6);
    expect(env.meta.warnings).toEqual([]);
  });

  it("reports no_data for workouts without set rows and warns on malformed rows", async () => {
    const a = setup({ lap: "" });
    const empty = await getStrengthSets(a.ctx, a.id);
    expect(empty.status).toBe("no_data");
    expect(empty.data).toBeNull();
    const b = setup({ time: "0;1;" });
    expect((await getStrengthSets(b.ctx, b.id)).status).toBe("no_data");
    const c = setup({ lap: `${row(SETS[1]!)};bad` });
    const bad = await getStrengthSets(c.ctx, c.id);
    expect(bad.status).toBe("ok");
    expect(bad.meta.warnings.join(" ")).toContain("malformed");
  });

  it("rejects an invalid workout id", async () => {
    await expect(getStrengthSets(setup({}).ctx, "nope")).rejects.toThrow();
  });
});