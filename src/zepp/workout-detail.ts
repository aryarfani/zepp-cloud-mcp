import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { numericValue } from "./normalize";
import { decodeWorkoutId, fetchWorkoutRaw } from "./workouts";

export const WORKOUT_SAMPLE_FIELDS = ["heart_rate", "pace", "cadence", "power", "ground_contact_time", "vertical_oscillation", "vertical_ratio", "equivalent_pace", "elevation"] as const;
export type WorkoutSampleField = typeof WORKOUT_SAMPLE_FIELDS[number];

export interface WorkoutSample {
  time: string;
  heart_rate_bpm?: number;
  pace_s_per_km?: number;
  cadence_spm?: number;
  power_w?: number;
  ground_contact_ms?: number;
  vertical_oscillation_mm?: number;
  vertical_ratio_pct?: number;
  equivalent_pace_s_per_km?: number;
  elevation_m?: number;
}

export interface WorkoutRoutePoint { time: string; latitude: number; longitude: number; elevation_m?: number }
export interface DownsampleMeta { original_count: number; returned_count: number; downsampled: boolean }
export interface WorkoutSamplesResult extends DownsampleMeta { points: WorkoutSample[] }
export interface WorkoutRouteResult extends DownsampleMeta { points: WorkoutRoutePoint[] }

type TimedNumber = Map<number, number>;
const COORD_FACTOR = 100_000_000;

function parseList(value: unknown): number[] {
  if (typeof value !== "string") return [];
  return value.split(/[;,]/).map(v => Number(v.trim())).filter(Number.isFinite);
}

function parsePairs(value: unknown, emptyDeltaIsOne = false): Array<[number, number]> {
  if (typeof value !== "string") return [];
  const pairs: Array<[number, number]> = [];
  for (const part of value.split(";").filter(Boolean)) {
    const comma = part.indexOf(",");
    if (comma < 0) continue;
    const rawDelta = part.slice(0, comma).trim();
    const rawValue = part.slice(comma + 1).split(",", 1)[0]!.trim();
    const delta = rawDelta === "" && emptyDeltaIsOne ? 1 : Number(rawDelta || 0);
    const sample = Number(rawValue);
    if (Number.isFinite(delta) && Number.isFinite(sample)) pairs.push([Math.max(0, Math.round(delta)), sample]);
  }
  return pairs;
}

function parseRows(value: unknown): number[][] {
  if (typeof value !== "string") return [];
  return value.split(";").filter(Boolean).map(part => part.split(",").map(v => Number(v.trim()))).filter(row => row.length >= 2 && row.every(Number.isFinite));
}

function cumulativeTimeline(startSec: number, pairs: Array<[number, number]>, transform: (value: number) => number | undefined = v => v): TimedNumber {
  const output: TimedNumber = new Map();
  let t = startSec;
  for (const [delta, raw] of pairs) {
    t += delta;
    const value = transform(raw);
    if (value !== undefined && Number.isFinite(value)) output.set(t, value);
  }
  return output;
}

function plausibleAltitudeCm(value: number): number | undefined { return value >= -100_000 && value <= 1_000_000 ? value / 100 : undefined; }
function speedToPace(speed: number): number | undefined {
  if (!Number.isFinite(speed) || speed <= 0) return undefined;
  const pace = 1000 / speed;
  return pace >= 60 && pace <= 3600 ? pace : undefined;
}

function buildTimelines(detail: Record<string, unknown>, startSec: number) {
  const hr = cumulativeTimeline(startSec, parsePairs(detail.heart_rate, true), v => v >= 20 && v <= 260 ? v : undefined);
  const speed = cumulativeTimeline(startSec, parsePairs(detail.speed), v => v > 0 && v < 30 ? v : undefined);
  const power = cumulativeTimeline(startSec, parsePairs(detail.power_meter, true), v => v > 0 && v < 3000 ? v : undefined);
  const equiv = cumulativeTimeline(startSec, parsePairs(detail.equivPace, true), v => v > 0 && v < 3600 ? v : undefined);
  const altitude = cumulativeTimeline(startSec, parsePairs(detail.time_delta_altitude, true), plausibleAltitudeCm);
  const cadence: TimedNumber = new Map(), gct: TimedNumber = new Map(), vo: TimedNumber = new Map(), ratio: TimedNumber = new Map();
  let t = startSec;
  for (const row of parseRows(detail.gait)) {
    t += Math.max(0, Math.round(row[0] ?? 0));
    const candidate = row[3] ?? row[1];
    if (candidate !== undefined && candidate > 0 && candidate < 300) cadence.set(t, candidate);
  }
  t = startSec;
  for (const row of parseRows(detail.runPosture)) {
    t += Math.max(0, Math.round(row[0] ?? 0));
    const ground = row[1], oscillation = row[2], vertical = row[3];
    if (ground !== undefined && ground !== 65535 && ground > 0 && ground < 2000) gct.set(t, ground);
    if (oscillation !== undefined && oscillation !== 65535 && oscillation > 0 && oscillation < 1000) vo.set(t, oscillation);
    if (vertical !== undefined && vertical !== 255 && vertical > 0 && vertical < 1000) ratio.set(t, vertical / 10);
  }
  return { hr, speed, power, equiv, altitude, cadence, gct, vo, ratio };
}

export function decodeWorkoutSamples(detail: Record<string, unknown>, fields: readonly WorkoutSampleField[]): WorkoutSample[] {
  const trackid = numericValue(detail.trackid ?? detail.trackId);
  if (trackid === undefined || trackid <= 0) return [];
  const timeline = buildTimelines(detail, Math.round(trackid));
  const seconds = new Set<number>();
  for (const map of Object.values(timeline)) for (const second of map.keys()) seconds.add(second);
  const wanted = new Set(fields);
  return [...seconds].sort((a, b) => a - b).map(second => {
    const point: WorkoutSample = { time: new Date(second * 1000).toISOString() };
    const hr = timeline.hr.get(second), speed = timeline.speed.get(second), cadence = timeline.cadence.get(second), power = timeline.power.get(second);
    const gct = timeline.gct.get(second), vo = timeline.vo.get(second), ratio = timeline.ratio.get(second), equiv = timeline.equiv.get(second), altitude = timeline.altitude.get(second);
    if (wanted.has("heart_rate") && hr !== undefined) point.heart_rate_bpm = hr;
    if (wanted.has("pace") && speed !== undefined) { const pace = speedToPace(speed); if (pace !== undefined) point.pace_s_per_km = pace; }
    if (wanted.has("cadence") && cadence !== undefined) point.cadence_spm = cadence;
    if (wanted.has("power") && power !== undefined) point.power_w = power;
    if (wanted.has("ground_contact_time") && gct !== undefined) point.ground_contact_ms = gct;
    if (wanted.has("vertical_oscillation") && vo !== undefined) point.vertical_oscillation_mm = vo;
    if (wanted.has("vertical_ratio") && ratio !== undefined) point.vertical_ratio_pct = ratio;
    if (wanted.has("equivalent_pace") && equiv !== undefined) point.equivalent_pace_s_per_km = equiv;
    if (wanted.has("elevation") && altitude !== undefined) point.elevation_m = altitude;
    return point;
  }).filter(point => Object.keys(point).length > 1);
}

function coordinateDeltas(value: unknown): Array<[number | undefined, number | undefined]> {
  if (typeof value !== "string") return [];
  return value.split(";").filter(Boolean).map(part => {
    const [lat, lon] = part.split(",");
    const a = Number(lat), b = Number(lon);
    return [Number.isFinite(a) ? a : undefined, Number.isFinite(b) ? b : undefined];
  });
}

export function decodeWorkoutRoute(detail: Record<string, unknown>): WorkoutRoutePoint[] {
  const trackid = numericValue(detail.trackid ?? detail.trackId);
  if (trackid === undefined || trackid <= 0) return [];
  const timeDeltas = parseList(detail.time).map(v => Math.max(0, Math.round(v)));
  const coords = coordinateDeltas(detail.longitude_latitude);
  const altitudes = typeof detail.altitude === "string" ? detail.altitude.split(";").filter(Boolean).map(v => Number(v)).map(v => Number.isFinite(v) ? plausibleAltitudeCm(v) : undefined) : [];
  const timedAltitude = cumulativeTimeline(Math.round(trackid), parsePairs(detail.time_delta_altitude, true), plausibleAltitudeCm);
  const points: WorkoutRoutePoint[] = [];
  let sec = Math.round(trackid), lat = 0, lon = 0;
  for (let index = 0; index < coords.length; index++) {
    sec += timeDeltas[index] ?? (index === 0 ? 0 : 1);
    const [dLat, dLon] = coords[index]!;
    if (dLat === undefined || dLon === undefined) continue;
    lat += dLat; lon += dLon;
    const latitude = lat / COORD_FACTOR, longitude = lon / COORD_FACTOR;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
    const point: WorkoutRoutePoint = { time: new Date(sec * 1000).toISOString(), latitude, longitude };
    const elevation = timedAltitude.get(sec) ?? altitudes[index];
    if (elevation !== undefined) point.elevation_m = elevation;
    points.push(point);
  }
  return points;
}

export function downsampleStable<T>(points: readonly T[], maxPoints: number): { points: T[]; meta: DownsampleMeta } {
  const cap = Math.max(2, Math.min(5000, Math.floor(maxPoints)));
  const original = points.length;
  if (original <= cap) return { points: [...points], meta: { original_count: original, returned_count: original, downsampled: false } };
  const indices = new Set<number>([0, original - 1]);
  for (let i = 1; i < cap - 1; i++) indices.add(Math.round(i * (original - 1) / (cap - 1)));
  const sampled = [...indices].sort((a, b) => a - b).slice(0, cap).map(index => points[index]!);
  return { points: sampled, meta: { original_count: original, returned_count: sampled.length, downsampled: true } };
}

export async function getWorkoutSamples(ctx: ServiceContext, workoutId: string, fields: readonly WorkoutSampleField[], maxPoints = 500): Promise<Envelope<WorkoutSamplesResult>> {
  decodeWorkoutId(workoutId);
  const decoded = decodeWorkoutSamples(await fetchWorkoutRaw(ctx, workoutId), fields);
  if (!decoded.length) return noData(ctx.config.USER_TIMEZONE);
  const sampled = downsampleStable(decoded, maxPoints);
  return ok({ points: sampled.points, ...sampled.meta }, ctx.config.USER_TIMEZONE, { partial: sampled.meta.downsampled });
}

export async function getWorkoutRoute(ctx: ServiceContext, workoutId: string, maxPoints = 1000): Promise<Envelope<WorkoutRouteResult>> {
  decodeWorkoutId(workoutId);
  const decoded = decodeWorkoutRoute(await fetchWorkoutRaw(ctx, workoutId));
  if (!decoded.length) return noData(ctx.config.USER_TIMEZONE);
  const sampled = downsampleStable(decoded, maxPoints);
  return ok({ points: sampled.points, ...sampled.meta }, ctx.config.USER_TIMEZONE, { partial: sampled.meta.downsampled });
}
