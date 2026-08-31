import { describe, expect, it } from "vitest";
import v2Fixture from "./fixtures/events-v2.json";
import watchFixture from "./fixtures/watch-statistics.json";
import { normalizeReviewedMetric } from "../src/zepp/events";
import { normalizeWatchStatistic } from "../src/zepp/training";

describe("training status normalization", () => {
  it("normalizes verified lactate threshold fields", () => {
    const points = normalizeReviewedMetric("lactate_threshold", v2Fixture, "Asia/Jakarta");
    expect(points.find(p => p.metric === "lactate_threshold_hr")?.value).toBe(168);
    expect(points.find(p => p.metric === "lactate_threshold_pace")?.value).toBe(390);
  });

  it("normalizes watch sport load and VO2max without negative sentinels", () => {
    expect(normalizeWatchStatistic(watchFixture.sport_load, "sport_load", "Asia/Jakarta")[0]?.value).toBe(72);
    expect(normalizeWatchStatistic(watchFixture.vo2max, "vo2max", "Asia/Jakarta")[0]?.value).toBe(43.5);
  });
});
