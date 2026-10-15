// Tiny list-row thumbnails: a GPS route reduced to at most ~30 points in a 0..100 box (aspect ratio kept).
// The thumbnail carries no coordinates, only the shape, so the list response does not expose where the route is.
export interface RouteThumb { w: number; h: number; pts: Array<[number, number]> }

const MAX_THUMB_POINTS = 30;

/** points are [lat, lon] pairs; returns null for fewer than 2 distinct points. */
export function routeThumb(points: unknown): RouteThumb | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  const pts: Array<[number, number]> = [];
  for (const p of points) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push([p[0] as number, p[1] as number]);
  }
  if (pts.length < 2) return null;
  const step = (pts.length - 1) / (MAX_THUMB_POINTS - 1);
  const sampled = pts.length <= MAX_THUMB_POINTS ? pts : Array.from({ length: MAX_THUMB_POINTS }, (_, i) => pts[Math.round(i * step)]!);
  const lat0 = sampled.reduce((a, p) => a + p[0], 0) / sampled.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = sampled.map(p => p[1] * kx), ys = sampled.map(p => -p[0]); // north up
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY, span = Math.max(spanX, spanY);
  if (!(span > 0)) return null;
  const scale = 100 / span;
  return {
    w: Math.max(1, Math.round(spanX * scale)), h: Math.max(1, Math.round(spanY * scale)),
    pts: sampled.map((_, i) => [Math.round((xs[i]! - minX) * scale), Math.round((ys[i]! - minY) * scale)] as [number, number])
  };
}
