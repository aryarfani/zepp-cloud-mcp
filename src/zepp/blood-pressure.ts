import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { addIsoDays, type DateRange } from "../time";
import { BLOOD_PRESSURE_MAX_DAYS, buildZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, topLevelKeys } from "./normalize";
import { scrubIdentity } from "./scrub";

export interface BloodPressureReading {
  measured_at: string;
  date: string;
  systolic_mmhg: number;
  diastolic_mmhg: number;
  pulse_bpm?: number;
  /** `endpoint` = /users/me/bloodPressure, `event` = v2 blood_pressure/real_data stream. */
  source: "endpoint" | "event";
}

export interface BloodPressureEntry { reading: BloodPressureReading; raw: unknown }

const TIME_KEYS = ["timestamp", "time", "measureTime", "measuredAt", "measure_time", "generatedTime", "createTime", "startTime", "date"] as const;
const SYSTOLIC_KEYS = ["systolic", "sbp", "SBP", "high", "highPressure", "sys"] as const;
const DIASTOLIC_KEYS = ["diastolic", "dbp", "DBP", "low", "lowPressure", "dia"] as const;
const PULSE_KEYS = ["pulse", "heartRate", "heart_rate", "hr"] as const;

function inRange(value: unknown, min: number, max: number): number | undefined {
  const n = numericValue(value);
  return n !== undefined && n >= min && n <= max ? Math.round(n) : undefined;
}

function itemsOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const root = objectValue(raw);
  if (root) {
    for (const key of ["items", "data", "records", "list"] as const) {
      const candidate = root[key];
      if (Array.isArray(candidate)) return candidate;
    }
    if (Object.keys(root).length === 0) return [];
  }
  throw new ZeppError("unrecognized_payload", "Blood pressure response shape was not recognized", undefined, undefined, { topLevelKeys: topLevelKeys(raw) });
}

/**
 * IMPORTANT: this account has no blood pressure data, so the record layout is not verified against a live payload
 * (the endpoint and the event stream both return an empty list). Field names below are the common aliases; an item that
 * does not yield a time, a plausible systolic and a plausible diastolic value is skipped and counted, never guessed.
 */
export function normalizeBloodPressure(raw: unknown, source: BloodPressureReading["source"], timezone: string): { entries: BloodPressureEntry[]; skipped: number } {
  const entries: BloodPressureEntry[] = [];
  let skipped = 0;
  for (const item of itemsOf(raw)) {
    const object = objectValue(item);
    const nested = object ? (objectValue(object.value) ?? objectValue(object.summary) ?? object) : undefined;
    if (!object || !nested) { skipped++; continue; }
    const timeMs = parseTimestampMs(firstValue(object, TIME_KEYS)) ?? parseTimestampMs(firstValue(nested, TIME_KEYS));
    const systolic = inRange(firstValue(nested, SYSTOLIC_KEYS), 50, 300);
    const diastolic = inRange(firstValue(nested, DIASTOLIC_KEYS), 30, 200);
    if (timeMs === undefined || systolic === undefined || diastolic === undefined || diastolic >= systolic) { skipped++; continue; }
    const reading: BloodPressureReading = {
      measured_at: new Date(timeMs).toISOString(), date: localDateFromMs(timeMs, timezone),
      systolic_mmhg: systolic, diastolic_mmhg: diastolic, source
    };
    const pulse = inRange(firstValue(nested, PULSE_KEYS), 20, 250);
    if (pulse !== undefined) reading.pulse_bpm = pulse;
    entries.push({ reading, raw: scrubIdentity(object) });
  }
  return { entries, skipped };
}

/** Uncached fetch (endpoint in <=14-day windows + the v2 event stream). Used by the sync and the tool. */
export async function fetchBloodPressureEntries(
  ctx: ServiceContext, range: DateRange, pause: () => Promise<void> = async () => {}
): Promise<{ entries: BloodPressureEntry[]; skipped: number }> {
  const tz = ctx.config.USER_TIMEZONE;
  const all: BloodPressureEntry[] = [];
  let skipped = 0;
  // Windows of (max - 1) days, requested with one extra day: the exact edge semantics of `days`/`toDate` could not be
  // checked against real data (the account has none), and results are filtered to the requested range anyway.
  const windowDays = BLOOD_PRESSURE_MAX_DAYS - 1;
  for (let windowEnd = range.endDate; windowEnd >= range.startDate; windowEnd = addIsoDays(windowEnd, -windowDays)) {
    const windowStart = addIsoDays(windowEnd, -(windowDays - 1)) < range.startDate ? range.startDate : addIsoDays(windowEnd, -(windowDays - 1));
    const days = Math.round((Date.parse(windowEnd) - Date.parse(windowStart)) / 86_400_000) + 2;
    await pause();
    const raw = await ctx.zepp.get(buildZeppRequest("bloodPressure", { days, toDate: windowEnd }));
    const n = normalizeBloodPressure(raw, "endpoint", tz);
    all.push(...n.entries); skipped += n.skipped;
  }
  await pause();
  const eventRaw = await ctx.zepp.get(buildZeppRequest("v2Events", { eventType: "blood_pressure", subType: "real_data", from: range.fromMs, to: range.toMs, limit: 2000, reverse: 0 }));
  const events = normalizeBloodPressure(eventRaw, "event", tz);
  all.push(...events.entries); skipped += events.skipped;
  const seen = new Set<string>();
  const entries = all
    .filter(e => Date.parse(e.reading.measured_at) >= range.fromMs && Date.parse(e.reading.measured_at) <= range.toMs)
    .filter(e => { const k = `${e.reading.source}|${e.reading.measured_at}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.reading.measured_at.localeCompare(b.reading.measured_at));
  return { entries, skipped };
}

export async function getBloodPressure(ctx: ServiceContext, range: DateRange): Promise<Envelope<BloodPressureReading[]>> {
  const key = { userId: ctx.config.ZEPP_USER_ID, from: range.fromSec, to: range.toSec };
  const result = await withZeppCache("blood-pressure", key, 300, async () => {
    const { entries, skipped } = await fetchBloodPressureEntries(ctx, range);
    return { readings: entries.map(e => e.reading), skipped };
  });
  const warnings = result.skipped ? [`Skipped ${result.skipped} blood pressure item(s) that did not contain a time with plausible systolic/diastolic values.`] : [];
  return result.readings.length ? ok(result.readings, range.timezone, { warnings }) : noData(range.timezone, warnings);
}