import { describe, expect, it } from "vitest";
import { decodeWorkoutRoute, decodeWorkoutSamples, downsampleStable } from "../src/zepp/workout-detail";

const detail = {
  trackid: "1700000000",
  heart_rate: "1,80;1,81;",
  speed: "1,2.5;1,2.6;",
  power_meter: ",250;1,260;",
  equivPace: ",355;1,350;",
  gait: "1,0,101,170;1,0,102,171;",
  runPosture: "1,263,88,87;1,65535,65535,255;",
  time: "0;1;1;",
  longitude_latitude: "4004663552,11629333504;16403,1000;1000,1000;",
  altitude: "7800;7900;8000;"
};

describe("workout sample decoder", () => {
  it("decodes verified running metrics and removes posture sentinels", () => {
    const samples = decodeWorkoutSamples(detail, ["heart_rate", "pace", "cadence", "power", "ground_contact_time", "vertical_oscillation", "vertical_ratio", "equivalent_pace"]);
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({ heart_rate_bpm: 80, cadence_spm: 170, power_w: 250, ground_contact_ms: 263, vertical_oscillation_mm: 88, vertical_ratio_pct: 8.7, equivalent_pace_s_per_km: 355 });
    expect(samples[1]?.ground_contact_ms).toBeUndefined();
    expect(samples[1]?.vertical_oscillation_mm).toBeUndefined();
    expect(samples[1]?.vertical_ratio_pct).toBeUndefined();
  });

  it("does not derive equivalent pace from speed", () => {
    const samples = decodeWorkoutSamples(detail, ["pace", "equivalent_pace"]);
    expect(samples[0]?.pace_s_per_km).toBe(400);
    expect(samples[0]?.equivalent_pace_s_per_km).toBe(355);
  });
});

describe("route decoder", () => {
  it("accumulates coordinate deltas and converts plausible altitude centimetres", () => {
    const route = decodeWorkoutRoute(detail);
    expect(route).toHaveLength(3);
    expect(route[0]?.latitude).toBeCloseTo(40.04663552, 8);
    expect(route[0]?.longitude).toBeCloseTo(116.29333504, 8);
    expect(route[1]?.latitude).toBeCloseTo(40.04663552 + 16403 / 100_000_000, 8);
    expect(route[0]?.elevation_m).toBe(78);
  });

  it("drops implausible altitude sentinels", () => {
    const route = decodeWorkoutRoute({ ...detail, altitude: "-2003943;7900;8000;" });
    expect(route[0]?.elevation_m).toBeUndefined();
  });
});

describe("downsampling", () => {
  it("keeps endpoints and discloses original/returned counts", () => {
    const sampled = downsampleStable([0,1,2,3,4,5,6,7,8,9], 4);
    expect(sampled.points).toHaveLength(4);
    expect(sampled.points[0]).toBe(0);
    expect(sampled.points.at(-1)).toBe(9);
    expect(sampled.meta).toEqual({ original_count: 10, returned_count: 4, downsampled: true });
  });
});
