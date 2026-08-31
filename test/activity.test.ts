import { describe, expect, it } from "vitest";
import fixture from "./fixtures/band-data.json";
import { normalizeBandData } from "../src/zepp/activity";

describe("band activity normalization", () => {
  it("uses only verified daily fields", () => {
    const days = normalizeBandData(fixture).daily;
    expect(days[0]).toMatchObject({ date: "2026-08-31", steps: 7890, distance_m: 6230, active_calories_kcal: 456, resting_hr_bpm: 58 });
  });

  it("keeps missing distance and calories absent", () => {
    const day = normalizeBandData(fixture).daily.find(d => d.date === "2026-08-30");
    expect(day?.distance_m).toBeUndefined();
    expect(day?.active_calories_kcal).toBeUndefined();
  });
});
