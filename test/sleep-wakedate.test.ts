import { describe, expect, it } from "vitest";
import { normalizeBandData } from "../src/zepp/activity";

/** A band_data response whose items each carry one sleep session (epoch seconds), like the real payload. */
function band(nights: Array<{ day: string; st: string; ed: string }>) {
  const items = nights.map(n => {
    const slp = { st: Date.parse(n.st) / 1000, ed: Date.parse(n.ed) / 1000, wk: 10, ss: 80, stage: [{ start: 0, stop: 59, mode: 5 }] };
    return { date_time: n.day, deviceId: "d1", summary: btoa(JSON.stringify({ tz: 25200, slp, stp: { ttl: 100 } })) };
  });
  return { data: { items } };
}

describe("sleep is keyed by the wake date (Asia/Jakarta)", () => {
  it("bed before midnight: the night belongs to the next day", () => {
    const r = normalizeBandData(band([{ day: "2026-10-06", st: "2026-10-05T23:47:00+07:00", ed: "2026-10-06T07:55:00+07:00" }]));
    expect(r.sleep.map(s => s.sleep_date)).toEqual(["2026-10-06"]);
    expect(r.diagnostics).toEqual([]);
  });

  it("bed after midnight: the night belongs to the same day it started", () => {
    const r = normalizeBandData(band([{ day: "2026-10-07", st: "2026-10-07T01:23:00+07:00", ed: "2026-10-07T07:50:00+07:00" }]));
    expect(r.sleep.map(s => s.sleep_date)).toEqual(["2026-10-07"]);
  });

  it("consecutive nights (one before, one after midnight) get one date each and never share a key", () => {
    const r = normalizeBandData(band([
      { day: "2026-10-06", st: "2026-10-05T23:47:00+07:00", ed: "2026-10-06T07:55:00+07:00" },
      { day: "2026-10-07", st: "2026-10-07T01:23:00+07:00", ed: "2026-10-07T07:50:00+07:00" },
      { day: "2026-10-08", st: "2026-10-07T23:10:00+07:00", ed: "2026-10-08T06:40:00+07:00" }
    ]));
    expect(r.sleep.map(s => s.sleep_date)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(new Set(r.sleep.map(s => s.sleep_date)).size).toBe(3);
  });

  it("logs a diagnostic (no payload data) when the wake date differs from the band_data day", () => {
    const r = normalizeBandData(band([{ day: "2026-10-05", st: "2026-10-05T23:47:00+07:00", ed: "2026-10-06T07:55:00+07:00" }]));
    expect(r.sleep[0]?.sleep_date).toBe("2026-10-06");
    expect(r.diagnostics).toEqual(["item 0: sleep wake date 2026-10-06 differs from the band_data day 2026-10-05"]);
  });

  it("uses the configured timezone for the wake date", () => {
    const r = normalizeBandData(band([{ day: "2026-10-06", st: "2026-10-05T16:30:00Z", ed: "2026-10-05T23:30:00Z" }]), "America/New_York");
    expect(r.sleep[0]?.sleep_date).toBe("2026-10-05"); // 19:30 local in New York
  });
});
