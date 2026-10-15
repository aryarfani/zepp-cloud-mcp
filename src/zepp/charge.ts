import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { parseDateRange, splitDateRange, type DateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, topLevelKeys } from "./normalize";
import { scrubIdentity } from "./scrub";
import { downsampleStable, type DownsampleMeta } from "./workout-detail";
import { WINDOW_DAYS } from "./windows";

/**
 * Hybrid Charge (the watch's body-battery-like "Charge" score), from /v2/users/me/events eventType=Charge.
 * Verified live for this account:
 *  - real_data: one event per UTC day, value.startTime (ms) + value.samples[] of { s (ms offset), total, mental, physical, status },
 *    one sample per minute. (The earlier Python port treated `s` as minutes; live data shows milliseconds.)
 *  - insight_data: value.samples[] of { s, u, type, insight, insightId, diff, slope, thres, trackId, jsonExtra }. The meaning of
 *    these numbers is not documented, so they are passed through unchanged and not interpreted.
 *  - stress_data: samples carry an opaque base64 `stressInfo` blob (undecoded here; see list_event_types).
 */
export interface ChargeSample { ts_ms: number; date: string; total: number; mental: number | null; physical: number | null; status: number | null }
export interface ChargeInsight { ts_ms: number; date: string; insight_type: number | null; insight: number | null; insight_id: number | null; raw: Record<string, unknown> }

export interface ChargeDay {
  date: string;
  sample_count: number;
  first_at: string;
  last_at: string;
  total: { first: number; last: number; min: number; max: number; avg: number };
  mental_avg: number | null;
  physical_avg: number | null;
}

export interface ChargeResult {
  days: ChargeDay[];
  insights: Array<{ at: string; type: number | null; insight: number | null; insight_id: number | null }>;
  samples?: Array<{ time: string; total: number; mental: number | null; physical: number | null; status: number | null }>;
  samples_meta?: DownsampleMeta;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const DAY_MS = 86_400_000;

function eventItems(raw: unknown): Record<string, unknown>[] {
  const root = objectValue(raw);
  if (!root || !Array.isArray(root.items)) {
    throw new ZeppError("unrecognized_payload", "Zepp event envelope must contain an items array", undefined, undefined, { topLevelKeys: topLevelKeys(raw) });
  }
  return root.items.flatMap(item => { const o = objectValue(item); return o ? [o] : []; });
}

function plausible(value: unknown, min: number, max: number): number | null {
  const n = numericValue(value);
  return n !== undefined && n >= min && n <= max ? n : null;
}

function* sampleRows(items: Record<string, unknown>[]): Generator<{ tsMs: number; sample: Record<string, unknown> }> {
  for (const item of items) {
    const value = objectValue(item.value);
    if (!value || !Array.isArray(value.samples)) continue;
    const base = parseTimestampMs(firstValue(value, ["startTime", "start_time"])) ?? parseTimestampMs(item.timestamp);
    if (base === undefined) continue;
    for (const rawSample of value.samples) {
      const sample = objectValue(rawSample);
      const offset = sample ? numericValue(sample.s) : undefined;
      if (!sample || offset === undefined || offset < 0) continue;
      yield { tsMs: base + offset, sample };
    }
  }
}

export function normalizeChargeSamples(raw: unknown, range: { fromMs: number; toMs: number } | null, timezone: string): ChargeSample[] {
  const output = new Map<number, ChargeSample>();
  for (const { tsMs, sample } of sampleRows(eventItems(raw))) {
    if (range && (tsMs < range.fromMs || tsMs > range.toMs)) continue;
    const total = plausible(sample.total, 0, 100);
    if (total === null) continue;
    const status = numericValue(sample.status);
    output.set(tsMs, {
      ts_ms: tsMs, date: localDateFromMs(tsMs, timezone), total,
      mental: plausible(sample.mental, 0, 100), physical: plausible(sample.physical, 0, 100),
      status: status !== undefined && Number.isInteger(status) ? status : null
    });
  }
  return [...output.values()].sort((a, b) => a.ts_ms - b.ts_ms);
}

export function normalizeChargeInsights(raw: unknown, range: { fromMs: number; toMs: number } | null, timezone: string): ChargeInsight[] {
  const output = new Map<number, ChargeInsight>();
  for (const { tsMs, sample } of sampleRows(eventItems(raw))) {
    if (range && (tsMs < range.fromMs || tsMs > range.toMs)) continue;
    const type = numericValue(sample.type);
    const insight = numericValue(sample.insight);
    const id = numericValue(sample.insightId);
    output.set(tsMs, {
      ts_ms: tsMs, date: localDateFromMs(tsMs, timezone),
      insight_type: type !== undefined && Number.isInteger(type) ? type : null,
      insight: insight ?? null,
      insight_id: id !== undefined && Number.isInteger(id) ? id : null,
      raw: scrubIdentity(sample) as Record<string, unknown>
    });
  }
  return [...output.values()].sort((a, b) => a.ts_ms - b.ts_ms);
}

// An event is stamped at the start of its (UTC) day but its samples run past local midnight, so look one day back
// and filter the samples to the requested range afterwards.
function chargeRequest(subType: "real_data" | "insight_data", range: DateRange) {
  return buildZeppRequest("v2Events", { eventType: "Charge", subType, from: range.fromMs - DAY_MS, to: range.toMs, limit: 2000, reverse: 0 });
}

/** Uncached (large responses: ~150 KB per day). Used by the sync and the tool. */
export async function fetchChargeSamples(ctx: ServiceContext, range: DateRange): Promise<ChargeSample[]> {
  return normalizeChargeSamples(await ctx.zepp.get(chargeRequest("real_data", range)), range, ctx.config.USER_TIMEZONE);
}

export async function fetchChargeInsights(ctx: ServiceContext, range: DateRange): Promise<ChargeInsight[]> {
  return normalizeChargeInsights(await ctx.zepp.get(chargeRequest("insight_data", range)), range, ctx.config.USER_TIMEZONE);
}

export function summarizeChargeDays(samples: readonly ChargeSample[]): ChargeDay[] {
  const byDate = new Map<string, ChargeSample[]>();
  for (const s of samples) (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push(s);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => {
    const totals = list.map(s => s.total);
    const avg = (values: Array<number | null>) => {
      const v = values.filter((x): x is number => x !== null);
      return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    return {
      date, sample_count: list.length,
      first_at: new Date(list[0]!.ts_ms).toISOString(), last_at: new Date(list.at(-1)!.ts_ms).toISOString(),
      total: { first: list[0]!.total, last: list.at(-1)!.total, min: Math.min(...totals), max: Math.max(...totals), avg: round1(totals.reduce((a, b) => a + b, 0) / totals.length) },
      mental_avg: avg(list.map(s => s.mental)), physical_avg: avg(list.map(s => s.physical))
    };
  });
}

export interface ChargeOptions { includeSamples?: boolean; maxPoints?: number; pause?: () => Promise<void> }

/**
 * Long ranges are fetched in WINDOW_DAYS.charge windows (about 150 KB of samples per day) and reduced to per-day
 * summaries window by window, so memory and response size stay bounded; samples, when requested, are downsampled per
 * window and again over the merged set.
 */
export async function getHybridCharge(ctx: ServiceContext, range: DateRange, options: ChargeOptions = {}): Promise<Envelope<ChargeResult>> {
  const includeSamples = options.includeSamples === true;
  const maxPoints = Math.max(2, Math.min(2000, Math.floor(options.maxPoints ?? 288)));
  const pause = options.pause ?? (async () => {});
  const key = { userId: ctx.config.ZEPP_USER_ID, from: range.fromSec, to: range.toSec, includeSamples, maxPoints };
  const result = await withZeppCache("hybrid-charge", key, 300, async (): Promise<ChargeResult> => {
    const days: ChargeDay[] = [];
    const insights: ChargeInsight[] = [];
    const kept: ChargeSample[] = [];
    let originalCount = 0;
    const windows = splitDateRange(range.startDate, range.endDate, WINDOW_DAYS.charge);
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]!;
      const sub = windows.length === 1 ? range : parseDateRange(w.startDate, w.endDate, range.timezone, WINDOW_DAYS.charge);
      if (i > 0) await pause();
      const samples = await fetchChargeSamples(ctx, sub);
      await pause();
      insights.push(...await fetchChargeInsights(ctx, sub));
      days.push(...summarizeChargeDays(samples));
      if (includeSamples) { originalCount += samples.length; kept.push(...downsampleStable(samples, maxPoints).points); }
    }
    // Windows never overlap, so duplicates are not expected; keying by day / insight keeps a repeated row harmless.
    const uniqueDays = [...new Map(days.map(d => [d.date, d] as const)).values()].sort((a, b) => a.date.localeCompare(b.date));
    const uniqueInsights = [...new Map(insights.map(i => [`${i.ts_ms}|${i.insight_type}|${i.insight_id}`, i] as const)).values()].sort((a, b) => a.ts_ms - b.ts_ms);
    const output: ChargeResult = {
      days: uniqueDays,
      insights: uniqueInsights.map(i => ({ at: new Date(i.ts_ms).toISOString(), type: i.insight_type, insight: i.insight, insight_id: i.insight_id }))
    };
    if (includeSamples) {
      const sampled = downsampleStable(kept, maxPoints);
      output.samples = sampled.points.map(s => ({ time: new Date(s.ts_ms).toISOString(), total: s.total, mental: s.mental, physical: s.physical, status: s.status }));
      output.samples_meta = { original_count: originalCount, returned_count: sampled.points.length, downsampled: originalCount > sampled.points.length };
    }
    return output;
  });
  return result.days.length || result.insights.length ? ok(result, range.timezone) : noData(range.timezone);
}