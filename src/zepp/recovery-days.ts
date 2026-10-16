// Per-date recovery figures for the dashboard's Recovery page, read from event streams this server already decodes:
//   hrv_sdnn/real_data      overnight HRV readings (samples { s offset ms, sdnn }), filed under the wake-up date
//   readiness/watch_score   one score per day (rdnsScore) with sleepHRV, sleepRHR, component scores and baselines
//   blood_oxygen/odi        nightly oxygen desaturation index (odi events/h, odiNum events)
//   blood_oxygen/osa_event  one event per SpO2 dip (extra.spo2_decrease = the SpO2 % reached)
// Verified live on an Amazfit Active 3 (2026-10-16). The newer Spo2DecreaseV2, HeartRateVariability, WakeupRestingHeartRate,
// DynamicReadinessScore and EmotionBaseline streams answered with an empty list for that account, so they are not read.
import { ZeppError } from "../errors";
import { fetchReviewedMetric } from "./events";
import type { ServiceContext } from "../services";
import { addIsoDays, parseDateRange, type DateRange } from "../time";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs } from "./normalize";

export interface RecoveryDay {
  date: string;
  hrv_ms: number | null;
  hrv_samples: number | null;
  readiness: number | null;
  sleep_hrv: number | null;
  sleep_rhr: number | null;
  hrv_score: number | null;
  rhr_score: number | null;
  hrv_baseline: number | null;
  rhr_baseline: number | null;
  odi: number | null;
  odi_events: number | null;
  spo2_dips: number | null;
  spo2_low: number | null;
}

/** Overnight readings are filed under the date the user wakes up: a reading at or after 18:00 local counts for the next day. */
export const WAKE_SHIFT_MS = 6 * 3_600_000;

const blank = (date: string): RecoveryDay => ({
  date, hrv_ms: null, hrv_samples: null, readiness: null, sleep_hrv: null, sleep_rhr: null, hrv_score: null, rhr_score: null,
  hrv_baseline: null, rhr_baseline: null, odi: null, odi_events: null, spo2_dips: null, spo2_low: null
});

const within = (value: unknown, min: number, max: number): number | null => {
  const n = numericValue(value);
  return n !== undefined && n >= min && n <= max ? n : null;
};
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const wakeDate = (ms: number, tz: string) => localDateFromMs(ms + WAKE_SHIFT_MS, tz);

function parsedObject(value: unknown): Record<string, unknown> | undefined {
  const direct = objectValue(value);
  if (direct) return direct;
  if (typeof value === "string") { try { return objectValue(JSON.parse(value)); } catch { return undefined; } }
  return undefined;
}

export interface RecoveryInputs {
  /** hrv points from normalizeReviewedMetric("hrv"): { time ISO, value ms } */
  hrv: ReadonlyArray<{ time: string; value: number }>;
  /** raw readiness / odi / osa_event event items */
  readiness: readonly unknown[];
  odi: readonly unknown[];
  osa: readonly unknown[];
}

/** Pure: builds the per-date rows from the decoded streams. Only dates inside [from, to] are returned. */
export function buildRecoveryDays(input: RecoveryInputs, tz: string, from: string, to: string): RecoveryDay[] {
  const days = new Map<string, RecoveryDay>();
  const day = (date: string) => { let d = days.get(date); if (!d) { d = blank(date); days.set(date, d); } return d; };

  const hrvByDate = new Map<string, number[]>();
  for (const p of input.hrv) {
    const ms = Date.parse(p.time);
    if (!Number.isFinite(ms)) continue;
    const date = wakeDate(ms, tz);
    (hrvByDate.get(date) ?? hrvByDate.set(date, []).get(date)!).push(p.value);
  }
  for (const [date, values] of hrvByDate) {
    const d = day(date);
    d.hrv_ms = round(values.reduce((a, b) => a + b, 0) / values.length);
    d.hrv_samples = values.length;
  }

  // Several readiness events can exist for one day (updates); the newest one wins.
  const newest = new Map<string, number>();
  for (const raw of input.readiness) {
    const item = objectValue(raw); if (!item) continue;
    const value = parsedObject(item.value) ?? item;
    const dayMs = parseTimestampMs(value.timestamp) ?? parseTimestampMs(item.timestamp);
    if (dayMs === undefined) continue;
    const date = wakeDate(dayMs, tz);
    const stamp = parseTimestampMs(value.timestampUpdate) ?? parseTimestampMs(item.timestamp) ?? 0;
    if ((newest.get(date) ?? -1) >= stamp) continue;
    newest.set(date, stamp);
    const d = day(date);
    d.readiness = within(firstValue(value, ["rdnsScore", "readiness"]), 0, 100);
    d.sleep_hrv = within(value.sleepHRV, 1, 400);
    d.sleep_rhr = within(value.sleepRHR, 25, 200);
    d.hrv_score = within(value.hrvScore, 0, 100);
    d.rhr_score = within(value.rhrScore, 0, 100);
    d.hrv_baseline = within(value.hrvBaseline, 1, 400);
    d.rhr_baseline = within(value.rhrBaseline, 25, 200);
  }

  const odiNewest = new Map<string, number>();
  for (const raw of input.odi) {
    const item = objectValue(raw); if (!item) continue;
    const ms = parseTimestampMs(item.timestamp); if (ms === undefined) continue;
    const odi = within(item.odi, 0, 100);
    if (odi === null) continue; // valid = -1 / score only: nothing readable
    const date = wakeDate(ms, tz);
    if ((odiNewest.get(date) ?? -1) >= ms) continue;
    odiNewest.set(date, ms);
    const d = day(date);
    d.odi = round(odi, 2);
    d.odi_events = within(item.odiNum, 0, 10_000);
  }

  const dips = new Map<string, { n: number; low: number | null; seen: Set<number> }>();
  for (const raw of input.osa) {
    const item = objectValue(raw); if (!item) continue;
    const ms = parseTimestampMs(item.timestamp); if (ms === undefined) continue;
    const date = wakeDate(ms, tz);
    const entry = dips.get(date) ?? dips.set(date, { n: 0, low: null, seen: new Set() }).get(date)!;
    if (entry.seen.has(ms)) continue; // the same event can arrive on two pages
    entry.seen.add(ms); entry.n++;
    const low = within((parsedObject(item.extra) ?? item).spo2_decrease, 50, 100);
    if (low !== null && (entry.low === null || low < entry.low)) entry.low = low;
  }
  for (const [date, v] of dips) { const d = day(date); d.spo2_dips = v.n; d.spo2_low = v.low; }

  return [...days.values()].filter(d => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetches the four streams for one sync window (read-only GETs, one after the other with `pause` in between).
 * The window is widened by one day at the start so readings taken the evening before the first wake-up date are included.
 */
export async function fetchRecoveryDays(ctx: ServiceContext, range: DateRange, pause: () => Promise<void> = async () => {}): Promise<RecoveryDay[]> {
  const tz = range.timezone;
  const wide = parseDateRange(addIsoDays(range.startDate, -1), range.endDate, tz);
  const items = (r: { raw: { items: unknown[] } }) => r.raw.items;
  await pause(); const hrv = await fetchReviewedMetric(ctx, "hrv", wide);
  await pause(); const readiness = await fetchReviewedMetric(ctx, "readiness", wide);
  await pause(); const odi = await fetchReviewedMetric(ctx, "nightly_odi", wide);
  await pause(); const osa = await fetchReviewedMetric(ctx, "nightly_osa", wide);
  if (![hrv, readiness, odi, osa].every(r => Array.isArray(r.raw.items))) throw new ZeppError("unrecognized_payload", "Unrecognized recovery payload");
  return buildRecoveryDays({
    hrv: hrv.points.map(p => ({ time: p.time, value: p.value })), readiness: items(readiness), odi: items(odi), osa: items(osa)
  }, tz, range.startDate, range.endDate);
}
