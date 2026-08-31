import { withZeppCache } from "../cache";
import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { parseDateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { firstValue, localDateFromMs, numericValue, objectValue, parseTimestampMs, requireRecognizedItems, sourceScope } from "./normalize";
import type { DailySummary, SleepNight, SleepStageSegment } from "./types";

export interface BandNormalizedData {
  daily: DailySummary[];
  sleep: SleepNight[];
  diagnostics: string[];
}

function decodeBase64Json(encoded: string): Record<string, unknown> | undefined {
  try {
    const binary = atob(encoded.trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return objectValue(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return undefined;
  }
}

function validNonNegative(value: unknown): number | undefined {
  const number = numericValue(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function dateMidnightUtcMs(date: string, offsetSeconds: number): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp - offsetSeconds * 1000 : undefined;
}

function stageName(mode: number): SleepStageSegment["stage"] {
  if (mode === 5) return "deep";
  if (mode === 4) return "light";
  if (mode === 8 || mode === 11) return "rem";
  if (mode === 7) return "awake";
  return "unknown";
}

function stageMinutes(sleep: Record<string, unknown>, mode: number): number {
  const stages = Array.isArray(sleep.stage) ? sleep.stage : [];
  return stages.reduce((sum, rawStage) => {
    const stage = objectValue(rawStage);
    if (!stage || Math.round(numericValue(stage.mode) ?? NaN) !== mode) return sum;
    const start = numericValue(stage.start);
    const stop = numericValue(stage.stop);
    return start !== undefined && stop !== undefined && stop >= start ? sum + stop - start + 1 : sum;
  }, 0);
}

function stagesFromBand(
  item: Record<string, unknown>,
  summary: Record<string, unknown>,
  sleep: Record<string, unknown>,
  sessionStartMs: number,
  sessionEndMs: number
): SleepStageSegment[] {
  const date = String(firstValue(item, ["date_time", "date", "dayId"]) ?? "");
  const offset = Math.max(-18 * 3600, Math.min(18 * 3600, Math.round(numericValue(summary.tz) ?? 0)));
  const midnight = dateMidnightUtcMs(date, offset);
  const rawStages = Array.isArray(sleep.stage) ? sleep.stage : [];
  if (midnight === undefined || !rawStages.length) return [];

  const build = (anchor: number): SleepStageSegment[] => rawStages.flatMap(rawStage => {
    const stage = objectValue(rawStage);
    if (!stage) return [];
    const mode = numericValue(stage.mode);
    const start = numericValue(stage.start);
    const stop = numericValue(stage.stop);
    if (mode === undefined || start === undefined || stop === undefined || stop < start) return [];
    const from = anchor + Math.round(start) * 60_000;
    const to = anchor + (Math.round(stop) + 1) * 60_000;
    if (to <= from) return [];
    return [{ start: new Date(from).toISOString(), end: new Date(to).toISOString(), stage: stageName(Math.round(mode)) }];
  });

  const previousDay = build(midnight - 86_400_000);
  const sameDay = build(midnight);
  const overlap = (segments: SleepStageSegment[]) => segments.reduce((sum, segment) => {
    const from = Math.max(Date.parse(segment.start), sessionStartMs);
    const to = Math.min(Date.parse(segment.end), sessionEndMs);
    return sum + Math.max(0, to - from);
  }, 0);
  return overlap(sameDay) > overlap(previousDay) ? sameDay : previousDay;
}

function sleepFromBand(
  item: Record<string, unknown>,
  summary: Record<string, unknown>,
  sleep: Record<string, unknown>,
  timezone: string
): SleepNight | undefined {
  const startMs = parseTimestampMs(firstValue(sleep, ["st", "startTime", "start_time"]));
  const endMs = parseTimestampMs(firstValue(sleep, ["ed", "endTime", "end_time"]));
  if (startMs === undefined || endMs === undefined || endMs <= startMs) return undefined;
  const awakeExplicit = numericValue(firstValue(sleep, ["wk", "awakeMinutes"]));
  const awakeMinutes = awakeExplicit !== undefined && awakeExplicit >= 0 ? awakeExplicit : stageMinutes(sleep, 7);
  const scoreCandidate = numericValue(firstValue(sleep, ["ss", "score", "sleepScore"]));
  const result: SleepNight = {
    sleep_date: localDateFromMs(startMs, timezone),
    started_at: new Date(startMs).toISOString(),
    ended_at: new Date(endMs).toISOString(),
    duration_s: Math.max(0, Math.round((endMs - startMs) / 1000 - awakeMinutes * 60)),
    stages: stagesFromBand(item, summary, sleep, startMs, endMs),
    source_scope: sourceScope(item)
  };
  if (scoreCandidate !== undefined && scoreCandidate >= 0 && scoreCandidate <= 100) result.score = scoreCandidate;
  return result;
}

export function normalizeBandData(raw: unknown, timezone = "Asia/Jakarta"): BandNormalizedData {
  const items = requireRecognizedItems(raw, "band_data");
  const daily: DailySummary[] = [];
  const sleep: SleepNight[] = [];
  const diagnostics: string[] = [];

  for (const [index, rawItem] of items.entries()) {
    const item = objectValue(rawItem);
    if (!item) {
      diagnostics.push(`item ${index}: not an object`);
      continue;
    }
    const encoded = typeof item.summary === "string" ? item.summary : undefined;
    if (!encoded) {
      diagnostics.push(`item ${index}: summary missing`);
      continue;
    }
    const summary = decodeBase64Json(encoded);
    if (!summary) {
      diagnostics.push(`item ${index}: summary decode failed`);
      continue;
    }
    const date = String(firstValue(item, ["date_time", "date", "dayId"]) ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const day: DailySummary = { date };
      const slp = objectValue(summary.slp);
      const stp = objectValue(summary.stp);
      const rhr = slp ? numericValue(slp.rhr) : undefined;
      if (rhr !== undefined && rhr >= 20 && rhr <= 250) day.resting_hr_bpm = rhr;
      if (stp) {
        const steps = validNonNegative(stp.ttl);
        const calories = validNonNegative(stp.cal);
        const distance = validNonNegative(stp.dis);
        if (steps !== undefined) day.steps = steps;
        if (calories !== undefined) day.active_calories_kcal = calories;
        if (distance !== undefined) day.distance_m = distance;
      }
      daily.push(day);
    }
    const slp = objectValue(summary.slp);
    if (slp) {
      const session = sleepFromBand(item, summary, slp, timezone);
      if (session) sleep.push(session);
      else diagnostics.push(`item ${index}: sleep session invalid`);
    }
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  sleep.sort((a, b) => a.started_at.localeCompare(b.started_at));
  return { daily, sleep, diagnostics };
}

function todayInTimezone(timezone: string): string {
  return localDateFromMs(Date.now(), timezone);
}

export async function fetchBandData(
  ctx: ServiceContext,
  fromDate: string,
  toDate: string,
  timezone: string,
  namespace: string
): Promise<BandNormalizedData> {
  const includesToday = fromDate <= todayInTimezone(timezone) && todayInTimezone(timezone) <= toDate;
  return withZeppCache(
    namespace,
    { userId: ctx.config.ZEPP_USER_ID, fromDate, toDate },
    includesToday ? 120 : 300,
    async () => {
      const raw = await ctx.zepp.get(buildZeppRequest("bandData", {
        userid: ctx.config.ZEPP_USER_ID,
        from_date: fromDate,
        to_date: toDate,
        query_type: "detail",
        byteLength: 8,
        device_type: 0
      }));
      return normalizeBandData(raw, timezone);
    }
  );
}

export async function getDailySummary(ctx: ServiceContext, date: string): Promise<Envelope<DailySummary>> {
  const range = parseDateRange(date, date, ctx.config.USER_TIMEZONE);
  const normalized = await fetchBandData(ctx, date, date, range.timezone, "daily-summary");
  const day = normalized.daily.find(item => item.date === date);
  return day ? ok(day, range.timezone, { warnings: normalized.diagnostics }) : noData(range.timezone, normalized.diagnostics);
}
