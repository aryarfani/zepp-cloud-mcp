import { describe, expect, it } from "vitest";
import { STRENGTH_EXERCISE_CATALOG } from "../src/zepp/strength-exercise-catalog";
import { STRENGTH_EXERCISE_NAMES, strengthExerciseName, strengthExerciseSource } from "../src/zepp/strength-exercises";
import { parseStrengthLap } from "../src/zepp/strength";

describe("strength exercise catalog (Gadgetbridge zeppos.json)", () => {
  it("has the full catalog keyed by action type, never id 0", () => {
    expect(Object.keys(STRENGTH_EXERCISE_CATALOG)).toHaveLength(1133);
    expect(STRENGTH_EXERCISE_CATALOG[0]).toBeUndefined();
    for (const name of Object.values(STRENGTH_EXERCISE_CATALOG)) expect(name.trim().length).toBeGreaterThan(0);
  });

  it("agrees with the owner's six verified names", () => {
    for (const [id, name] of Object.entries(STRENGTH_EXERCISE_NAMES)) expect(STRENGTH_EXERCISE_CATALOG[Number(id)]).toBe(name);
    expect(Object.keys(STRENGTH_EXERCISE_NAMES).map(Number).sort((a, b) => a - b)).toEqual([4, 6, 63, 64, 130, 1988]);
  });

  it("resolves owner > catalog > unknown_<id>, with id 0 always unknown_0", () => {
    expect(strengthExerciseName(64)).toBe("Pull Up");
    expect(strengthExerciseSource(64)).toBe("owner");
    expect(strengthExerciseName(66)).toBe("Seated Cable Row");
    expect(strengthExerciseSource(66)).toBe("catalog");
    expect(strengthExerciseName(0)).toBe("unknown_0");
    expect(strengthExerciseSource(0)).toBe("unknown");
    expect(strengthExerciseName(99999)).toBe("unknown_99999");
    expect(strengthExerciseSource(99999)).toBe("unknown");
    expect(strengthExerciseName(Number.NaN)).toBe("unknown_NaN");
  });

  it("does not leak Object.prototype keys as names", () => {
    expect(strengthExerciseSource(Number("constructor"))).toBe("unknown");
  });

  it("parsed sets get catalog names", () => {
    const cols = Array.from({ length: 70 }, () => "0");
    cols[0] = "0"; cols[1] = "20"; cols[4] = "100"; cols[21] = "-1"; cols[22] = "8"; cols[28] = "66";
    expect(parseStrengthLap(cols.join(",")).sets[0]?.exercise).toBe("Seated Cable Row");
  });
});