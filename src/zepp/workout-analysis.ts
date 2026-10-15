// Compact, display-ready analysis of one Zepp workout, derived from the raw /v1/sport/run/detail.json payload plus the history item.
// Stored per workout in `workout_details` (a few KB), so the dashboard never needs the multi-hundred-KB raw series again.
import { numericValue } from "./normalize";
import { cumulativeTimeline, decodeHeartRateTimeline, decodeWorkoutRoute, downsampleStable, parsePairs, parseRows, plausibleAltitudeCm } from "./workout-detail";

export const ANALYSIS_VERSION = 1;
const MAX_SERIES_POINTS = 300;
const MAX_ROUTE_POINTS = 300;
const ELEVATION_HYSTERESIS_M = 1;

export interface AnalysisSummary {
  duration_s: number | null;
  distance_m: number | null;
  avg_pace_s_km: number | null;
  best_pace_s_km: number | null;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  min_hr_bpm: number | null;
  avg_cadence_spm: number | null;
  max_cadence_spm: number | null;
  steps: number | null;
  stride_cm: number | null;
  calories_kcal: number | null;
  ascent_m: number | null;
  descent_m: number | null;
  min_altitude_m: number | null;
  max_altitude_m: number | null;
  avg_power_w: number | null;
  max_power_w: number | null;
  training_load: number | null;
  aerobic_te: number | null;
  anaerobic_te: number | null;
  vo2max: number | null;
}
export interface AnalysisSplit { km: number; distance_m: number; time_s: number; pace_s_km: number; avg_hr_bpm: number | null; cadence_spm: number | null; partial?: true }
export interface AnalysisZone { lower_bpm: number; upper_bpm: number; seconds: number }
export interface AnalysisSeries {
  step_s: number;
  /** Seconds since the workout started, one entry per bucket. */
  t: number[];
  dist_m: Array<number | null>;
  pace_s_km: Array<number | null>;
  hr_bpm: Array<number | null>;
  cadence_spm: Array<number | null>;
  alt_m: Array<number | null>;
}
export interface AnalysisRoute { points: Array<[number, number]>; bbox: [number, number, number, number]; original_count: number }
export interface WorkoutAnalysis {
  v: number;
  summary: AnalysisSummary;
  series: AnalysisSeries | null;
  splits: AnalysisSplit[];
  zones: AnalysisZone[];
  route: AnalysisRoute | null;
}

type Raw = Record<string, unknown>;

const num = (value: unknown): number | undefined => numericValue(value);
/** A positive measurement; Zepp uses -1, -274 and 0 for "no value". */
function pos(value: unknown, max = Number.POSITIVE_INFINITY): number | null {
  const n = num(value);
  return n !== undefined && n > 0 && n <= max ? n : null;
}
const round = (value: number, digits = 0) => { const f = 10 ** digits; return Math.round(value * f) / f; };
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function floatList(value: unknown): number[] {
  if (typeof value !== "string" || value === "") return [];
  return value.split(";").map(v => (v.trim() === "" ? Number.NaN : Number(v)));
}

interface PerSecond { hr: number[]; speed: number[]; cadence: number[]; alt: number[]; dist: number[] }

function filled(length: number): number[] { return new Array<number>(length).fill(Number.NaN); }

function buildPerSecond(detail: Raw, duration: number, distanceHintM: number | null): PerSecond {
  const length = duration + 1;
  const out: PerSecond = { hr: filled(length), speed: filled(length), cadence: filled(length), alt: filled(length), dist: filled(length) };
  const trackid = Math.round(num(detail.trackid ?? detail.trackId) ?? 0);
  const put = (array: number[], second: number, value: number) => {
    const index = Math.round(second);
    if (index >= 0 && index < length && Number.isFinite(value)) array[index] = value;
  };
  for (const [sec, v] of decodeHeartRateTimeline(detail.heart_rate, trackid)) put(out.hr, sec - trackid, v);

  // Per-point pace (s/m) is aligned with the per-point `time` deltas.
  const paces = floatList(detail.pace), deltas = floatList(detail.time);
  if (paces.length && deltas.length >= paces.length) {
    let at = 0;
    for (let i = 0; i < paces.length; i++) {
      at += Number.isFinite(deltas[i]!) ? Math.max(0, deltas[i]!) : 1;
      const p = paces[i]!;
      if (p > 0.05 && p < 3.6) put(out.speed, at, 1 / p);
    }
  } else {
    for (const [sec, v] of cumulativeTimeline(trackid, parsePairs(detail.speed), v => (v > 0 && v < 30 ? v : undefined))) put(out.speed, sec - trackid, v);
  }

  let at = 0;
  for (const row of parseRows(detail.gait)) {
    at += Math.max(0, Math.round(row[0] ?? 0));
    const cadence = row[3];
    if (cadence !== undefined && cadence > 0 && cadence < 300) put(out.cadence, at, cadence);
  }
  for (const [sec, cm] of cumulativeTimeline(trackid, parsePairs(detail.time_delta_altitude, true), plausibleAltitudeCm)) put(out.alt, sec - trackid, cm);

  // Cumulative distance is stored in centimetres; fall back to integrating speed.
  const distPairs = parsePairs(detail.currentDistance);
  if (distPairs.length > 1) {
    const last = distPairs[distPairs.length - 1]![1];
    const scale = distanceHintM && last / 100 > distanceHintM * 0.7 && last / 100 < distanceHintM * 1.3 ? 100
      : distanceHintM && last > distanceHintM * 0.7 && last < distanceHintM * 1.3 ? 1 : 100;
    for (const [sec, v] of cumulativeTimeline(trackid, distPairs, v => (v >= 0 ? v / scale : undefined))) put(out.dist, sec - trackid, v);
  } else {
    let total = 0;
    for (let s = 0; s < length; s++) { if (Number.isFinite(out.speed[s]!)) total += out.speed[s]!; if (total > 0) out.dist[s] = total; }
  }
  // Carry distance forward so the series is monotonic.
  let carry = Number.NaN;
  for (let s = 0; s < length; s++) { if (Number.isFinite(out.dist[s]!)) carry = out.dist[s]!; else if (Number.isFinite(carry)) out.dist[s] = carry; }
  return out;
}

function finiteIn(array: number[], from: number, to: number): number[] {
  const values: number[] = [];
  for (let s = Math.max(0, from); s < Math.min(array.length, to); s++) if (Number.isFinite(array[s]!)) values.push(array[s]!);
  return values;
}

function buildSeries(ps: PerSecond, duration: number): AnalysisSeries | null {
  const step = Math.max(1, Math.ceil(duration / MAX_SERIES_POINTS));
  const buckets = Math.ceil(duration / step);
  const series: AnalysisSeries = { step_s: step, t: [], dist_m: [], pace_s_km: [], hr_bpm: [], cadence_spm: [], alt_m: [] };
  let any = false;
  for (let b = 0; b < buckets; b++) {
    const from = b * step, to = Math.min((b + 1) * step, duration + 1);
    const hr = mean(finiteIn(ps.hr, from, to)), cadence = mean(finiteIn(ps.cadence, from, to)), alt = mean(finiteIn(ps.alt, from, to));
    const speed = mean(finiteIn(ps.speed, from, to));
    const dist = finiteIn(ps.dist, from, to).at(-1) ?? null;
    series.t.push(Math.min((b + 1) * step, duration));
    series.dist_m.push(dist === null ? null : Math.round(dist));
    series.pace_s_km.push(speed && speed > 0 ? Math.round(1000 / speed) : null);
    series.hr_bpm.push(hr === null ? null : Math.round(hr));
    series.cadence_spm.push(cadence === null ? null : Math.round(cadence));
    series.alt_m.push(alt === null ? null : round(alt, 1));
    if (hr !== null || cadence !== null || alt !== null || speed !== null) any = true;
  }
  return any ? series : null;
}

function elevationChange(alt: number[]): { ascent: number; descent: number } | null {
  const values = alt.filter(Number.isFinite);
  if (values.length < 2) return null;
  // 5 s moving average, then count a climb/descent only once it exceeds the hysteresis, so sensor noise is not counted.
  const smooth: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const window = values.slice(Math.max(0, i - 2), i + 3);
    smooth.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  let ref = smooth[0]!, ascent = 0, descent = 0;
  for (const a of smooth) {
    if (a - ref >= ELEVATION_HYSTERESIS_M) { ascent += a - ref; ref = a; }
    else if (ref - a >= ELEVATION_HYSTERESIS_M) { descent += ref - a; ref = a; }
  }
  return { ascent, descent };
}

function zonesFrom(history: Raw): AnalysisZone[] {
  const raw = history.heart_range;
  if (typeof raw !== "string" || raw === "") return [];
  const zones: AnalysisZone[] = [];
  let lower = 0;
  for (const part of raw.split(";")) {
    const [seconds, upper] = part.split(",").map(Number);
    if (seconds === undefined || upper === undefined || !Number.isFinite(seconds) || !Number.isFinite(upper) || upper <= 0 || seconds < 0) return [];
    zones.push({ lower_bpm: lower, upper_bpm: upper, seconds: Math.round(seconds) });
    lower = upper;
  }
  return zones.some(z => z.seconds > 0) ? zones : [];
}

function splitsFromRows(detail: Raw): AnalysisSplit[] {
  const out: AnalysisSplit[] = [];
  for (const row of parseKiloRows(detail.kilo_pace)) {
    const index = num(row[0]), ms = num(row[6]), seconds = num(row[1]);
    const time = ms !== undefined && ms > 0 ? ms / 1000 : seconds;
    if (index === undefined || time === undefined || time <= 0) continue;
    const hr = pos(row[4], 260), cadence = pos(row[13], 300);
    out.push({ km: index + 1, distance_m: 1000, time_s: round(time, 1), pace_s_km: Math.round(time), avg_hr_bpm: hr === null ? null : Math.round(hr), cadence_spm: cadence === null ? null : Math.round(cadence) });
  }
  return out;
}

/** kilo_pace rows contain a geohash string, so they cannot go through the numeric row parser. */
function parseKiloRows(value: unknown): string[][] {
  if (typeof value !== "string" || value === "") return [];
  return value.split(";").filter(Boolean).map(r => r.split(",")).filter(r => r.length >= 7);
}

function splitsFromSeries(ps: PerSecond, duration: number): AnalysisSplit[] {
  const out: AnalysisSplit[] = [];
  let prevSec = 0, km = 1;
  for (let s = 1; s <= duration; s++) {
    const d = ps.dist[s];
    if (d === undefined || !Number.isFinite(d)) continue;
    while (d >= km * 1000) {
      const hr = mean(finiteIn(ps.hr, prevSec, s)), cadence = mean(finiteIn(ps.cadence, prevSec, s));
      out.push({ km, distance_m: 1000, time_s: s - prevSec, pace_s_km: s - prevSec, avg_hr_bpm: hr === null ? null : Math.round(hr), cadence_spm: cadence === null ? null : Math.round(cadence) });
      prevSec = s; km++;
    }
  }
  return out;
}

function routeFrom(detail: Raw): AnalysisRoute | null {
  const decoded = decodeWorkoutRoute(detail);
  if (decoded.length < 2) return null;
  const sampled = downsampleStable(decoded, MAX_ROUTE_POINTS).points;
  const points = sampled.map(p => [round(p.latitude, 5), round(p.longitude, 5)] as [number, number]);
  const lats = points.map(p => p[0]), lons = points.map(p => p[1]);
  const bbox: [number, number, number, number] = [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)];
  if (bbox[0] === bbox[2] && bbox[1] === bbox[3]) return null;
  return { points, bbox, original_count: decoded.length };
}

export function analyzeWorkout(detail: Raw, history: Raw = {}): WorkoutAnalysis {
  const distance = pos(history.highPrecisionDistance) ?? pos(history.dis ?? history.distance);
  const timeDeltas = floatList(detail.time).filter(Number.isFinite);
  const durationFromTime = timeDeltas.length ? Math.round(timeDeltas.reduce((a, b) => a + b, 0)) : null;
  const runTime = pos(history.run_time), totalMs = pos(history.totalTimeWithMillis);
  const duration = Math.round(runTime ?? (totalMs !== null ? totalMs / 1000 : (durationFromTime ?? 0)));
  const ps = duration >= 2 ? buildPerSecond(detail, duration, distance) : null;
  const series = ps ? buildSeries(ps, duration) : null;

  const hrAll = ps ? ps.hr.filter(Number.isFinite) : [];
  const cadAll = ps ? ps.cadence.filter(Number.isFinite) : [];
  const altAll = ps ? ps.alt.filter(Number.isFinite) : [];
  const change = ps ? elevationChange(ps.alt) : null;
  const histAscent = num(history.altitude_ascend), histDescent = num(history.altitude_descend);
  // A pace slower than an hour per km is not a running pace (pool swims report per-100 m values); leave it out.
  const sane = (p: number | null) => (p !== null && p <= 3600 ? p : null);
  const avgPace = sane(pos(history.avg_pace) !== null ? pos(history.avg_pace)! * 1000 : distance && duration ? (duration / distance) * 1000 : null);
  const bestHistory = pos(history.max_pace);
  const speeds = ps ? ps.speed.filter(Number.isFinite).sort((a, b) => b - a) : [];
  const bestPace = sane(bestHistory !== null ? bestHistory * 1000 : speeds.length >= 20 ? 1000 / speeds[Math.floor(speeds.length * 0.02)]! : null);
  const te = pos(history.te), ante = pos(history.anaerobic_te);

  const summary: AnalysisSummary = {
    duration_s: duration || null,
    distance_m: distance === null ? null : round(distance, 1),
    avg_pace_s_km: avgPace === null ? null : Math.round(avgPace),
    best_pace_s_km: bestPace === null ? null : Math.round(bestPace),
    avg_hr_bpm: pos(history.avg_heart_rate, 260) ?? (hrAll.length ? round(mean(hrAll)!) : null),
    max_hr_bpm: pos(history.max_heart_rate, 260) ?? (hrAll.length ? Math.max(...hrAll) : null),
    min_hr_bpm: pos(history.min_heart_rate, 260) ?? (hrAll.length ? Math.min(...hrAll) : null),
    avg_cadence_spm: pos(history.avg_frequency, 300) ?? pos(history.avg_cadence, 300) ?? (cadAll.length ? round(mean(cadAll)!) : null),
    max_cadence_spm: pos(history.max_frequency, 300) ?? pos(history.max_cadence, 300) ?? (cadAll.length ? Math.max(...cadAll) : null),
    steps: pos(history.total_step),
    stride_cm: pos(history.avg_stride_length, 400),
    calories_kcal: pos(history.calorie),
    ascent_m: change ? round(change.ascent, 1) : histAscent !== undefined && histAscent >= 0 ? histAscent : null,
    descent_m: change ? round(change.descent, 1) : histDescent !== undefined && histDescent >= 0 ? histDescent : null,
    min_altitude_m: altAll.length ? round(Math.min(...altAll), 1) : null,
    max_altitude_m: altAll.length ? round(Math.max(...altAll), 1) : null,
    avg_power_w: pos(history.average_power, 3000),
    max_power_w: pos(history.max_power, 3000),
    training_load: pos(history.exercise_load),
    aerobic_te: te === null ? null : round(te / 10, 1),
    anaerobic_te: ante === null ? null : round(ante / 10, 1),
    vo2max: pos(history.VO2_max, 100)
  };

  let splits = splitsFromRows(detail);
  if (!splits.length && ps) splits = splitsFromSeries(ps, duration);
  // Add the unfinished last kilometre (the watch only records whole ones).
  if (ps && splits.length && distance) {
    const done = splits.length * 1000;
    const remainder = distance - done;
    const elapsed = splits.reduce((a, s) => a + s.time_s, 0);
    if (remainder >= 100 && duration - elapsed > 5) {
      const hr = mean(finiteIn(ps.hr, Math.round(elapsed), duration + 1)), cadence = mean(finiteIn(ps.cadence, Math.round(elapsed), duration + 1));
      const time = duration - elapsed;
      splits.push({ km: round((done + remainder) / 1000, 2), distance_m: Math.round(remainder), time_s: round(time, 1), pace_s_km: Math.round(time / (remainder / 1000)), avg_hr_bpm: hr === null ? null : Math.round(hr), cadence_spm: cadence === null ? null : Math.round(cadence), partial: true });
    }
  }

  return { v: ANALYSIS_VERSION, summary, series, splits, zones: zonesFrom(history), route: routeFrom(detail) };
}