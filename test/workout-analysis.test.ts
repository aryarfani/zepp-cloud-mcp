import { describe, expect, it } from "vitest";
import { analyzeWorkout } from "../src/zepp/workout-analysis";
import { decodeHeartRateTimeline } from "../src/zepp/workout-detail";
import { RUN_HISTORY_EXTRA, RUN_SECONDS, RUN_TRACKID, runDetail } from "./fixtures/run-detail";

describe("analyzeWorkout", () => {
  const a = analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA);

  it("takes the summary from the history item, with sentinels excluded", () => {
    expect(a.summary).toMatchObject({
      duration_s: RUN_SECONDS, distance_m: 3200, avg_pace_s_km: 469, best_pace_s_km: 420, avg_hr_bpm: 128, max_hr_bpm: 150,
      avg_cadence_spm: 168, steps: 4200, calories_kcal: 230, training_load: 61, aerobic_te: 2.7, anaerobic_te: 0.5, vo2max: 44
    });
    expect(a.summary.avg_power_w).toBeNull();
  });

  it("decodes pace, delta-coded heart rate, cadence, altitude and cm distance into a bucketed series", () => {
    const s = a.series!;
    expect(s.step_s).toBe(5);
    expect(s.t.length).toBe(300);
    expect(s.t[0]).toBe(5);
    expect(s.hr_bpm.every(v => v === null || (v >= 105 && v <= 160))).toBe(true);
    expect(s.hr_bpm[0]).toBeGreaterThan(105);
    expect(s.pace_s_km.some(v => v !== null && v >= 420 && v <= 520)).toBe(true);
    expect(s.cadence_spm.some(v => v !== null && v >= 160)).toBe(true);
    expect(Math.max(...s.alt_m.filter((v): v is number => v !== null))).toBeGreaterThan(20);
    const dist = s.dist_m.filter((v): v is number => v !== null);
    expect(dist.at(-1)).toBeGreaterThan(3000); // centimetres were scaled to metres
    expect(dist.at(-1)).toBeLessThan(3500);
    expect([...dist].sort((x, y) => x - y)).toEqual(dist);
  });

  it("builds kilometre splits from kilo_pace plus a partial last km", () => {
    expect(a.splits.slice(0, 3).map(s => [s.km, s.time_s, s.pace_s_km, s.avg_hr_bpm, s.cadence_spm])).toEqual([[1, 470, 470, 140, 168], [2, 480, 480, 143, 169], [3, 490, 490, 146, 170]]);
    const last = a.splits[3]!;
    expect(last).toMatchObject({ partial: true, distance_m: 200, km: 3.2 });
    expect(last.time_s).toBe(RUN_SECONDS - 1440);
  });

  it("computes zones, route and elevation", () => {
    expect(a.zones).toEqual([
      { lower_bpm: 0, upper_bpm: 108, seconds: 300 }, { lower_bpm: 108, upper_bpm: 135, seconds: 400 },
      { lower_bpm: 135, upper_bpm: 153, seconds: 500 }, { lower_bpm: 153, upper_bpm: 171, seconds: 300 }, { lower_bpm: 171, upper_bpm: 190, seconds: 0 }
    ]);
    expect(a.route!.points.length).toBeLessThanOrEqual(300);
    expect(a.route!.points.length).toBeGreaterThan(100);
    const [minLat, minLon, maxLat, maxLon] = a.route!.bbox;
    expect(minLat).toBeLessThan(maxLat);
    expect(minLon).toBeLessThan(maxLon);
    expect(a.route!.points[0]![0]).toBeCloseTo(-6.2, 3);
    expect(a.summary.ascent_m).toBeGreaterThan(0);
    expect(a.summary.min_altitude_m).toBeLessThan(a.summary.max_altitude_m!);
  });

  it("stays small and has no identifying fields", () => {
    const json = JSON.stringify(a);
    expect(json.length).toBeLessThan(30_000);
    expect(json).not.toContain("trackid");
    expect(json).not.toContain("w2geohash");
  });

  it("hides the route without GPS and still analyses the rest", () => {
    const n = analyzeWorkout(runDetail({ gps: false }), RUN_HISTORY_EXTRA);
    expect(n.route).toBeNull();
    expect(n.series).not.toBeNull();
  });

  it("copes with an empty payload", () => {
    const e = analyzeWorkout({}, {});
    expect(e).toMatchObject({ series: null, splits: [], zones: [], route: null });
  });

  it("derives splits from the series when kilo_pace is missing", () => {
    const d = runDetail(); delete d.kilo_pace;
    const n = analyzeWorkout(d, RUN_HISTORY_EXTRA);
    expect(n.splits.filter(s => !s.partial).length).toBe(3);
    expect(n.splits[0]!.time_s).toBeGreaterThan(400);
  });
});

describe("decodeHeartRateTimeline", () => {
  it("reads the first value as absolute and the rest as deltas", () => {
    const m = decodeHeartRateTimeline("0,100;1,2;1,-1;2,5", 1000);
    expect([...m.entries()]).toEqual([[1000, 100], [1001, 102], [1002, 101], [1004, 106]]);
  });
  it("falls back to absolute values when the series is not delta-coded", () => {
    const m = decodeHeartRateTimeline("0,100;1,120;1,95", 50);
    expect([...m.values()]).toEqual([100, 120, 95]);
  });
});
void RUN_TRACKID;