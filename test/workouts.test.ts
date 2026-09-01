import { describe, expect, it } from "vitest";
import { decodeWorkoutId, encodeWorkoutId, normalizeWorkoutSummary } from "../src/zepp/workouts";

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
