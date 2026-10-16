import { describe, expect, it } from "vitest";
import { buildRecoveryDays } from "../src/zepp/recovery-days";
import { normalizeCalendar } from "../src/zepp/live-probe";

const TZ = "Asia/Jakarta";
const ev = (iso: string, extra: Record<string, unknown>) => ({ timestamp: Date.parse(iso), ...extra });

describe("buildRecoveryDays", () => {
  it("files overnight HRV under the wake-up date and averages it", () => {
    const rows = buildRecoveryDays({
      hrv: [
        { time: "2026-10-14T23:30:00+07:00", value: 60 }, // evening: belongs to 15 Oct
        { time: "2026-10-15T02:00:00+07:00", value: 80 },
        { time: "2026-10-15T20:00:00+07:00", value: 50 } // evening again: 16 Oct
      ],
      readiness: [], odi: [], osa: []
    }, TZ, "2026-10-14", "2026-10-16");
    expect(rows.map(r => [r.date, r.hrv_ms, r.hrv_samples])).toEqual([["2026-10-15", 70, 2], ["2026-10-16", 50, 1]]);
  });

  it("reads readiness (255 = unavailable is dropped), keeps the newest event per day and the components", () => {
    const day = "2026-10-15T00:00:00+07:00";
    const rows = buildRecoveryDays({
      hrv: [], odi: [], osa: [],
      readiness: [
        { timestamp: Date.parse(day), value: JSON.stringify({ timestamp: Date.parse(day), timestampUpdate: 1000, rdnsScore: 40, sleepHRV: 55, sleepRHR: 60 }) },
        { timestamp: Date.parse(day), value: JSON.stringify({ timestamp: Date.parse(day), timestampUpdate: 2000, rdnsScore: 72, sleepHRV: 58, sleepRHR: 57, hrvScore: 80, rhrScore: 70, hrvBaseline: 61, rhrBaseline: 58 }) },
        { timestamp: Date.parse("2026-10-16T00:00:00+07:00"), value: JSON.stringify({ timestamp: Date.parse("2026-10-16T00:00:00+07:00"), timestampUpdate: 3000, rdnsScore: 255, sleepHRV: 999 }) }
      ]
    }, TZ, "2026-10-01", "2026-10-31");
    expect(rows[0]).toMatchObject({ date: "2026-10-15", readiness: 72, sleep_hrv: 58, sleep_rhr: 57, hrv_score: 80, rhr_score: 70, hrv_baseline: 61, rhr_baseline: 58 });
    expect(rows[1]).toMatchObject({ date: "2026-10-16", readiness: null, sleep_hrv: null });
  });

  it("counts SpO2 dips per night once even when an event arrives twice, and keeps the lowest value", () => {
    const e1 = ev("2026-10-15T01:10:00+07:00", { extra: JSON.stringify({ spo2_decrease: 90 }) });
    const e2 = ev("2026-10-15T03:40:00+07:00", { extra: { spo2_decrease: 86 } });
    const rows = buildRecoveryDays({
      hrv: [], readiness: [],
      odi: [ev("2026-10-15T07:00:00+07:00", { odi: 2.345, odiNum: 17 }), ev("2026-10-15T07:05:00+07:00", { odi: -1 })],
      osa: [e1, e2, e1]
    }, TZ, "2026-10-15", "2026-10-15");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ spo2_dips: 2, spo2_low: 86, odi: 2.35, odi_events: 17 });
  });

  it("returns only dates inside the requested window and ignores junk", () => {
    const rows = buildRecoveryDays({ hrv: [{ time: "not a date", value: 1 }], readiness: [null, 5, "x"], odi: [{}], osa: [{ timestamp: "?" }] } as never, TZ, "2026-10-01", "2026-10-02");
    expect(rows).toEqual([]);
  });
});

describe("normalizeCalendar", () => {
  const NOW = Date.parse("2026-10-16T05:00:00Z");
  it("keeps upcoming entries, sorted, with cleaned titles", () => {
    const out = normalizeCalendar({ data: { items: [
      { title: "Long run\u0007", scheduledStartAt: "2026-10-20T06:00:00Z", scheduledEndAt: "2026-10-20T07:00:00Z", status: 0 },
      { scheduledStartAt: Date.parse("2026-10-18T06:00:00Z") },
      { title: "Old", scheduledStartAt: "2026-09-01T06:00:00Z" },
      { title: "No time" }
    ] } }, NOW);
    expect(out.map(p => p.title)).toEqual(["Planned workout", "Long run"]);
    expect(out[1]).toMatchObject({ start_at: "2026-10-20T06:00:00.000Z", end_at: "2026-10-20T07:00:00.000Z", status: 0 });
  });
  it("accepts an empty list and rejects an unknown payload", () => {
    expect(normalizeCalendar({ data: { items: [] } }, NOW)).toEqual([]);
    expect(() => normalizeCalendar({ nope: 1 }, NOW)).toThrow();
  });
});
