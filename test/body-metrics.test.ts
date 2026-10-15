import { describe, expect, it } from "vitest";
import { ZeppError } from "../src/errors";
import type { ServiceContext } from "../src/services";
import { parseDateRange } from "../src/time";
import { fetchBloodPressureEntries, normalizeBloodPressure } from "../src/zepp/blood-pressure";
import { normalizeChargeInsights, normalizeChargeSamples, summarizeChargeDays } from "../src/zepp/charge";
import { normalizeEmotion, normalizeSpotStress } from "../src/zepp/emotion";
import { STREAM_CATALOG, probeStreams } from "../src/zepp/event-manifest";
import { buildZeppRequest } from "../src/zepp/endpoints";
import { scrubIdentity } from "../src/zepp/scrub";
import { normalizeWeightRecords } from "../src/zepp/weight";

const TZ = "Asia/Jakarta";
const dayStart = Date.parse("2026-08-31T00:00:00Z");

// Shapes below match what the live Zepp API returned for the real account (values replaced).
const weightPayload = { items: [
  { userId: "1", memberId: "-1", generatedTime: 1788051866, weightType: 1, summary: { weight: 64.5, height: 166, age: 26, bmi: 23.406881, bodyStyle: 2, deviceSn: "SN", timeZone: "Asia/Jakarta" }, createTime: 1788051867 },
  { generatedTime: 1783676288, summary: { weight: 53.5, height: 166, bmi: 19.41501 } },
  { generatedTime: 1783000000, summary: { weight: 0, height: 166 } },
  { summary: { weight: 60 } }
] };

describe("weight", () => {
  it("normalizes verified fields, sorts ascending, skips unusable items and never fabricates missing fields", () => {
    const { entries, skipped } = normalizeWeightRecords(weightPayload, TZ);
    expect(skipped).toBe(2);
    expect(entries.map(e => e.record.weight_kg)).toEqual([53.5, 64.5]);
    expect(entries[1]!.record).toEqual({ measured_at: "2026-08-30T01:04:26.000Z", date: "2026-08-30", weight_kg: 64.5, height_cm: 166, bmi: 23.4, body_style: 2, source_scope: "unknown" });
    expect(entries[0]!.record.body_style).toBeUndefined();
    expect(JSON.stringify(entries[1]!.raw)).not.toContain("SN");
    expect(JSON.stringify(entries[1]!.raw)).not.toContain("userId");
  });
  it("treats an empty items list as no data and rejects an unrecognized shape", () => {
    expect(normalizeWeightRecords({ items: [] }, TZ)).toEqual({ entries: [], skipped: 0 });
    expect(() => normalizeWeightRecords({ nope: 1 }, TZ)).toThrow(ZeppError);
  });
});

describe("blood pressure", () => {
  it("builds the verified request and caps the window at 14 days", () => {
    expect(buildZeppRequest("bloodPressure", { days: 14, toDate: "2026-08-31" })).toEqual({
      path: "/users/me/bloodPressure",
      query: { days: "14", sourceArrayStr: "com.huami.midong.associated,com.huami.midong", toDate: "2026-08-31" }
    });
    expect(() => buildZeppRequest("bloodPressure", { days: 30, toDate: "2026-08-31" })).toThrow(/1 to 14/);
    expect(() => buildZeppRequest("bloodPressure", { days: 7, toDate: "31-08-2026" })).toThrow(/toDate/);
  });
  it("returns nothing for the empty payloads Zepp sends for this account", () => {
    expect(normalizeBloodPressure([], "endpoint", TZ)).toEqual({ entries: [], skipped: 0 });
    expect(normalizeBloodPressure({ items: [] }, "event", TZ)).toEqual({ entries: [], skipped: 0 });
  });
  it("reads plausible readings (layout is unverified: no data in this account) and skips implausible ones", () => {
    const { entries, skipped } = normalizeBloodPressure([
      { time: 1788051866, systolic: 121, diastolic: 79, pulse: 62, userId: "x" },
      { timestamp: 1788051966000, value: { sbp: 135, dbp: 88 } },
      { time: 1788052066, systolic: 70, diastolic: 120 },
      { systolic: 120, diastolic: 80 }
    ], "endpoint", TZ);
    expect(skipped).toBe(2);
    expect(entries.map(e => [e.reading.systolic_mmhg, e.reading.diastolic_mmhg, e.reading.pulse_bpm])).toEqual([[121, 79, 62], [135, 88, undefined]]);
    expect(JSON.stringify(entries[0]!.raw)).not.toContain("userId");
  });
  it("queries the endpoint in windows of at most 14 days and the event stream once", async () => {
    const calls: Array<{ path: string; query: Record<string, string> }> = [];
    const ctx = { config: { ZEPP_USER_ID: "1234567890", USER_TIMEZONE: TZ }, zepp: { async get(r: any) { calls.push(r); return r.path === "/users/me/bloodPressure" ? [] : { items: [] }; } } } as unknown as ServiceContext;
    const range = parseDateRange("2026-08-01", "2026-08-31", TZ);
    const result = await fetchBloodPressureEntries(ctx, range);
    expect(result).toEqual({ entries: [], skipped: 0 });
    const endpoint = calls.filter(c => c.path === "/users/me/bloodPressure");
    expect(endpoint.length).toBeGreaterThanOrEqual(3);
    expect(endpoint.every(c => Number(c.query.days) >= 1 && Number(c.query.days) <= 14)).toBe(true);
    expect(calls.filter(c => c.path === "/v2/users/me/events")).toHaveLength(1);
  });
});

describe("hybrid charge", () => {
  const real = { items: [{ eventType: "Charge", subType: "real_data", timestamp: dayStart, value: { startTime: dayStart, deviceSN: "SN", samples: [
    { s: 0, total: 36, mental: 6.8, physical: 66, status: 0 }, { s: 60000, total: 40, mental: 7.2, physical: 66.2, status: 0 },
    { s: 120000, total: 140, mental: 7.6 }, { s: -5, total: 10 }, { total: 11 }
  ] } }, { value: { samples: "not-an-array" } }] };
  it("treats s as a millisecond offset from startTime and drops implausible or malformed samples", () => {
    const samples = normalizeChargeSamples(real, null, TZ);
    expect(samples.map(s => [s.ts_ms - dayStart, s.total])).toEqual([[0, 36], [60000, 40]]);
    expect(samples[0]).toMatchObject({ date: "2026-08-31", mental: 6.8, physical: 66, status: 0 });
  });
  it("filters to the requested range", () => {
    expect(normalizeChargeSamples(real, { fromMs: dayStart + 30000, toMs: dayStart + 90000 }, TZ)).toHaveLength(1);
  });
  it("summarizes per local day", () => {
    const days = summarizeChargeDays(normalizeChargeSamples(real, null, TZ));
    expect(days).toEqual([{
      date: "2026-08-31", sample_count: 2, first_at: "2026-08-31T00:00:00.000Z", last_at: "2026-08-31T00:01:00.000Z",
      total: { first: 36, last: 40, min: 36, max: 40, avg: 38 }, mental_avg: 7, physical_avg: 66.1
    }]);
  });
  it("passes insight fields through without interpreting them and strips identifiers", () => {
    const [insight] = normalizeChargeInsights({ items: [{ value: { startTime: dayStart, deviceId: "D", samples: [{ s: 0, u: 5, type: 3, insight: 29, insightId: 1, deviceSn: "SN", jsonExtra: "{}" }] } }] }, null, TZ);
    expect(insight).toMatchObject({ ts_ms: dayStart, insight_type: 3, insight: 29, insight_id: 1 });
    expect(JSON.stringify(insight!.raw)).not.toContain("SN");
  });
  it("rejects a payload without an items array", () => {
    expect(() => normalizeChargeSamples({ oops: true }, null, TZ)).toThrow(ZeppError);
  });
});

describe("emotion / spot stress", () => {
  it("reads single_stress events (string values) and ignores out-of-range ones", () => {
    const { entries, skipped } = normalizeSpotStress({ items: [
      { timestamp: 1784621819000, value: "44", deviceSn: "SN" }, { timestamp: 1785623220000, value: 49 }, { timestamp: 1, value: "400" }, { value: "10" }
    ] }, TZ);
    expect(skipped).toBe(2);
    expect(entries.map(e => [e.event.source, e.event.value])).toEqual([["spot_stress", 44], ["spot_stress", 49]]);
    expect(JSON.stringify(entries[0]!.raw)).not.toContain("SN");
  });
  it("returns nothing for the empty Emotion stream and reads sample-style events tolerantly", () => {
    expect(normalizeEmotion({ items: [] }, TZ)).toEqual({ entries: [], skipped: 0 });
    const { entries } = normalizeEmotion({ items: [{ timestamp: dayStart, value: { startTime: dayStart, samples: [{ s: 1000, emotion: 2, u: 1 }] } }] }, TZ);
    expect(entries[0]!.event).toMatchObject({ source: "emotion", value: 2, at: "2026-08-31T00:00:01.000Z" });
  });
});

describe("scrubIdentity", () => {
  it("removes identifiers and credential-like keys recursively but keeps measurements", () => {
    expect(scrubIdentity({ userId: "1", summary: { weight: 60, deviceSn: "S", deviceMac: "M" }, list: [{ apptoken: "t", v: 1 }] }))
      .toEqual({ summary: { weight: 60 }, list: [{ v: 1 }] });
  });
});

describe("event manifest", () => {
  it("probes every catalogued stream sequentially and reports data / empty / error", async () => {
    const seen: string[] = [];
    const zepp = { async get(r: any) {
      seen.push(`${r.path}|${r.query.eventType ?? ""}|${r.query.subType ?? ""}`);
      if (r.query.eventType === "Charge" && r.query.subType === "real_data") return { items: [{ timestamp: dayStart, value: {} }] };
      if (r.query.eventType === "single_stress") return { items: [{ timestamp: dayStart + 5000, value: "44" }] };
      if (r.query.eventType === "skinTemp") throw new ZeppError("upstream_error", "HTTP 400");
      if (r.path === "/users/me/bloodPressure") return [];
      return { items: [] };
    } };
    const ctx = { config: { ZEPP_USER_ID: "1234567890", USER_TIMEZONE: TZ }, zepp } as unknown as ServiceContext;
    let pauses = 0;
    const manifest = await probeStreams(ctx, 90, Date.parse("2026-08-31T03:00:00Z"), async () => { pauses++; });
    expect(manifest.streams).toHaveLength(STREAM_CATALOG.length);
    expect(seen).toHaveLength(STREAM_CATALOG.length);
    expect(pauses).toBe(STREAM_CATALOG.length);
    const byId = Object.fromEntries(manifest.streams.map(s => [s.id, s]));
    expect(byId.hybrid_charge).toMatchObject({ status: "has_data", latest_event_at: "2026-08-31T00:00:00.000Z", decoded_by: "get_hybrid_charge" });
    expect(byId.single_stress).toMatchObject({ status: "has_data", latest_event_at: "2026-08-31T00:00:05.000Z" });
    expect(byId.emotion).toMatchObject({ status: "empty", latest_event_at: null });
    expect(byId.skin_temperature).toMatchObject({ status: "error", error_kind: "upstream_error" });
    expect(byId.blood_pressure_endpoint!.status).toBe("empty");
    expect(manifest.summary).toEqual({ checked: STREAM_CATALOG.length, with_data: 2, empty: STREAM_CATALOG.length - 3, errors: 1 });
  });
  it("stops on auth_expired instead of reporting it per stream", async () => {
    const ctx = { config: { ZEPP_USER_ID: "1234567890", USER_TIMEZONE: TZ }, zepp: { async get() { throw new ZeppError("auth_expired", "expired", 401); } } } as unknown as ServiceContext;
    await expect(probeStreams(ctx, 30)).rejects.toMatchObject({ kind: "auth_expired" });
  });
});