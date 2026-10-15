// Tiny list-row thumbnails: a GPS route reduced to at most 60 points in a 0..100 box (aspect ratio kept).
// The thumbnail carries no coordinates, only the shape, so the list response does not expose where the route is.
// A track of many laps around the same small loop would scribble when sampled, so repeated laps collapse to one
// representative lap; every shape is then simplified with Ramer-Douglas-Peucker instead of plain sampling.
export interface RouteThumb { w: number; h: number; pts: Array<[number, number]> }

export const MAX_THUMB_POINTS = 60;
type P = [number, number];

function rdp(pts: P[], eps: number): P[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1, at = -1;
    const [ax, ay] = pts[a]!, [bx, by] = pts[b]!;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!;
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > worst) { worst = d; at = i; }
    }
    if (at >= 0 && worst > eps) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * If the track goes around the same loop at least three times (it leaves and returns to its start twice or more)
 * returns the first lap closed back onto the start; otherwise null. Out-and-back and one-lap tracks are left alone.
 */
function firstLap(pts: P[], span: number): P[] | null {
  const far = span * 0.2, near = span * 0.08, s = pts[0]!;
  let away = false, returns = 0, firstEnd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]![0] - s[0], pts[i]![1] - s[1]);
    if (!away) { if (d > far) away = true; }
    else if (d < near) { returns++; if (firstEnd < 0) firstEnd = i; away = false; }
  }
  if (returns < 2 || firstEnd < 3) return null;
  const length = (a: number, b: number) => { let l = 0; for (let i = a + 1; i <= b; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return l; };
  if (length(0, firstEnd) > 0.6 * length(0, pts.length - 1)) return null;
  return [...pts.slice(0, firstEnd), s];
}

/** points are [lat, lon] pairs; returns null for fewer than 2 distinct points. */
export function routeThumb(points: unknown): RouteThumb | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  const ll: P[] = [];
  for (const p of points) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) ll.push([p[0] as number, p[1] as number]);
  }
  if (ll.length < 2) return null;
  const lat0 = ll.reduce((a, p) => a + p[0], 0) / ll.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  let xy: P[] = ll.map(p => [p[1] * kx, -p[0]]); // north up
  const bbox = (list: P[]) => {
    const xs = list.map(p => p[0]), ys = list.map(p => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  let b = bbox(xy);
  const fullSpan = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  if (!(fullSpan > 0)) return null;
  const lap = firstLap(xy, fullSpan);
  if (lap) xy = lap;
  b = bbox(xy);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  if (!(span > 0)) return null;
  let eps = span * 0.012, out = rdp(xy, eps);
  for (let i = 0; i < 40 && out.length > MAX_THUMB_POINTS; i++) { eps *= 1.3; out = rdp(xy, eps); }
  if (out.length > MAX_THUMB_POINTS) { const step = (out.length - 1) / (MAX_THUMB_POINTS - 1); out = Array.from({ length: MAX_THUMB_POINTS }, (_, i) => out[Math.round(i * step)]!); }
  const scale = 100 / span;
  return {
    w: Math.max(1, Math.round((b.maxX - b.minX) * scale)), h: Math.max(1, Math.round((b.maxY - b.minY) * scale)),
    pts: out.map(p => [Math.round((p[0] - b.minX) * scale), Math.round((p[1] - b.minY) * scale)] as P)
  };
}
