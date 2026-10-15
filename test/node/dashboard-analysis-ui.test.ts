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

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zepp-wa-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("w-walk", "walking", 6, "2026-10-10T01:00:00.000Z", "2026-10-10", "2026-10-10T02:00:00.000Z", 1800, 2000, 100, 100, 120, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  db.close();
  const store = new ZeppStore(file);
  store.saveWorkoutAnalysis(RUN, analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA), "2026-10-15T00:00:00Z");
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
  return { doc: dom.window.document, errors, fetches, close: () => dom.window.close() };
}
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("workout detail for running/walking/cycling", () => {
  it("renders cards, charts, zones, splits and a route for a stored analysis", async () => {
    const h = await boot("#/workouts/" + encodeURIComponent(RUN));
    try {
      expect(h.errors).toEqual([]);
      const wa = h.doc.querySelector(".wa")!;
      const labels = [...wa.querySelectorAll(".card .label")].map(text);
      expect(labels).toEqual(["Pace", "Cadence", "Elevation", "Training"]);
      expect(text(wa.querySelector(".card"))).toContain("7:49"); // 0.4688 s/m
      expect(wa.querySelectorAll("svg.chart").length).toBe(3); // pace, heart rate, elevation
      expect([...wa.querySelectorAll(".panel h2")].map(text)).toEqual(expect.arrayContaining(["Heart rate (bpm)", "Elevation (m)", "Heart-rate zones", "Splits", "Route"]));
      expect(wa.querySelectorAll(".zrow").length).toBe(5);
      const rows = wa.querySelectorAll("tbody tr");
      expect(rows.length).toBe(4);
      expect(text(rows[0]!)).toContain("7:50");
      expect(text(rows[3]!)).toContain("0.20 km");
      const route = wa.querySelector("svg.route")!;
      expect(route.querySelector("path")!.getAttribute("d")!.startsWith("M")).toBe(true);
      expect(text(wa)).toContain("OpenStreetMap contributors");
      expect(h.fetches.some(u => u.endsWith("/analysis"))).toBe(true);
      expect([...h.doc.querySelectorAll("[style]")].filter((e: Element) => !e.matches(".maptiles img")).length).toBe(0); // only map tiles are positioned through the CSSOM
    } finally { h.close(); }
  });

  it("shows a clear message when the detail is unavailable, and a route-less run still renders", async () => {
    const h = await boot("#/workouts/w-walk", async () => ({ status: "unavailable", reason: "rate_limited" }));
    try {
      expect(h.errors).toEqual([]);
      expect(text(h.doc.querySelector(".wa"))).toContain("Too many detail requests");
      expect(h.doc.querySelector(".wdetail .cards")).not.toBeNull(); // base summary cards stay
    } finally { h.close(); }
    const r = analyzeWorkout(runDetail({ gps: false }), RUN_HISTORY_EXTRA);
    const h2 = await boot("#/workouts/w-walk", async () => ({ status: "ok", analysis: r }));
    try {
      expect(h2.errors).toEqual([]);
      expect(h2.doc.querySelector("svg.route")).toBeNull();
      expect(text(h2.doc.querySelector(".wa"))).toContain("No GPS track");
      expect(h2.doc.querySelectorAll(".wa svg.chart").length).toBe(3);
    } finally { h2.close(); }
  });

  it("does not request analysis for strength workouts and keeps their layout", async () => {
    const h = await boot("#/workouts/w-str");
    try {
      expect(h.errors).toEqual([]);
      expect(h.fetches.some(u => u.endsWith("/analysis"))).toBe(false);
      expect(h.doc.querySelector(".wa")).toBeNull();
      expect(text(h.doc.querySelector(".wdetail"))).toContain("Bench Press");
    } finally { h.close(); }
  });

  it("adds the pace to the Overview last-workout card", async () => {
    const h = await boot("#/overview");
    try {
      expect(h.errors).toEqual([]);
      expect(text(h.doc.body)).toContain("6:00/km");
    } finally { h.close(); }
  });
});