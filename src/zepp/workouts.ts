import { withZeppCache } from "../cache";
import { ZeppError } from "../errors";
import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import type { DateRange } from "../time";
import { buildZeppRequest } from "./endpoints";
import { firstValue, numericValue, objectValue, parseTimestampMs, sourceScope, topLevelKeys } from "./normalize";
import type { SourceScope } from "./types";

const TRACK_ID = /^\d{1,32}$/;
const SOURCE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_HISTORY_PAGES = 20;

export interface WorkoutSummary {
  workout_id: string;
  activity_type: string;
  zepp_type?: number;
  started_at: string;
  ended_at: string;
  duration_s: number;
  distance_m?: number;
  calories_kcal?: number;
  heart_rate?: { avg_bpm?: number; max_bpm?: number };
  training_load?: number;
  vo2max_ml_kg_min?: number;
  source_scope: SourceScope;
  detail_available: true;
}

export interface WorkoutDetail extends WorkoutSummary {
  available_detail: string[];
}

interface WorkoutKey { trackid: string; source: string }

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(text: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new ZeppError("unsupported", "Invalid workout id");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } catch {
    throw new ZeppError("unsupported", "Invalid workout id");
  }
}

export function encodeWorkoutId(trackid: string, source: string): string {
  if (!TRACK_ID.test(trackid) || !SOURCE.test(source)) throw new ZeppError("unsupported", "Invalid Zepp workout identity");
  return `zepp:${trackid}:${b64urlEncode(source)}`;
}

export function decodeWorkoutId(workoutId: string): WorkoutKey {
  const match = /^zepp:(\d{1,32}):([A-Za-z0-9_-]+)$/.exec(workoutId);
  if (!match) throw new ZeppError("unsupported", "Invalid workout id");
  const trackid = match[1]!;
  const source = b64urlDecode(match[2]!);
  if (!SOURCE.test(source)) throw new ZeppError("unsupported", "Invalid workout id source");
  return { trackid, source };
}

function numberIn(object: Record<string, unknown>, keys: readonly string[], min = -Infinity, max = Infinity): number | undefined {
  const value = numericValue(firstValue(object, keys));
  return value !== undefined && value >= min && value <= max ? value : undefined;
}

function textIn(object: Record<string, unknown>, keys: readonly string[]): string | undefined {
  const value = firstValue(object, keys);
  if (typeof value === "string" && value.trim()) return value.trim();
  const numeric = numericValue(value);
  return numeric !== undefined ? String(Math.round(numeric)) : undefined;
}

const SPORT_CODES: Readonly<Record<number, string>> = {
  1: "outdoor_running",
  6: "walking",
  9: "ride",
  52: "strength",
  92: "badminton",
  130: "cross_training"
};

function normalizeType(object: Record<string, unknown>): { activityType: string; zeppType?: number } {
  const codeValue = numberIn(object, ["type", "sport_mode", "sportType"], 0, 10000);
  const zeppType = codeValue === undefined ? undefined : Math.round(codeValue);
  if (zeppType !== undefined && SPORT_CODES[zeppType]) return { activityType: SPORT_CODES[zeppType]!, zeppType };
  const explicit = textIn(object, ["workout_type", "sport_title", "sportTitle", "sport_name", "sportName"]);
  if (explicit) {
    const activityType = explicit.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "unknown";
    return zeppType === undefined ? { activityType } : { activityType, zeppType };
  }
  const activityType = zeppType === undefined ? "unknown" : `unknown:${zeppType}`;
  return zeppType === undefined ? { activityType } : { activityType, zeppType };
}

function historyItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const root = objectValue(raw);
  if (!root) throw new ZeppError("unrecognized_payload", "Workout history response was not an object");
  const data = objectValue(root.data);
  for (const container of [root, data].filter(Boolean) as Record<string, unknown>[]) {
    for (const key of ["summary", "items", "records", "results", "list"] as const) {
      if (Array.isArray(container[key])) return container[key] as unknown[];
    }
  }
  if (root.data && Array.isArray(root.data)) return root.data;
  if (Object.keys(root).length === 0 || (data && Object.keys(data).length === 0)) return [];
  throw new ZeppError("unrecognized_payload", "Workout history response shape was not recognized", undefined, undefined, { topLevelKeys: topLevelKeys(raw) });
}

function nextCursor(raw: unknown): string | undefined {
  const root = objectValue(raw);
  const data = root ? objectValue(root.data) : undefined;
  const value = data?.next ?? root?.next;
  if (typeof value === "string" && TRACK_ID.test(value)) return value;
  const numeric = numericValue(value);
  return numeric !== undefined && numeric > 0 ? String(Math.round(numeric)) : undefined;
}

export function normalizeWorkoutSummary(raw: unknown, _timezone: string): WorkoutSummary | undefined {
  const object = objectValue(raw);
  if (!object) return undefined;
  const trackid = textIn(object, ["trackid", "trackId", "workout_id", "workoutId", "id"]);
  const source = textIn(object, ["source"]);
  if (!trackid || !source || !TRACK_ID.test(trackid) || !SOURCE.test(source)) return undefined;
  const startMs = parseTimestampMs(firstValue(object, ["start_time", "startTime", "beginTime", "trackid"]));
  if (startMs === undefined) return undefined;
  const durationS = numberIn(object, ["duration", "duration_s", "durationSeconds", "runTime", "time"], 0, 7 * 86400);
  let endMs = parseTimestampMs(firstValue(object, ["end_time", "endTime", "finishTime"]));
  if (endMs === undefined && durationS !== undefined) endMs = startMs + durationS * 1000;
  if (endMs === undefined || endMs <= startMs) return undefined;
  const { activityType, zeppType } = normalizeType(object);
  const result: WorkoutSummary = {
    workout_id: encodeWorkoutId(trackid, source),
    activity_type: activityType,
    started_at: new Date(startMs).toISOString(),
    ended_at: new Date(endMs).toISOString(),
    duration_s: Math.round((endMs - startMs) / 1000),
    source_scope: sourceScope(object),
    detail_available: true
  };
  if (zeppType !== undefined) result.zepp_type = zeppType;
  const distance = numberIn(object, ["distance_meters", "distanceMeters", "distance", "dis"], 0, 1_000_000);
  const calories = numberIn(object, ["calories", "calorie", "cal"], 0, 100_000);
  const avgHr = numberIn(object, ["avg_hr", "avgHr", "averageHeartRate", "avg_heart_rate", "avgHeartRate"], 20, 250);
  const maxHr = numberIn(object, ["max_hr", "maxHr", "maximumHeartRate", "max_heart_rate", "maxHeartRate"], 20, 260);
  const load = numberIn(object, ["training_load", "trainingLoad", "trainLoad", "exercise_load"], 0, 10_000);
  const vo2max = numberIn(object, ["vo2max", "vo2Max", "VO2_MAX", "VO2_max"], 1, 100);
  if (distance !== undefined) result.distance_m = distance;
  if (calories !== undefined) result.calories_kcal = calories;
  if (avgHr !== undefined || maxHr !== undefined) result.heart_rate = { ...(avgHr !== undefined ? { avg_bpm: avgHr } : {}), ...(maxHr !== undefined ? { max_bpm: maxHr } : {}) };
  if (load !== undefined) result.training_load = load;
  if (vo2max !== undefined) result.vo2max_ml_kg_min = vo2max;
  return result;
}

function timestampInRange(summary: WorkoutSummary, range: DateRange): boolean {
  const timestamp = Date.parse(summary.started_at);
  return timestamp >= range.fromMs && timestamp <= range.toMs;
}

export async function listWorkouts(ctx: ServiceContext, range: DateRange, activityType?: string, limit = 50): Promise<Envelope<WorkoutSummary[]>> {
  const wanted = activityType?.trim().toLowerCase();
  const cappedLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const cacheKey = { userId: ctx.config.ZEPP_USER_ID, from: range.fromSec, to: range.toSec, activityType: wanted ?? null, limit: cappedLimit };
  const workouts = await withZeppCache("workout-history", cacheKey, 300, async () => {
    const output: WorkoutSummary[] = [];
    const seen = new Set<string>();
    let startTrackId = range.fromSec;
    let stopTrackId = range.toSec;
    for (let page = 0; page < MAX_HISTORY_PAGES && output.length < cappedLimit; page++) {
      const raw = await ctx.zepp.get(buildZeppRequest("sportHistory", { userid: ctx.config.ZEPP_USER_ID, startTrackId, stopTrackId, need_sub_data: 1, type: 0 }));
      for (const item of historyItems(raw)) {
        const summary = normalizeWorkoutSummary(item, range.timezone);
        if (!summary || seen.has(summary.workout_id) || !timestampInRange(summary, range)) continue;
        if (wanted && summary.activity_type !== wanted) continue;
        seen.add(summary.workout_id);
        output.push(summary);
        if (output.length >= cappedLimit) break;
      }
      const next = nextCursor(raw);
      if (!next || Number(next) <= 0 || Number(next) === stopTrackId) break;
      stopTrackId = Number(next);
    }
    return output.sort((a, b) => b.started_at.localeCompare(a.started_at));
  });
  return workouts.length ? ok(workouts, range.timezone) : noData(range.timezone);
}

export function recognizableWorkoutDetail(raw: unknown): Record<string, unknown> {
  const root = objectValue(raw);
  const data = root ? objectValue(root.data) : undefined;
  const detail = data ?? root;
  if (!detail || (!detail.trackid && !detail.time && !detail.heart_rate && !detail.longitude_latitude)) {
    throw new ZeppError("unrecognized_payload", "Workout detail response shape was not recognized", undefined, undefined, { topLevelKeys: topLevelKeys(raw) });
  }
  return detail;
}

export async function fetchWorkoutRaw(ctx: ServiceContext, workoutId: string): Promise<Record<string, unknown>> {
  const { trackid, source } = decodeWorkoutId(workoutId);
  return withZeppCache("workout-detail", { trackid, source }, 300, async () => {
    const raw = await ctx.zepp.get(buildZeppRequest("sportDetail", { trackid, source }));
    const detail = recognizableWorkoutDetail(raw);
    const returnedTrack = textIn(detail, ["trackid", "trackId"]);
    if (returnedTrack && returnedTrack !== trackid) throw new ZeppError("unrecognized_payload", "Workout detail track id mismatch");
    return detail;
  });
}

function availableDetail(detail: Record<string, unknown>): string[] {
  const keys: Array<[string, string[]]> = [
    ["heart_rate", ["heart_rate"]], ["pace", ["speed"]], ["cadence", ["gait"]], ["power", ["power_meter"]],
    ["ground_contact_time", ["runPosture"]], ["vertical_oscillation", ["runPosture"]], ["vertical_ratio", ["runPosture"]],
    ["equivalent_pace", ["equivPace"]], ["route", ["longitude_latitude"]], ["elevation", ["altitude", "time_delta_altitude"]]
  ];
  return keys.flatMap(([label, upstream]) => upstream.some(key => typeof detail[key] === "string" && (detail[key] as string).length > 0) ? [label] : []);
}

export async function getWorkout(ctx: ServiceContext, workoutId: string): Promise<Envelope<WorkoutDetail>> {
  const detail = await fetchWorkoutRaw(ctx, workoutId);
  const summary = normalizeWorkoutSummary(detail, ctx.config.USER_TIMEZONE);
  if (!summary) {
    const { trackid, source } = decodeWorkoutId(workoutId);
    const startMs = Number(trackid) * 1000;
    const duration = numberIn(detail, ["duration", "runTime", "time"], 1, 7 * 86400) ?? 1;
    const fallback: WorkoutDetail = {
      workout_id: encodeWorkoutId(trackid, source), activity_type: normalizeType(detail).activityType,
      started_at: new Date(startMs).toISOString(), ended_at: new Date(startMs + duration * 1000).toISOString(), duration_s: Math.round(duration),
      source_scope: sourceScope(detail), detail_available: true, available_detail: availableDetail(detail)
    };
    return ok(fallback, ctx.config.USER_TIMEZONE);
  }
  return ok({ ...summary, available_detail: availableDetail(detail) }, ctx.config.USER_TIMEZONE);
}
