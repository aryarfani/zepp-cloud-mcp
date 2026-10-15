import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { noData, ok, partialResult, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import type { DateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, topLevelKeys } from "./normalize";
import { scrubIdentity } from "./scrub";
import type { SourceScope } from "./types";

export interface WeightRecord {
  measured_at: string;
  date: string;
  weight_kg: number;
  height_cm?: number;
  bmi?: number;
  /** Zepp's `bodyStyle` code as reported (meaning not documented). Omitted when absent. */
  body_style?: number;
  source_scope: SourceScope;
}

export interface WeightEntry { record: WeightRecord; raw: unknown }

const WEIGHT_LIMIT = 300;
/** One request covers the whole range (up to 366 days); Zepp returns at most WEIGHT_LIMIT records per request. */

function inRange(value: unknown, min: number, max: number): number | undefined {
  const n = numericValue(value);
  return n !== undefined && n >= min && n <= max ? n : undefined;
}

/**
 * /users/{id}/members/-1/weightRecords -> { items: [{ generatedTime (s), summary: { weight (kg), height (cm), bmi, bodyStyle, ... } }] }.
 * Verified live fields: weight, height, bmi, bodyStyle. Other body-composition readings (fat, water, muscle, ...) have not been
 * observed in this account, so no field names are guessed; the scrubbed record stays available as raw JSON in the store.
 */
export function normalizeWeightRecords(raw: unknown, timezone: string): { entries: WeightEntry[]; skipped: number } {
  const root = objectValue(raw);
  const items = Array.isArray(raw) ? raw : root && Array.isArray(root.items) ? root.items : undefined;
  if (!items) throw new ZeppError("unrecognized_payload", "Weight response must contain an items array", undefined, undefined, { topLevelKeys: topLevelKeys(raw) });
  const entries: WeightEntry[] = [];
  let skipped = 0;
  for (const item of items) {
    const object = objectValue(item);
    const summary = object ? objectValue(object.summary) : undefined;
    const timeMs = object ? parseTimestampMs(firstValue(object, ["generatedTime", "createTime", "timestamp"])) : undefined;
    const weight = summary ? inRange(summary.weight, 2, 500) : undefined;
    if (!object || !summary || timeMs === undefined || weight === undefined) { skipped++; continue; }
    const record: WeightRecord = {
      measured_at: new Date(timeMs).toISOString(),
      date: localDateFromMs(timeMs, timezone),
      weight_kg: weight,
      source_scope: "unknown"
    };
    const height = inRange(summary.height, 50, 260);
    const bmi = inRange(summary.bmi, 5, 80);
    const bodyStyle = numericValue(summary.bodyStyle);
    if (height !== undefined) record.height_cm = height;
    if (bmi !== undefined) record.bmi = Math.round(bmi * 10) / 10;
    if (bodyStyle !== undefined && Number.isInteger(bodyStyle)) record.body_style = bodyStyle;
    entries.push({ record, raw: scrubIdentity(object) });
  }
  entries.sort((a, b) => a.record.measured_at.localeCompare(b.record.measured_at));
  return { entries, skipped };
}

/** Uncached fetch for a time window (seconds); used by the sync. */
export async function fetchWeightEntries(ctx: ServiceContext, fromSec: number, toSec: number): Promise<{ entries: WeightEntry[]; skipped: number }> {
  const raw = await ctx.zepp.get(buildZeppRequest("weightRecords", { userId: ctx.config.ZEPP_USER_ID, fromTime: fromSec, toTime: toSec, limit: WEIGHT_LIMIT, isForward: 0 }));
  const normalized = normalizeWeightRecords(raw, ctx.config.USER_TIMEZONE);
  return { entries: normalized.entries.filter(e => Date.parse(e.record.measured_at) >= fromSec * 1000 && Date.parse(e.record.measured_at) <= toSec * 1000), skipped: normalized.skipped };
}

export async function getWeight(ctx: ServiceContext, range: DateRange): Promise<Envelope<WeightRecord[]>> {
  const key = { userId: ctx.config.ZEPP_USER_ID, from: range.fromSec, to: range.toSec };
  const result = await withZeppCache("weight", key, 300, async () => {
    const { entries, skipped } = await fetchWeightEntries(ctx, range.fromSec, range.toSec);
    return { records: entries.map(e => e.record), skipped };
  });
  const warnings = result.skipped ? [`Skipped ${result.skipped} weight record(s) without a plausible weight or time.`] : [];
  if (result.records.length >= WEIGHT_LIMIT) {
    return partialResult(result.records, range.timezone, [...warnings, `Zepp returns at most ${WEIGHT_LIMIT} weigh-ins per request and that limit was reached; use a shorter range to see the rest.`]);
  }
  return result.records.length ? ok(result.records, range.timezone, { warnings }) : noData(range.timezone, warnings);
}