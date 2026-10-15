import { describe, expect, it } from "vitest";
import { SPORT_CATALOG, sportConfidence, sportKey, sportLabel } from "../src/zepp/sport-catalog";
import { SPORT_CODES } from "../src/zepp/workouts";

describe("sport catalog (ZeppBridge, MIT)", () => {
  it("has the full numeric catalog with unique, well-formed entries and no null code", () => {
    expect(Object.keys(SPORT_CATALOG)).toHaveLength(134);
    for (const [code, [key, label, confidence]] of Object.entries(SPORT_CATALOG)) {
      expect(Number.isInteger(Number(code))).toBe(true);
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(label.length).toBeGreaterThan(0);
      expect(["verified", "reference", "inferred"]).toContain(confidence);
    }
    expect(SPORT_CODES[1]).toBe("outdoor_running"); // ZeppBridge's "run" is spelled in the existing key style
    expect(Object.values(SPORT_CODES)).not.toContain("run");
  });

  it("agrees with the codes already confirmed on live data and marks them verified", () => {
    const live: Record<number, string> = { 1: "outdoor_running", 6: "walking", 9: "ride", 14: "pool_swimming", 52: "strength", 92: "badminton", 130: "cross_training" };
    for (const [code, key] of Object.entries(live)) {
      expect(sportKey(Number(code))).toBe(key);
      expect(sportConfidence(Number(code))).toBe("verified");
    }
  });

  it("carries the confidence for the previously unknown types", () => {
    expect([sportKey(8), sportConfidence(8)]).toEqual(["treadmill", "reference"]);
    expect([sportKey(10), sportConfidence(10)]).toEqual(["indoor_cycling", "reference"]);
    expect([sportKey(22), sportConfidence(22)]).toEqual(["hiking", "inferred"]);
    expect([sportKey(24), sportConfidence(24)]).toEqual(["indoor_fitness", "inferred"]);
    expect(sportLabel(22)).toBe("Hiking");
    expect(sportConfidence(22, "hiking")).toBe("inferred");
    expect(sportConfidence(22, "trail_walk")).toBeUndefined(); // title came from Zepp, not the catalog
  });

  it("does not guess unknown codes or leak prototype keys", () => {
    expect(sportKey(105)).toBeUndefined();
    expect(sportKey(Number("constructor"))).toBeUndefined();
    expect(sportConfidence(undefined)).toBeUndefined();
  });
});