import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard } from "../../src/dashboard/handler";
import { ZeppStore } from "../../src/store/store";
import { analyzeWorkout } from "../../src/zepp/workout-analysis";
import { RUN_HISTORY_EXTRA, runDetail } from "../fixtures/run-detail";
import { seedDashboardDb } from "./dashboard-seed";

type Element = any;
const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";
const RUN = "zepp:1760482800:cnVuLmRldmljZQ";
let dir: string, file: string;
const opened: DashboardData[] = [];
const wait = (ms = 40) => new Promise(r => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zepp-fit-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  const w = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const id of ["w-oval", "w-long"]) w.run(id, "outdoor_running", 1, "2026-10-11T23:30:00.000Z", "2026-10-12", "2026-10-12T00:30:00.000Z", 3600, 4000, 300, 150, 170, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  db.close();
  const withRoute = (points: Array<[number, number]>) => {
    const an: any = analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA);
    const lats = points.map(p => p[0]), lons = points.map(p => p[1]);
    an.route = { points, bbox: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)], original_count: points.length };
    return an;
  };
  // a small running track (about 120 m x 60 m, ten laps) and a long point-to-point route (about 25 km)
  const oval = Array.from({ length: 300 }, (_, i) => { const a = ((i % 30) / 30) * 2 * Math.PI; return [-6.2 + (Math.sin(a) * 30) / 111000, 106.8 + (Math.cos(a) * 60) / 110000] as [number, number]; });
  const long = Array.from({ length: 300 }, (_, i) => [-6.2 + (i / 299) * 0.15, 106.8 + (i / 299) * 0.1 + Math.sin(i / 20) * 0.004] as [number, number]);
  const store = new ZeppStore(file);
  store.saveWorkoutAnalysis("w-oval", withRoute(oval), "2026-10-15T00:00:00Z");
  store.saveWorkoutAnalysis("w-long", withRoute(long), "2026-10-15T00:00:00Z");
  store.close();
});
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });

async function boot(hash: string, loadAnalysis?: any) {
  const data = new DashboardData(file, { timezone: "Asia/Jakarta" });
  opened.push(data);
  const handler = createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0, ...(loadAnalysis ? { loadAnalysis } : {}) });
  const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
  const csrf = lp.headers.getSetCookie()[0]!.split(";")[0]!.split("=")[1]!;
  const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
  const cookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
  const html = await (await handler(new Request(ORIGIN + "/dashboard", { headers: { cookie } }))).text();
  const errors: string[] = []; const vc = new VirtualConsole();
  vc.on("jsdomError", (e: Error) => errors.push(e.message));
  const fetches: string[] = [];
  const dom = new JSDOM(html, {
    url: ORIGIN + "/dashboard" + hash, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window: any) {
      window.fetch = async (u: string) => {
        fetches.push(u);
        const r = await handler(new Request(ORIGIN + u, { headers: { cookie } }));
        return { ok: r.ok, status: r.status, json: () => r.json() };
      };
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
  });
  await wait(300);
  return { doc: dom.window.document, win: dom.window, errors, fetches, close: () => dom.window.close() };
}


/** Zoom of the first tile and the extent of the drawn route inside the map viewBox (jsdom has no layout, so the map is 600x320). */
function mapFit(h: any) {
  const imgs = [...h.doc.querySelectorAll(".maptiles img")] as Element[];
  const z = Number(imgs[0]!.getAttribute("src").split("/")[3]);
  const svg = h.doc.querySelector("svg.route")!;
  const [, , W, H] = svg.getAttribute("viewBox")!.split(" ").map(Number);
  const nums = (svg.querySelector("path")!.getAttribute("d") as string).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs = nums.filter((_: number, i: number) => i % 2 === 0), ys = nums.filter((_: number, i: number) => i % 2 === 1);
  return { z, tiles: imgs.length, W, H, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

describe("route map fits the route closely", () => {
  it("zooms in on a small track so it fills a good share of the map, without leaving the padding", async () => {
    const h = await boot("#/workouts/w-oval");
    try {
      expect(h.errors).toEqual([]);
      const f = mapFit(h);
      expect(f.z).toBe(19); // capped at the max zoom (OSM serves up to 19)
      expect((f.maxY - f.minY) / f.H).toBeGreaterThan(0.2);
      expect(f.minX).toBeGreaterThanOrEqual(f.W * 0.09 - 1); expect(f.maxX).toBeLessThanOrEqual(f.W * 0.91 + 1);
      expect(f.minY).toBeGreaterThanOrEqual(f.H * 0.09 - 1); expect(f.maxY).toBeLessThanOrEqual(f.H * 0.91 + 1);
      expect(f.tiles).toBeLessThanOrEqual(48);
      // OSM is still the only tile host, and zoom in is capped at the max level (19)
      for (const img of [...h.doc.querySelectorAll(".maptiles img")] as Element[]) expect(img.getAttribute("src")).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
      (h.doc.querySelector('button[aria-label="Zoom in"]') as Element).click();
      (h.doc.querySelector('button[aria-label="Zoom in"]') as Element).click();
      expect(mapFit(h).z).toBe(19); // zoom in is capped too
      (h.doc.querySelector('button[aria-label="Fit route"]') as Element).click();
      expect(mapFit(h).z).toBe(f.z);
      expect(h.doc.querySelector(".maplegend")).not.toBeNull();
      expect(h.doc.querySelector(".mapbox .maptoggle")).not.toBeNull();
    } finally { h.close(); }
  });
  it("still fits a long route entirely inside the map", async () => {
    const h = await boot("#/workouts/w-long");
    try {
      const f = mapFit(h);
      expect(f.z).toBeLessThanOrEqual(12);
      expect(f.minX).toBeGreaterThanOrEqual(f.W * 0.09 - 1); expect(f.maxX).toBeLessThanOrEqual(f.W * 0.91 + 1);
      expect(f.minY).toBeGreaterThanOrEqual(f.H * 0.09 - 1); expect(f.maxY).toBeLessThanOrEqual(f.H * 0.91 + 1);
      expect(f.tiles).toBeLessThanOrEqual(48);
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });
});
