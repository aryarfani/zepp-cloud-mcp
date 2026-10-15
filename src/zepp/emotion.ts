import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { noData, ok, partialResult, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import type { DateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, topLevelKeys } from "./normalize";
import { scalarFields, scrubIdentity } from "./scrub";

/**
 * Emotion / spot-stress events.
 *  - `spot_stress`: /users/{id}/events eventType=single_stress. Verified live: { timestamp (ms), value: "44" } (a single stress score, 0-100).
 *  - `emotion`: /v2/users/me/events Emotion/real_data. This account has no Emotion events (empty list), so the layout is NOT
 *    verified; it is read tolerantly (samples with an `s` offset, or one value per item) and unreadable items are skipped and counted.
 */
export interface EmotionEvent {
  at: string;
  date: string;
  source: "spot_stress" | "emotion";
  value: number | null;
  details?: Record<string, string | number | boolean>;
}

export interface EmotionEntry { event: EmotionEvent; ts_ms: number; raw: unknown }

const VALUE_KEYS = ["value", "emotion", "emotionType", "level", "score", "stress"] as const;

function itemsOf(raw: unknown): unknown[] {
  const root = objectValue(raw);
  if (!root || !Array.isArray(root.items)) {
    throw new ZeppError("unrecognized_payload", "Zepp event envelope must contain an items array", undefined, undefined, { topLevelKeys: topLevelKeys(raw) });
  }
  return root.items;
}

export function normalizeSpotStress(raw: unknown, timezone: string): { entries: EmotionEntry[]; skipped: number } {
  const entries: EmotionEntry[] = [];
  let skipped = 0;
  for (const item of itemsOf(raw)) {
    const object = objectValue(item);
    const tsMs = object ? parseTimestampMs(object.timestamp) : undefined;
    const value = object ? numericValue(object.value) : undefined;
    if (!object || tsMs === undefined || value === undefined || value < 0 || value > 100) { skipped++; continue; }
    entries.push({ ts_ms: tsMs, raw: scrubIdentity(object), event: { at: new Date(tsMs).toISOString(), date: localDateFromMs(tsMs, timezone), source: "spot_stress", value } });
  }
  return { entries, skipped };
}

export function normalizeEmotion(raw: unknown, timezone: string): { entries: EmotionEntry[]; skipped: number } {
  const entries: EmotionEntry[] = [];
  let skipped = 0;
  for (const item of itemsOf(raw)) {
    const object = objectValue(item);
    const value = object ? objectValue(object.value) : undefined;
    if (!object) { skipped++; continue; }
    const samples = value && Array.isArray(value.samples) ? value.samples : undefined;
    const base = parseTimestampMs(value ? firstValue(value, ["startTime"]) : undefined) ?? parseTimestampMs(object.timestamp);
    if (samples) {
      for (const rawSample of samples) {
        const sample = objectValue(rawSample);
        const offset = sample ? numericValue(sample.s) ?? 0 : undefined;
        if (!sample || base === undefined || offset === undefined) { skipped++; continue; }
        const tsMs = base + offset;
        const v = numericValue(firstValue(sample, VALUE_KEYS));
        entries.push({ ts_ms: tsMs, raw: scrubIdentity(sample), event: { at: new Date(tsMs).toISOString(), date: localDateFromMs(tsMs, timezone), source: "emotion", value: v ?? null, details: scalarFields(sample, ["s", "u"]) } });
      }
      continue;
    }
    const tsMs = parseTimestampMs(object.timestamp);
    if (tsMs === undefined) { skipped++; continue; }
    const v = numericValue(firstValue(value ?? object, VALUE_KEYS));
    entries.push({ ts_ms: tsMs, raw: scrubIdentity(object), event: { at: new Date(tsMs).toISOString(), date: localDateFromMs(tsMs, timezone), source: "emotion", value: v ?? null, ...(value ? { details: scalarFields(value, ["startTime"]) } : {}) } });
  }
  return { entries, skipped };
}

/** Uncached; `pause` lets the sync space the two requests. */
/** Zepp page size used for both streams; a response this long may have been cut off. */
const EVENT_LIMIT = 2000;

export async function fetchEmotionEntries(ctx: ServiceContext, range: DateRange, pause: () => Promise<void> = async () => {}): Promise<{ entries: EmotionEntry[]; skipped: number; truncated: boolean }> {
  const tz = ctx.config.USER_TIMEZONE;
  await pause();
  const spotRaw = await ctx.zepp.get(buildZeppRequest("userEvents", {
    userId: ctx.config.ZEPP_USER_ID, eventType: "single_stress", from: range.fromMs, to: range.toMs, limit: EVENT_LIMIT, reverse: 0
  }));
  const spot = normalizeSpotStress(spotRaw, tz);
  await pause();
  const emotionRaw = await ctx.zepp.get(buildZeppRequest("v2Events", {
    eventType: "Emotion", subType: "real_data", from: range.fromMs, to: range.toMs, limit: EVENT_LIMIT, reverse: 0
  }));
  const emotion = normalizeEmotion(emotionRaw, tz);
  const count = (raw: unknown) => { const r = objectValue(raw); return r && Array.isArray(r.items) ? r.items.length : 0; };
  const entries = [...spot.entries, ...emotion.entries]
    .filter(e => e.ts_ms >= range.fromMs && e.ts_ms <= range.toMs)
    .sort((a, b) => a.ts_ms - b.ts_ms);
  return { entries, skipped: spot.skipped + emotion.skipped, truncated: count(spotRaw) >= EVENT_LIMIT || count(emotionRaw) >= EVENT_LIMIT };
}

export async function getEmotionEvents(ctx: ServiceContext, range: DateRange): Promise<Envelope<EmotionEvent[]>> {
  const key = { userId: ctx.config.ZEPP_USER_ID, from: range.fromSec, to: range.toSec };
  const result = await withZeppCache("emotion-events", key, 300, async () => {
    const { entries, skipped, truncated } = await fetchEmotionEntries(ctx, range);
    return { events: entries.map(e => e.event), skipped, truncated };
  });
  const warnings = result.skipped ? [`Skipped ${result.skipped} event(s) that could not be read.`] : [];
  if (result.truncated) {
    return partialResult(result.events, range.timezone, [...warnings, `Zepp returns at most ${EVENT_LIMIT} events per stream per request and that limit was reached; use a shorter range to see the rest.`]);
  }
  return result.events.length ? ok(result.events, range.timezone, { warnings }) : noData(range.timezone, warnings);
}