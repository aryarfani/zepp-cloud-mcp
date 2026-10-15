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
  it("maps the verified cloud type codes", () => {
    expect(SPORT_CODES).toEqual({
      1: "outdoor_running",
      6: "walking",
      9: "ride",
      14: "pool_swimming",
      52: "strength",
      92: "badminton",
      130: "cross_training"
    });
    const swim = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 14 }, "Asia/Jakarta");
    expect(swim).toMatchObject({ activity_type: "pool_swimming", zepp_type: 14 });
  });

  it("keeps unverified codes explicit instead of guessing", () => {
    for (const type of [8, 10, 16, 22, 24]) {
      const w = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type }, "Asia/Jakarta");
      expect(w?.activity_type).toBe(`unknown:${type}`);
    }
  });
});