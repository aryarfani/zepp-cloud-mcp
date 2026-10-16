// GPX 1.1 and TCX (Garmin Training Center v2) export of a stored workout. Pure functions, no I/O.
// Built from the route and series the dashboard already stores per workout (up to 300 simplified GPS points, a time series with
// heart rate and altitude). It is NOT the watch's full-resolution track: timestamps are interpolated along the route by distance.
import type { AnalysisRoute, AnalysisSeries } from "../zepp/workout-analysis";

export interface ExportWorkout {
  workout_id: string;
  activity_type: string;
  started_at: string;
  duration_s: number | null;
  distance_m: number | null;
  calories_kcal: number | null;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
}

export interface TrackPoint { lat: number; lon: number; time: string; ele: number | null; dist_m: number; hr: number | null }

const xml = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function haversine(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Linear interpolation of `ys` over a non-decreasing `xs`; null entries in ys are skipped. */
function interp(xs: ReadonlyArray<number>, ys: ReadonlyArray<number | null>, x: number): number | null {
  let lo: number | null = null, hi: number | null = null;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (!isNum(y)) continue;
    if (xs[i]! <= x) lo = i;
    if (xs[i]! >= x) { hi = i; break; }
  }
  if (lo === null && hi === null) return null;
  if (lo === null) return ys[hi!]!;
  if (hi === null || lo === hi) return ys[lo]!;
  const span = xs[hi]! - xs[lo]!;
  return span > 0 ? ys[lo]! + ((ys[hi]! - ys[lo]!) * (x - xs[lo]!)) / span : ys[lo]!;
}

/** Route points with time (spread along the route by distance), cumulative distance, heart rate and altitude. Null when there is no usable route. */
export function buildTrack(w: ExportWorkout, route: AnalysisRoute | null | undefined, series: AnalysisSeries | null | undefined): TrackPoint[] | null {
  const pts = (route?.points ?? []).filter(p => isNum(p[0]) && isNum(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  const start = Date.parse(w.started_at);
  if (pts.length < 2 || !Number.isFinite(start)) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + haversine(pts[i - 1]!, pts[i]!));
  const routeLen = cum[cum.length - 1]!;
  const duration = isNum(w.duration_s) && w.duration_s > 0 ? w.duration_s : series?.t?.length ? series.t[series.t.length - 1]! : pts.length;
  const sDist = series?.dist_m ?? [];
  const lastDist = [...sDist].reverse().find(isNum) ?? 0;
  const monotonic = !!series && lastDist > 0 && series.t.length === sDist.length;
  // series distance (filled with the last known value so it stays non-decreasing)
  const sd: number[] = []; let carry = 0;
  for (const d of sDist) { if (isNum(d)) carry = Math.max(carry, d); sd.push(carry); }
  const total = isNum(w.distance_m) && w.distance_m > 0 ? w.distance_m : routeLen;
  return pts.map((p, i) => {
    const f = routeLen > 0 ? cum[i]! / routeLen : i / (pts.length - 1);
    const t = monotonic ? (interp(sd, series!.t, f * lastDist) ?? f * duration) : f * duration;
    const hr = series ? interp(series.t, series.hr_bpm, t) : null;
    const ele = series ? interp(series.t, series.alt_m, t) : null;
    return {
      lat: p[0], lon: p[1], time: new Date(start + Math.round(t) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      ele: ele === null ? null : Math.round(ele * 10) / 10, dist_m: Math.round(f * total * 10) / 10, hr: hr === null ? null : Math.round(hr)
    };
  });
}

const title = (w: ExportWorkout) => w.activity_type.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const coord = (v: number) => v.toFixed(6);

export function fileBase(w: ExportWorkout, timezone: string): string {
  let stamp = "workout";
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(w.started_at)).map(p => [p.type, p.value]));
    stamp = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
  } catch { /* keep the generic stamp */ }
  const sport = w.activity_type.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workout";
  return `zepp-${sport}-${stamp}`;
}

const GPX_TYPE: Record<string, string> = { running: "running", outdoor_running: "running", treadmill: "running", walking: "walking", hiking: "hiking", cycling: "cycling", outdoor_cycling: "cycling", swimming: "swimming" };

export function toGpx(w: ExportWorkout, track: readonly TrackPoint[]): string {
  const type = GPX_TYPE[w.activity_type] ?? w.activity_type.replace(/_/g, " ");
  const pts = track.map(p =>
    `<trkpt lat="${coord(p.lat)}" lon="${coord(p.lon)}">` +
    (p.ele !== null ? `<ele>${p.ele}</ele>` : "") + `<time>${p.time}</time>` +
    (p.hr !== null ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : "") +
    `</trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="zepp-cloud-mcp" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">\n` +
    `<metadata><name>${xml(title(w))}</name><time>${track[0]!.time}</time></metadata>\n` +
    `<trk><name>${xml(title(w))}</name><type>${xml(type)}</type>\n<trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
}

const TCX_SPORT: Record<string, string> = { running: "Running", outdoor_running: "Running", treadmill: "Running", cycling: "Biking", outdoor_cycling: "Biking", indoor_cycling: "Biking" };

export function toTcx(w: ExportWorkout, track: readonly TrackPoint[]): string {
  const sport = TCX_SPORT[w.activity_type] ?? "Other";
  const first = track[0]!, last = track[track.length - 1]!;
  const seconds = isNum(w.duration_s) && w.duration_s > 0 ? Math.round(w.duration_s) : Math.max(1, Math.round((Date.parse(last.time) - Date.parse(first.time)) / 1000));
  const dist = isNum(w.distance_m) && w.distance_m > 0 ? w.distance_m : last.dist_m;
  const hrs = track.map(p => p.hr).filter(isNum);
  const avg = isNum(w.avg_hr_bpm) ? Math.round(w.avg_hr_bpm) : hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  const max = isNum(w.max_hr_bpm) ? Math.round(w.max_hr_bpm) : hrs.length ? Math.max(...hrs) : null;
  const tp = track.map(p =>
    `<Trackpoint><Time>${p.time}</Time><Position><LatitudeDegrees>${coord(p.lat)}</LatitudeDegrees><LongitudeDegrees>${coord(p.lon)}</LongitudeDegrees></Position>` +
    (p.ele !== null ? `<AltitudeMeters>${p.ele}</AltitudeMeters>` : "") + `<DistanceMeters>${p.dist_m}</DistanceMeters>` +
    (p.hr !== null ? `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>` : "") + `</Trackpoint>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">\n` +
    `<Activities><Activity Sport="${sport}"><Id>${first.time}</Id>\n` +
    `<Lap StartTime="${first.time}"><TotalTimeSeconds>${seconds}</TotalTimeSeconds><DistanceMeters>${Math.round(dist * 10) / 10}</DistanceMeters>` +
    `<Calories>${isNum(w.calories_kcal) ? Math.max(0, Math.round(w.calories_kcal)) : 0}</Calories>` +
    (avg !== null ? `<AverageHeartRateBpm><Value>${avg}</Value></AverageHeartRateBpm>` : "") +
    (max !== null ? `<MaximumHeartRateBpm><Value>${max}</Value></MaximumHeartRateBpm>` : "") +
    `<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>\n<Track>\n${tp}\n</Track></Lap>\n` +
    `<Notes>${xml(title(w))} exported from zepp-cloud-mcp (simplified route)</Notes></Activity></Activities>\n</TrainingCenterDatabase>\n`;
}
