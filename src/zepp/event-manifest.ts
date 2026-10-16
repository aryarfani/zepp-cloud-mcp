import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { addIsoDays, parseDateRange } from "../time";
import { BLOOD_PRESSURE_MAX_DAYS, buildZeppRequest, type ZeppRequest } from "./endpoints";
import { localDateFromMs, objectValue, parseTimestampMs } from "./normalize";

export type StreamFamily = "v2" | "user" | "day" | "endpoint";

export interface StreamDescriptor {
  id: string;
  family: StreamFamily;
  event_type: string;
  sub_type: string | null;
  /** MCP tool that decodes this stream, or null when it is only discoverable (raw or undecoded). */
  decoded_by: string | null;
  note?: string;
}

/**
 * Curated catalogue of the Zepp event streams and data endpoints this server knows about (derived from the reviewed
 * metric table plus the ZeppBridge / zepp-life-mcp / zepp-health-cli references). Zepp has no API that lists the
 * streams of an account (the old `/users/me/fileInfo/events` call now requires an eventType), so availability is
 * discovered by asking each stream for its most recent event.
 */
export const STREAM_CATALOG: readonly StreamDescriptor[] = [
  { id: "hrv_sdnn", family: "v2", event_type: "hrv_sdnn", sub_type: "real_data", decoded_by: "get_recovery" },
  { id: "hrv_rmssd", family: "v2", event_type: "HRVRMSSD", sub_type: "real_data", decoded_by: "get_recovery" },
  { id: "readiness", family: "v2", event_type: "readiness", sub_type: "watch_score", decoded_by: "get_recovery" },
  { id: "respiratory_rate", family: "v2", event_type: "RespiratoryRate", sub_type: "real_data", decoded_by: "get_recovery" },
  { id: "skin_temperature", family: "v2", event_type: "skinTemp", sub_type: "real_data", decoded_by: "get_raw_metric" },
  { id: "lactate_threshold", family: "v2", event_type: "LactateThreshold", sub_type: "summary", decoded_by: "get_training_status" },
  { id: "daily_health", family: "v2", event_type: "DailyHealth", sub_type: "summary", decoded_by: "get_raw_metric" },
  { id: "hybrid_charge", family: "v2", event_type: "Charge", sub_type: "real_data", decoded_by: "get_hybrid_charge" },
  { id: "hybrid_charge_insights", family: "v2", event_type: "Charge", sub_type: "insight_data", decoded_by: "get_hybrid_charge", note: "values passed through, meaning undocumented" },
  { id: "hybrid_charge_stress", family: "v2", event_type: "Charge", sub_type: "stress_data", decoded_by: null, note: "samples hold an opaque base64 stressInfo blob (not decoded)" },
  { id: "emotion", family: "v2", event_type: "Emotion", sub_type: "real_data", decoded_by: "get_emotion_events", note: "layout unverified if empty" },
  { id: "blood_pressure_event", family: "v2", event_type: "blood_pressure", sub_type: "real_data", decoded_by: "get_blood_pressure", note: "layout unverified if empty" },
  { id: "second_heart_rate", family: "v2", event_type: "second_heart_rate", sub_type: "real_data", decoded_by: null, note: "index of per-second heart-rate files, not the samples" },
  { id: "hrv_v2", family: "v2", event_type: "HeartRateVariability", sub_type: "real_data", decoded_by: null, note: "newer HRV stream the Zepp app reads; empty on the account it was checked against (hrv_sdnn carries the HRV there)" },
  { id: "wakeup_resting_hr", family: "v2", event_type: "WakeupRestingHeartRate", sub_type: "real_data", decoded_by: null, note: "resting heart rate on waking; empty on the checked account (daily resting HR comes from band_data)" },
  { id: "daily_activity", family: "v2", event_type: "DailyActivity", sub_type: "real_data", decoded_by: null, note: "minute-level steps per day (samples { s, step, jsonExtra }); duplicates the band_data step data, not stored" },
  { id: "dynamic_readiness", family: "v2", event_type: "DynamicReadinessScore", sub_type: "real_data", decoded_by: null, note: "empty on the checked account (readiness/watch_score carries the score)" },
  { id: "spo2_decrease_v2", family: "v2", event_type: "Spo2DecreaseV2", sub_type: "real_data", decoded_by: null, note: "empty on the checked account (blood_oxygen osa_event carries the SpO2 dips)" },
  { id: "emotion_baseline", family: "v2", event_type: "EmotionBaseline", sub_type: "real_data", decoded_by: null, note: "empty on the checked account" },
  { id: "health_tags", family: "user", event_type: "HealthTagRecord", sub_type: "real_data", decoded_by: null, note: "behaviour tags (caffeine, alcohol...); empty on the checked account" },
  { id: "blood_oxygen", family: "user", event_type: "blood_oxygen", sub_type: null, decoded_by: "get_recovery" },
  { id: "all_day_stress", family: "user", event_type: "all_day_stress", sub_type: null, decoded_by: "get_recovery" },
  { id: "pai", family: "user", event_type: "PaiHealthInfo", sub_type: null, decoded_by: "get_metric_series" },
  { id: "single_stress", family: "user", event_type: "single_stress", sub_type: null, decoded_by: "get_emotion_events" },
  { id: "health_data_blood_pressure", family: "user", event_type: "health_data", sub_type: "blood_pressure", decoded_by: null, note: "legacy blood pressure stream seen in app captures" },
  { id: "nightly_odi", family: "day", event_type: "blood_oxygen", sub_type: "odi", decoded_by: "get_metric_series" },
  { id: "nightly_osa", family: "day", event_type: "blood_oxygen", sub_type: "osa_event", decoded_by: "get_raw_metric" },
  { id: "weight_records", family: "endpoint", event_type: "weightRecords", sub_type: null, decoded_by: "get_weight" },
  { id: "blood_pressure_endpoint", family: "endpoint", event_type: "bloodPressure", sub_type: null, decoded_by: "get_blood_pressure" }
];

export type StreamStatus = "has_data" | "empty" | "error";

export interface StreamAvailability extends StreamDescriptor {
  status: StreamStatus;
  latest_event_at: string | null;
  error_kind?: string;
}

export interface EventManifest {
  window_days: number;
  checked_at: string;
  summary: { checked: number; with_data: number; empty: number; errors: number };
  streams: StreamAvailability[];
}

const FATAL = new Set(["auth_expired", "upstream_rate_limited"]);
const MAX_WINDOW_DAYS = 365;

function itemList(raw: unknown): unknown[] | undefined {
  if (Array.isArray(raw)) return raw;
  const root = objectValue(raw);
  return root && Array.isArray(root.items) ? root.items : undefined;
}

function latestOf(items: unknown[], timezone: string): string | null {
  let best: number | undefined;
  for (const item of items) {
    const o = objectValue(item);
    if (!o) continue;
    const ms = parseTimestampMs(o.timestamp ?? o.generatedTime ?? o.time) ?? (typeof o.dateString === "string" ? Date.parse(`${o.dateString}T00:00:00Z`) : undefined);
    if (ms !== undefined && (best === undefined || ms > best)) best = ms;
  }
  void timezone;
  return best === undefined ? null : new Date(best).toISOString();
}

function requestFor(stream: StreamDescriptor, ctx: ServiceContext, nowMs: number, days: number): ZeppRequest {
  const fromMs = nowMs - days * 86_400_000;
  const userId = ctx.config.ZEPP_USER_ID;
  const tz = ctx.config.USER_TIMEZONE;
  switch (stream.family) {
    case "v2":
      return buildZeppRequest("v2Events", { eventType: stream.event_type, subType: stream.sub_type ?? undefined, from: fromMs, to: nowMs, limit: 1, reverse: 1 });
    case "user":
      return buildZeppRequest("userEvents", { userId, eventType: stream.event_type, subType: stream.sub_type ?? undefined, from: fromMs, to: nowMs, limit: 1, reverse: 1 });
    case "day": {
      const end = localDateFromMs(nowMs, tz);
      const range = parseDateRange(addIsoDays(end, -Math.min(days, 31) + 1), end, tz);
      return buildZeppRequest("userEventsDateString", { userId, eventType: stream.event_type, subType: stream.sub_type ?? undefined, from: range.startIso, to: range.endIso, timeZone: tz, limit: 1, reverse: 1 });
    }
    case "endpoint":
      if (stream.event_type === "weightRecords") return buildZeppRequest("weightRecords", { userId, fromTime: Math.floor(fromMs / 1000), toTime: Math.floor(nowMs / 1000), limit: 1, isForward: 0 });
      return buildZeppRequest("bloodPressure", { days: Math.min(days, BLOOD_PRESSURE_MAX_DAYS), toDate: localDateFromMs(nowMs, tz) });
  }
}

/** Uncached probe of every catalogued stream (sequential; one tiny request each). */
export async function probeStreams(
  ctx: ServiceContext, days: number, nowMs: number = Date.now(), pause: () => Promise<void> = async () => {}
): Promise<EventManifest> {
  const windowDays = Math.max(1, Math.min(MAX_WINDOW_DAYS, Math.floor(days)));
  const streams: StreamAvailability[] = [];
  for (const stream of STREAM_CATALOG) {
    await pause();
    try {
      const raw = await ctx.zepp.get(requestFor(stream, ctx, nowMs, windowDays));
      const items = itemList(raw);
      if (!items) throw new ZeppError("unrecognized_payload", "Unrecognized response shape");
      streams.push({ ...stream, status: items.length ? "has_data" : "empty", latest_event_at: items.length ? latestOf(items, ctx.config.USER_TIMEZONE) : null });
    } catch (e) {
      if (e instanceof ZeppError && !FATAL.has(e.kind)) { streams.push({ ...stream, status: "error", latest_event_at: null, error_kind: e.kind }); continue; }
      throw e;
    }
  }
  const withData = streams.filter(s => s.status === "has_data").length;
  const errors = streams.filter(s => s.status === "error").length;
  return {
    window_days: windowDays, checked_at: new Date(nowMs).toISOString(),
    summary: { checked: streams.length, with_data: withData, empty: streams.length - withData - errors, errors },
    streams
  };
}

export async function listEventTypes(ctx: ServiceContext, days = 90): Promise<Envelope<EventManifest>> {
  const windowDays = Math.max(1, Math.min(MAX_WINDOW_DAYS, Math.floor(days)));
  const manifest = await withZeppCache("event-manifest", { userId: ctx.config.ZEPP_USER_ID, windowDays }, 600, () => probeStreams(ctx, windowDays));
  return ok(manifest, ctx.config.USER_TIMEZONE);
}