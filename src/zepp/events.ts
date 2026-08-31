import type { AppConfig } from "../config";
import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { parseDateRange, type DateRange } from "../time";
import { buildZeppRequest, type ZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, sourceScope, topLevelKeys } from "./normalize";
import type { MetricPoint, SourceScope } from "./types";

export const REVIEWED_METRIC_IDS = [
  "hrv", "hrv_rmssd", "readiness", "respiratory_rate", "skin_temperature",
  "lactate_threshold", "daily_health", "blood_oxygen", "all_day_stress", "pai",
  "nightly_odi", "nightly_osa"
] as const;
export type ReviewedMetric = typeof REVIEWED_METRIC_IDS[number];

export const REVIEWED_METRICS = {
  hrv: { family: "v2", eventType: "hrv_sdnn", subType: "real_data" },
  hrv_rmssd: { family: "v2", eventType: "HRVRMSSD", subType: "real_data" },
  readiness: { family: "v2", eventType: "readiness", subType: "watch_score" },
  respiratory_rate: { family: "v2", eventType: "RespiratoryRate", subType: "real_data" },
  skin_temperature: { family: "v2", eventType: "skinTemp", subType: "real_data" },
  lactate_threshold: { family: "v2", eventType: "LactateThreshold", subType: "summary" },
  daily_health: { family: "v2", eventType: "DailyHealth", subType: "summary" },
  blood_oxygen: { family: "user", eventType: "blood_oxygen" },
  all_day_stress: { family: "user", eventType: "all_day_stress" },
  pai: { family: "user", eventType: "PaiHealthInfo" },
  nightly_odi: { family: "day", eventType: "blood_oxygen", subType: "odi" },
  nightly_osa: { family: "day", eventType: "blood_oxygen", subType: "osa_event" }
} as const satisfies Record<ReviewedMetric, { family: "v2" | "user" | "day"; eventType: string; subType?: string }>;

export const SERIES_METRIC_IDS = [
  "hrv_sdnn", "hrv_rmssd", "readiness", "respiratory_rate", "spo2",
  "stress", "pai_daily", "lactate_threshold_hr", "lactate_threshold_pace", "spo2_odi"
] as const;
export type SeriesMetric = typeof SERIES_METRIC_IDS[number];

export const SERIES_METRICS = {
  hrv_sdnn: { source: "hrv", outputMetric: "hrv", unit: "ms" },
  hrv_rmssd: { source: "hrv_rmssd", outputMetric: "hrv_rmssd", unit: "ms" },
  readiness: { source: "readiness", outputMetric: "readiness", unit: "score" },
  respiratory_rate: { source: "respiratory_rate", outputMetric: "respiratory_rate", unit: "brpm" },
  spo2: { source: "blood_oxygen", outputMetric: "spo2", unit: "%" },
  stress: { source: "all_day_stress", outputMetric: "stress", unit: "score" },
  pai_daily: { source: "pai", outputMetric: "pai_daily", unit: "pai" },
  lactate_threshold_hr: { source: "lactate_threshold", outputMetric: "lactate_threshold_hr", unit: "bpm" },
  lactate_threshold_pace: { source: "lactate_threshold", outputMetric: "lactate_threshold_pace", unit: "s/km" },
  spo2_odi: { source: "nightly_odi", outputMetric: "spo2_odi", unit: "events/h" }
} as const satisfies Record<SeriesMetric, { source: ReviewedMetric; outputMetric: string; unit: string }>;

export interface NormalizedEventPoint extends MetricPoint {
  metric: string;
}

const SECRET_KEYS = new Set(["apptoken", "authorization", "cookie", "access_token", "refresh_token", "token"]);

export function sanitizeRawPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeRawPayload);
  const object = objectValue(value);
  if (!object) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(object)) {
    if (SECRET_KEYS.has(key.toLowerCase())) continue;
    output[key] = sanitizeRawPayload(child);
  }
  return output;
}

function requireEventEnvelope(raw: unknown): { items: unknown[]; [key: string]: unknown } {
  const object = objectValue(raw);
  if (!object || !Array.isArray(object.items)) {
    throw new ZeppError(
      "unrecognized_payload",
      "Zepp event envelope must contain an items array",
      undefined,
      undefined,
      { topLevelKeys: topLevelKeys(raw) }
    );
  }
  return object as { items: unknown[]; [key: string]: unknown };
}

export function reviewedMetricRequest(metric: ReviewedMetric, range: DateRange, config: AppConfig): ZeppRequest {
  const mapping = REVIEWED_METRICS[metric];
  if (mapping.family === "v2") {
    return buildZeppRequest("v2Events", {
      eventType: mapping.eventType,
      subType: mapping.subType,
      from: range.fromMs,
      to: range.toMs,
      limit: 2000,
      reverse: 0
    });
  }
  if (mapping.family === "user") {
    return buildZeppRequest("userEvents", {
      userId: config.ZEPP_USER_ID,
      eventType: mapping.eventType,
      subType: "subType" in mapping ? String(mapping.subType) : undefined,
      from: range.fromMs,
      to: range.toMs,
      limit: 2000,
      reverse: 0
    });
  }
  return buildZeppRequest("userEventsDateString", {
    userId: config.ZEPP_USER_ID,
    eventType: mapping.eventType,
    subType: mapping.subType,
    from: range.startIso,
    to: range.endIso,
    timeZone: range.timezone,
    limit: 2000,
    reverse: 0
  });
}

function eventMatches(metric: ReviewedMetric, item: Record<string, unknown>): boolean {
  const mapping = REVIEWED_METRICS[metric];
  const eventType = firstValue(item, ["eventType", "type"]);
  if (typeof eventType === "string" && eventType !== mapping.eventType) return false;
  const expectedSubType = "subType" in mapping ? String(mapping.subType) : undefined;
  if (expectedSubType) {
    const subType = firstValue(item, ["subType", "sub_type"]);
    if (typeof subType === "string" && subType !== expectedSubType) return false;
  }
  if (metric === "blood_oxygen") {
    const subType = String(firstValue(item, ["subType", "sub_type"]) ?? "");
    if (subType === "odi" || subType === "osa_event") return false;
  }
  return true;
}

function parsedObject(value: unknown): Record<string, unknown> | undefined {
  const direct = objectValue(value);
  if (direct) return direct;
  if (typeof value === "string") {
    try { return objectValue(JSON.parse(value)); } catch { return undefined; }
  }
  return undefined;
}

function dateStartMs(value: unknown, timezone: string): number | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try { return parseDateRange(value, value, timezone).fromMs; } catch { return undefined; }
}

function eventTimeMs(item: Record<string, unknown>, timezone: string): number | undefined {
  return parseTimestampMs(firstValue(item, ["timestamp", "time", "timeStamp", "startTime"]))
    ?? dateStartMs(firstValue(item, ["dateString", "date", "dayId"]), timezone);
}

function point(metric: string, timeMs: number, value: number, unit: string, scope: SourceScope): NormalizedEventPoint {
  return { metric, time: new Date(timeMs).toISOString(), value, unit, source_scope: scope };
}

function nestedValue(item: Record<string, unknown>): Record<string, unknown> | undefined {
  return parsedObject(item.value);
}

function inRange(value: unknown, min: number, max: number): number | undefined {
  const number = numericValue(value);
  return number !== undefined && number >= min && number <= max ? number : undefined;
}

function normalizeHrv(metric: "hrv" | "hrv_rmssd", items: Record<string, unknown>[], timezone: string): NormalizedEventPoint[] {
  const output: NormalizedEventPoint[] = [];
  const outputMetric = metric === "hrv" ? "hrv" : "hrv_rmssd";
  for (const item of items) {
    const scope = sourceScope(item);
    const valueObject = nestedValue(item);
    const samples = valueObject && Array.isArray(valueObject.samples) ? valueObject.samples : undefined;
    if (samples && valueObject) {
      const base = parseTimestampMs(firstValue(valueObject, ["startTime", "start_time"])) ?? eventTimeMs(item, timezone);
      for (const rawSample of samples) {
        const sample = objectValue(rawSample);
        if (!sample) continue;
        const directTime = parseTimestampMs(firstValue(sample, ["timestamp", "time"]));
        const offset = numericValue(firstValue(sample, ["s", "offset"]));
        const time = directTime ?? (base !== undefined && offset !== undefined ? base + offset : undefined);
        const value = metric === "hrv_rmssd"
          ? inRange(firstValue(sample, ["rmssd", "hrv"]), 1, 400)
          : inRange(firstValue(sample, ["sdnn", "hrv", "value"]), 1, 400);
        if (time !== undefined && value !== undefined) output.push(point(outputMetric, time, value, "ms", scope));
      }
      continue;
    }
    const time = eventTimeMs(item, timezone);
    const direct = valueObject
      ? firstValue(valueObject, metric === "hrv_rmssd" ? ["rmssd", "hrv", "value"] : ["sdnn", "hrv", "value"])
      : firstValue(item, metric === "hrv_rmssd" ? ["rmssd", "hrv", "value"] : ["sdnn", "hrv", "value"]);
    const value = inRange(direct, 1, 400);
    if (time !== undefined && value !== undefined) output.push(point(outputMetric, time, value, "ms", scope));
  }
  return output;
}

function normalizeReadiness(items: Record<string, unknown>[], timezone: string): NormalizedEventPoint[] {
  return items.flatMap(item => {
    const object = nestedValue(item) ?? item;
    const value = inRange(firstValue(object, ["readiness", "readinessScore", "watchScore", "rdnsScore"]), 0, 100);
    const time = eventTimeMs(item, timezone) ?? dateStartMs(firstValue(object, ["dateString", "date"]), timezone);
    return value !== undefined && time !== undefined ? [point("readiness", time, value, "score", sourceScope(item))] : [];
  });
}

function decodeMinuteBytes(encoded: string): number[] {
  try {
    const binary = atob(encoded.trim());
    return Array.from(binary.slice(0, 1440), char => char.charCodeAt(0));
  } catch {
    return [];
  }
}

function normalizeRespiratoryRate(items: Record<string, unknown>[], timezone: string): NormalizedEventPoint[] {
  return items.flatMap(item => {
    const object = nestedValue(item) ?? item;
    const encoded = firstValue(object, ["measurements"]);
    if (typeof encoded !== "string") return [];
    const valid = decodeMinuteBytes(encoded).filter(value => value >= 4 && value <= 60);
    const time = eventTimeMs(item, timezone) ?? dateStartMs(firstValue(item, ["dateString", "date"]), timezone);
    if (!valid.length || time === undefined) return [];
    const average = Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
    return [point("respiratory_rate", time, average, "brpm", sourceScope(item))];
  });
}

function normalizeLactate(items: Record<string, unknown>[], timezone: string): NormalizedEventPoint[] {
  const output: NormalizedEventPoint[] = [];
  for (const item of items) {
    const object = nestedValue(item) ?? item;
    const samples = Array.isArray(object.samples) ? object.samples : [];
    for (const rawSample of samples) {
      const sample = objectValue(rawSample);
      if (!sample) continue;
      const time = eventTimeMs(sample, timezone) ?? dateStartMs(firstValue(sample, ["dateString", "date"]), timezone);
      if (time === undefined) continue;
      const hr = inRange(sample.lactateThresholdHr, 60, 230);
      const pace = inRange(sample.lactateThresholdPace, 100, 1800);
      if (hr !== undefined) output.push(point("lactate_threshold_hr", time, hr, "bpm", sourceScope(item)));
      if (pace !== undefined) output.push(point("lactate_threshold_pace", time, pace, "s/km", sourceScope(item)));
    }
  }
  return output;
}

function normalizeSpo2(items: Record<string, unknown>[], timezone: string): NormalizedEventPoint[] {
  return items.flatMap(item => {
    const extra = parsedObject(item.extra) ?? item;
    const value = inRange(firstValue(extra, ["spo2", "value"]), 50, 100);
    const time = eventTimeMs(item, timezone);
    return value !== undefined && time !== undefined ? [point("spo2", time, value, "%", sourceScope(item))] : [];
  });
}

function normalizeDailyField(
  items: Record<string, unknown>[],
  timezone: string,
  metric: string,
  aliases: readonly string[],
  min: number,
  max: number,
  unit: string
): NormalizedEventPoint[] {
  return items.flatMap(item => {
    const valueObject = nestedValue(item) ?? item;
    const value = inRange(firstValue(valueObject, aliases), min, max);
    const time = eventTimeMs(item, timezone) ?? dateStartMs(firstValue(valueObject, ["dateString", "date"]), timezone);
    return value !== undefined && time !== undefined ? [point(metric, time, value, unit, sourceScope(item))] : [];
  });
}

export function normalizeReviewedMetric(metric: ReviewedMetric, raw: unknown, timezone: string): NormalizedEventPoint[] {
  const envelope = requireEventEnvelope(raw);
  const items = envelope.items.map(objectValue).filter((item): item is Record<string, unknown> => Boolean(item)).filter(item => eventMatches(metric, item));
  let points: NormalizedEventPoint[];
  switch (metric) {
    case "hrv": points = normalizeHrv("hrv", items, timezone); break;
    case "hrv_rmssd": points = normalizeHrv("hrv_rmssd", items, timezone); break;
    case "readiness": points = normalizeReadiness(items, timezone); break;
    case "respiratory_rate": points = normalizeRespiratoryRate(items, timezone); break;
    case "lactate_threshold": points = normalizeLactate(items, timezone); break;
    case "blood_oxygen": points = normalizeSpo2(items, timezone); break;
    case "all_day_stress": points = normalizeDailyField(items, timezone, "stress", ["avgStress", "averageStress", "stress"], 0, 100, "score"); break;
    case "pai": points = normalizeDailyField(items, timezone, "pai_daily", ["dailyPai"], 0, 500, "pai"); break;
    case "nightly_odi": points = normalizeDailyField(items, timezone, "spo2_odi", ["odi"], 0, 100, "events/h"); break;
    case "nightly_osa":
    case "skin_temperature":
    case "daily_health":
      points = [];
      break;
  }
  return points.sort((a, b) => a.time.localeCompare(b.time));
}

function cacheTtl(range: DateRange): number {
  const today = localDateFromMs(Date.now(), range.timezone);
  return range.startDate <= today && today <= range.endDate ? 120 : 300;
}

export interface ReviewedMetricFetch {
  metric: ReviewedMetric;
  raw: { items: unknown[]; [key: string]: unknown };
  points: NormalizedEventPoint[];
}

export async function fetchReviewedMetric(ctx: ServiceContext, metric: ReviewedMetric, range: DateRange): Promise<ReviewedMetricFetch> {
  const raw = await withZeppCache(
    `reviewed-metric:${metric}`,
    { userId: ctx.config.ZEPP_USER_ID, metric, from: range.fromMs, to: range.toMs, timezone: range.timezone },
    cacheTtl(range),
    async () => {
      const response = await ctx.zepp.get(reviewedMetricRequest(metric, range, ctx.config));
      const envelope = requireEventEnvelope(response);
      return sanitizeRawPayload(envelope) as { items: unknown[]; [key: string]: unknown };
    }
  );
  return { metric, raw, points: normalizeReviewedMetric(metric, raw, range.timezone) };
}

export async function getRawMetric(ctx: ServiceContext, metric: ReviewedMetric, range: DateRange): Promise<Envelope<unknown>> {
  const result = await fetchReviewedMetric(ctx, metric, range);
  return result.raw.items.length ? ok(result.raw, range.timezone) : noData(range.timezone);
}

export async function getMetricSeries(
  ctx: ServiceContext,
  metric: SeriesMetric,
  range: DateRange,
  limit?: number
): Promise<Envelope<MetricPoint[]>> {
  const mapping = SERIES_METRICS[metric];
  const result = await fetchReviewedMetric(ctx, mapping.source, range);
  let points = result.points.filter(item => item.metric === mapping.outputMetric).map(({ metric: _metric, ...item }) => item);
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new ZeppError("unsupported", "Metric series limit must be an integer from 1 to 2000");
    points = points.slice(-limit);
  }
  return points.length ? ok(points, range.timezone) : noData(range.timezone);
}

export function classifyCapabilityProbe(input: { positiveControl: unknown[]; negativeControl: unknown[] }): "verified" | "indeterminate" {
  return input.positiveControl.length > 0 && input.negativeControl.length === 0 ? "verified" : "indeterminate";
}
