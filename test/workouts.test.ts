import { describe, expect, it } from "vitest";
import { SPORT_CODES, decodeWorkoutId, encodeWorkoutId, normalizeWorkoutSummary } from "../src/zepp/workouts";

describe("workout identity", () => {
  it("round trips a validated trackid + source and rejects tampering", () => {
    const id = encodeWorkoutId("1700000000", "run.device");
    expect(decodeWorkoutId(id)).toEqual({ trackid: "1700000000", source: "run.device" });
    expect(() => decodeWorkoutId(`${id}!`)).toThrow();
    expect(() => encodeWorkoutId("../../etc", "run.device")).toThrow();
    expect(() => encodeWorkoutId("1700000000", "https://evil.example")).toThrow();
  });
});

describe("workout summary", () => {
  it("normalizes common fields and keeps unknown numeric types explicit", () => {
    const known = normalizeWorkoutSummary({
      trackid: "1700000000", source: "run.device", endTime: 1700000600,
      type: 1, distance: 1500, avgHr: 150, maxHr: 170, trainingLoad: 75, vo2Max: 43
    }, "Asia/Jakarta");
    expect(known).toMatchObject({ activity_type: "outdoor_running", distance_m: 1500, training_load: 75, vo2max_ml_kg_min: 43 });
    expect(known?.heart_rate).toEqual({ avg_bpm: 150, max_bpm: 170 });

    const unknown = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 105 }, "Asia/Jakarta");
    expect(unknown?.activity_type).toBe("unknown:105");
  });

  it("drops negative measurement sentinels", () => {
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, trainingLoad: -1, vo2Max: -1 }, "Asia/Jakarta");
    expect(workout?.training_load).toBeUndefined();
    expect(workout?.vo2max_ml_kg_min).toBeUndefined();
  });
});

describe("sport codes", () => {
  it("keeps the codes confirmed on live data", () => {
    expect(SPORT_CODES).toMatchObject({ 1: "outdoor_running", 6: "walking", 9: "ride", 14: "pool_swimming", 52: "strength", 92: "badminton", 130: "cross_training" });
    const swim = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 14 }, "Asia/Jakarta");
    expect(swim).toMatchObject({ activity_type: "pool_swimming", zepp_type: 14 });
    expect(swim?.type_confidence).toBeUndefined(); // verified: no badge
  });

  it("names the catalog sports and flags guessed ones with type_confidence", () => {
    const expected: Array<[number, string, string]> = [[8, "treadmill", "reference"], [10, "indoor_cycling", "reference"], [22, "hiking", "inferred"], [24, "indoor_fitness", "inferred"]];
    for (const [type, name, confidence] of expected) {
      const w = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type }, "Asia/Jakarta");
      expect(w).toMatchObject({ activity_type: name, zepp_type: type, type_confidence: confidence });
    }
  });

  it("keeps uncatalogued codes explicit instead of guessing", () => {
    for (const type of [11, 105, 999]) {
      const w = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type }, "Asia/Jakarta");
      expect(w?.activity_type).toBe(`unknown:${type}`);
      expect(w?.type_confidence).toBeUndefined();
    }
  });

  it("lets a title sent by Zepp override a guessed catalog name, but not a verified one", () => {
    const base = { trackid: "1700000000", source: "run.device", endTime: 1700000600 };
    expect(normalizeWorkoutSummary({ ...base, type: 22, sport_title: "Trail Walk" }, "Asia/Jakarta")).toMatchObject({ activity_type: "trail_walk", zepp_type: 22 });
    expect(normalizeWorkoutSummary({ ...base, type: 52, sport_title: "Gym" }, "Asia/Jakarta")?.activity_type).toBe("strength");
  });
});
