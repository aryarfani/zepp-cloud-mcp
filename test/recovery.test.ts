import { describe, expect, it } from "vitest";
import v2Fixture from "./fixtures/events-v2.json";
import userFixture from "./fixtures/events-user.json";
import { normalizeReviewedMetric } from "../src/zepp/events";

describe("reviewed recovery normalizers", () => {
  it("normalizes HRV/RMSSD/readiness/respiration without fabricating values", () => {
    expect(normalizeReviewedMetric("hrv", v2Fixture, "Asia/Jakarta").some(p => p.metric === "hrv")).toBe(true);
    expect(normalizeReviewedMetric("hrv_rmssd", v2Fixture, "Asia/Jakarta").map(p => p.value)).toEqual([38, 40]);
    expect(normalizeReviewedMetric("readiness", v2Fixture, "Asia/Jakarta")[0]?.value).toBe(82);
    expect(normalizeReviewedMetric("respiratory_rate", v2Fixture, "Asia/Jakarta")[0]?.value).toBe(15.5);
  });

  it("keeps ordinary SpO2 separate from ODI/OSA", () => {
    const points = normalizeReviewedMetric("blood_oxygen", userFixture, "Asia/Jakarta");
    expect(points.filter(p => p.metric === "spo2").map(p => p.value)).toEqual([97, 96]);
  });

  it("normalizes all-day stress and PAI daily scores", () => {
    expect(normalizeReviewedMetric("all_day_stress", userFixture, "Asia/Jakarta")[0]?.value).toBe(31);
    expect(normalizeReviewedMetric("pai", userFixture, "Asia/Jakarta")[0]?.value).toBe(18);
  });
});
