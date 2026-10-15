import { describe, expect, it } from "vitest";
import { MUSCLE_IDS, STRENGTH_MUSCLE_CATALOG } from "../src/zepp/strength-muscle-catalog";
import { aggregateMuscles, exerciseMuscles } from "../src/zepp/muscles";
import { strengthExerciseName } from "../src/zepp/strength-exercises";
import { routeThumb } from "../src/dashboard/thumbs";

describe("strength muscle catalog", () => {
  it("only refers to known muscle ids and has no data for unknown_0 or unassigned ids", () => {
    const known = new Set<string>(MUSCLE_IDS);
    const ids = Object.keys(STRENGTH_MUSCLE_CATALOG).map(Number);
    expect(ids.length).toBeGreaterThan(1000);
    for (const id of ids) {
      const [p, s] = STRENGTH_MUSCLE_CATALOG[id]!;
      for (const m of [...p.split(" "), ...s.split(" ")].filter(Boolean)) expect(known.has(m), id + ":" + m).toBe(true);
      expect(p.split(" ").filter(Boolean).length + s.split(" ").filter(Boolean).length, String(id)).toBeGreaterThan(0);
    }
    expect(exerciseMuscles(0)).toEqual({ p: [], s: [] });
    expect(exerciseMuscles(9999)).toEqual({ p: [], s: [] });
    expect(exerciseMuscles(-1)).toEqual({ p: [], s: [] });
  });

  it("gives primary and secondary muscles for known exercises", () => {
    expect(exerciseMuscles(6)).toEqual({ p: ["chest"], s: ["front_delts", "triceps"] });
    expect(exerciseMuscles(64)).toEqual({ p: ["lats"], s: ["biceps", "upper_back"] });
  });

  it("keeps exercise naming unchanged", () => {
    expect(strengthExerciseName(6)).toBeTruthy();
    expect(strengthExerciseName(0)).toBe("unknown_0");
  });

  it("aggregates over sets: primary anywhere wins, unknown ids add nothing, no data gives null", () => {
    expect(aggregateMuscles([64, 6, 9999])).toEqual({ p: ["chest", "lats"], s: ["front_delts", "biceps", "triceps", "upper_back"] });
    const withTricepsPrimary = aggregateMuscles([4, 6])!;
    expect(withTricepsPrimary.p).toContain("triceps");
    expect(withTricepsPrimary.s).not.toContain("triceps");
    expect(aggregateMuscles([0, 9999])).toBeNull();
    expect(aggregateMuscles([])).toBeNull();
  });
});

describe("route thumbnail", () => {
  const loop = Array.from({ length: 300 }, (_, i) => [-6.2 + Math.sin(i / 20) * 0.01, 106.8 + Math.cos(i / 20) * 0.01]);
  it("downsamples to at most 60 points inside a 0..100 box without coordinates", () => {
    const t = routeThumb(loop)!;
    expect(t.pts.length).toBeLessThanOrEqual(60);
    expect(Math.max(t.w, t.h)).toBe(100);
    for (const [x, y] of t.pts) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(100); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(100); }
    expect(JSON.stringify(t)).not.toContain("106.8");
  });
  it("returns null for too few, identical or malformed points", () => {
    expect(routeThumb(null)).toBeNull();
    expect(routeThumb([[1, 2]])).toBeNull();
    expect(routeThumb([[1, 2], [1, 2]])).toBeNull();
    expect(routeThumb([["a", 1], [2, 3]])).toBeNull();
  });
  it("keeps a straight-ish route as a clean shape and adds no scribble points", () => {
    const line = Array.from({ length: 300 }, (_, i) => [-6.2 + i * 0.0001, 106.8 + i * 0.0001 + (i % 2 ? 0.000002 : 0)]);
    const t = routeThumb(line)!;
    expect(t.pts.length).toBeLessThanOrEqual(4);
  });
  it("collapses many laps of a small loop to one lap instead of a scribble", () => {
    const lap = 30, laps = 10, pts: number[][] = [];
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    for (let i = 0; i < lap * laps; i++) {
      const a = ((i % lap) / lap) * 2 * Math.PI, drift = (i / lap) * 0.4;
      pts.push([-6.2 + (Math.sin(a) * 30 + rnd() * 5) / 111000, 106.8 + (Math.cos(a) * 60 + rnd() * 5 + drift) / 110000]);
    }
    const t = routeThumb(pts)!;
    expect(t.pts.length).toBeLessThanOrEqual(60);
    // one lap closed on its start: first and last point coincide and the path stays inside one oval (about 2:1)
    expect(Math.hypot(t.pts[0]![0] - t.pts.at(-1)![0], t.pts[0]![1] - t.pts.at(-1)![1])).toBeLessThan(4);
    expect(t.w / t.h).toBeGreaterThan(1.6); expect(t.w / t.h).toBeLessThan(2.6);
    // path length is about one lap of the oval (perimeter ~ 2*pi*sqrt((a^2+b^2)/2) with a=100, b=50 units)
    let len = 0; for (let i = 1; i < t.pts.length; i++) len += Math.hypot(t.pts[i]![0] - t.pts[i - 1]![0], t.pts[i]![1] - t.pts[i - 1]![1]);
    expect(len).toBeGreaterThan(200); expect(len).toBeLessThan(420);
  });
  it("leaves an out-and-back route alone", () => {
    const out = Array.from({ length: 50 }, (_, i) => [-6.2 + i * 0.0002, 106.8]);
    const t = routeThumb([...out, ...out.slice().reverse()])!;
    expect(t.h).toBe(100);
  });
});
