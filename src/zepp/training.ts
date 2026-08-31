import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { fromError, noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { parseDateRange, type DateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { fetchReviewedMetric, type NormalizedEventPoint } from "./events";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, requireRecognizedItems, sourceScope } from "./normalize";
import type { TrainingStatusDay } from "./types";

export type WatchMetric = "sport_load" | "vo2max";

function pointTime(item: Record<string, unknown>, timezone: string): number | undefined {
  const timestamp = parseTimestampMs(firstValue(item, ["timestamp", "time", "startTime"]));
  if (timestamp !== undefined) return timestamp;
  const date = firstValue(item, ["date", "dateString", "dayId", "recordDate"]);
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    try { return parseDateRange(date, date, timezone).fromMs; } catch { return undefined; }
  }
  return undefined;
}

export function normalizeWatchStatistic(raw: unknown, metric: WatchMetric, timezone: string): NormalizedEventPoint[] {
  const items = requireRecognizedItems(raw, `watch_${metric}`);
  return items.flatMap(rawItem => {
    const item = objectValue(rawItem);
    if (!item) return [];
    const nested = objectValue(item.value);
    const source = nested ?? item;
    const aliases = metric === "sport_load"
      ? ["value", "sportLoad", "trainingLoad", "wtlSum", "currnetDayTrainLoad"] as const
      : ["value", "vo2max", "vo2Max", "VO2_MAX", "VO2_max"] as const;
    const value = numericValue(firstValue(source, aliases));
    const time = pointTime(item, timezone);
    if (value === undefined || time === undefined || (metric === "sport_load" ? value < 0 : value <= 0)) return [];
    return [{
      metric,
      time: new Date(time).toISOString(),
      value,
      unit: metric === "sport_load" ? "load" : "ml/kg/min",
      source_scope: sourceScope(item)
    }];
  }).sort((a, b) => a.time.localeCompare(b.time));
}

function cacheTtl(range: DateRange): number {
  const today = localDateFromMs(Date.now(), range.timezone);
  return range.startDate <= today && today <= range.endDate ? 120 : 300;
}

async function fetchWatch(ctx: ServiceContext, statistic: "SPORT_LOAD" | "VO2_MAX", range: DateRange): Promise<NormalizedEventPoint[]> {
  const metric: WatchMetric = statistic === "SPORT_LOAD" ? "sport_load" : "vo2max";
  return withZeppCache(
    `watch:${statistic}`,
    { userId: ctx.config.ZEPP_USER_ID, startDay: range.startDate, endDay: range.endDate },
    cacheTtl(range),
    async () => {
      const raw = await ctx.zepp.get(buildZeppRequest("watchStatistic", {
        userId: ctx.config.ZEPP_USER_ID,
        statistic,
        startDay: range.startDate,
        endDay: range.endDate,
        limit: 1000,
        isReverse: false
      }));
      return normalizeWatchStatistic(raw, metric, range.timezone);
    }
  );
}

function partialEnvelope<T>(data: T, timezone: string, warnings: string[]): Envelope<T> {
  return { status: "partial", data, meta: { source: "zepp_cloud", fetched_at: new Date().toISOString(), timezone, partial: true, warnings } };
}

export async function getTrainingStatus(ctx: ServiceContext, range: DateRange): Promise<Envelope<TrainingStatusDay[]>> {
  const settled = await Promise.allSettled([
    fetchWatch(ctx, "SPORT_LOAD", range),
    fetchWatch(ctx, "VO2_MAX", range),
    fetchReviewedMetric(ctx, "lactate_threshold", range)
  ] as const);
  const authFailure = settled.find(result => result.status === "rejected" && result.reason instanceof ZeppError && result.reason.kind === "auth_expired");
  if (authFailure?.status === "rejected") return fromError(authFailure.reason, range.timezone);
  const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length === settled.length) return fromError(failures[0]!.reason, range.timezone);

  const points: NormalizedEventPoint[] = [];
  const sportLoad = settled[0]; if (sportLoad.status === "fulfilled") points.push(...sportLoad.value);
  const vo2 = settled[1]; if (vo2.status === "fulfilled") points.push(...vo2.value);
  const threshold = settled[2]; if (threshold.status === "fulfilled") points.push(...threshold.value.points);

  const byDate = new Map<string, TrainingStatusDay>();
  for (const item of points) {
    const date = localDateFromMs(Date.parse(item.time), range.timezone);
    const row = byDate.get(date) ?? { date };
    if (item.metric === "sport_load") row.sport_load = item.value;
    if (item.metric === "vo2max") row.vo2max_ml_kg_min = item.value;
    if (item.metric === "lactate_threshold_hr") row.lactate_threshold_hr_bpm = item.value;
    if (item.metric === "lactate_threshold_pace") row.lactate_threshold_pace_s_per_km = item.value;
    byDate.set(date, row);
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (failures.length) return partialEnvelope(rows, range.timezone, failures.map(failure => failure.reason instanceof Error ? failure.reason.message : "Zepp training stream failed"));
  return rows.length ? ok(rows, range.timezone) : noData(range.timezone);
}
