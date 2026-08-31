import { withZeppCache } from "../cache";
import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import type { DateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, requireRecognizedItems, sourceScope } from "./normalize";
import type { HeartRateDay, SourceScope } from "./types";

interface DayAccumulator {
  date: string;
  values: number[];
  scopes: SourceScope[];
}

function mergedScope(scopes: SourceScope[]): SourceScope {
  const unique = new Set(scopes);
  if (unique.size === 1) return scopes[0] ?? "unknown";
  if (unique.has("user_fused")) return "user_fused";
  if (unique.has("device")) return "device";
  return "unknown";
}

export function normalizeHeartRate(raw: unknown, timezone: string): HeartRateDay[] {
  const items = requireRecognizedItems(raw, "heart_rate");
  const byDate = new Map<string, DayAccumulator>();

  for (const item of items) {
    const object = objectValue(item);
    if (!object) continue;
    const timestamp = parseTimestampMs(firstValue(object, ["timestamp", "time", "timeStamp", "startTime"]));
    if (timestamp === undefined) continue;
    const date = localDateFromMs(timestamp, timezone);
    const accumulator = byDate.get(date) ?? { date, values: [], scopes: [] };
    accumulator.scopes.push(sourceScope(object));
    const value = numericValue(firstValue(object, ["value", "heartRate", "heart_rate", "hr"]));
    if (value !== undefined && value >= 0 && value <= 300) accumulator.values.push(value);
    byDate.set(date, accumulator);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ date, values, scopes }) => {
    const result: HeartRateDay = {
      date,
      sample_count: values.length,
      source_scope: mergedScope(scopes)
    };
    if (values.length) {
      result.min_bpm = Math.min(...values);
      result.max_bpm = Math.max(...values);
      result.avg_bpm = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    }
    return result;
  });
}

export async function getHeartRate(ctx: ServiceContext, range: DateRange): Promise<Envelope<HeartRateDay[]>> {
  const today = localDateFromMs(Date.now(), range.timezone);
  const ttl = range.startDate <= today && today <= range.endDate ? 120 : 300;
  const days = await withZeppCache(
    "heart-rate",
    { userId: ctx.config.ZEPP_USER_ID, startTime: range.fromSec, endTime: range.toSec },
    ttl,
    async () => {
      const raw = await ctx.zepp.get(buildZeppRequest("heartRate", {
        userId: ctx.config.ZEPP_USER_ID,
        startTime: range.fromSec,
        endTime: range.toSec,
        limit: 1000,
        type: 2
      }));
      return normalizeHeartRate(raw, range.timezone);
    }
  );
  return days.length ? ok(days, range.timezone) : noData(range.timezone);
}
