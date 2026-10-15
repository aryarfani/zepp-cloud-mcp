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
  dir = mkdtempSync(path.join(tmpdir(), "zepp-mus-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  const w = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  // a strength workout whose ids carry no muscle data, and a walk without any stored analysis
  w.run("w-str-none", "strength_training", 52, "2026-10-12T01:00:00.000Z", "2026-10-12", "2026-10-12T02:00:00.000Z", 1800, null, 100, 110, 130, "device", "{}", "{}", 1, "2026-10-15T00:00:00Z");
  w.run("w-walk", "walking", 6, "2026-10-10T01:00:00.000Z", "2026-10-10", "2026-10-10T02:00:00.000Z", 1800, 2000, 100, 100, 120, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  const s = db.prepare("INSERT INTO strength_sets (workout_id, seq, set_no, exercise, action_type, reps, weight_kg, duration_s, avg_hr_bpm) VALUES (?,?,?,?,?,?,?,?,?)");
  s.run("w-str-none", 0, 0, "unknown_0", 0, 10, null, 31, 98);
  s.run("w-str-none", 1, 1, "unknown_9999", 9999, 8, 15, 40, 110);
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
  return { doc: dom.window.document, win: dom.window, errors, fetches, close: () => dom.window.close() };
}

const rowOf = (doc: Element, id: string) => doc.querySelector('.wlist a.wrow[href="#/workouts/' + encodeURIComponent(id) + '"]') as Element;

describe("list API carries cheap muscle and route data", () => {
  it("adds muscles to strength rows with muscle data and a thumbnail to analysed routes, nothing else", () => {
    const data = new DashboardData(file, { timezone: "Asia/Jakarta" }); opened.push(data);
    const rows = (data.workouts({ limit: 25, offset: 0 }) as any).workouts as any[];
    const by = (id: string) => rows.find(r => r.workout_id === id);
    expect(by("w-str").muscles).toEqual({ p: ["chest", "lats"], s: ["front_delts", "biceps", "triceps", "upper_back"] });
    expect(by("w-str").thumb).toBeUndefined();
    expect("muscles" in by("w-str-none")).toBe(false);
    const t = by(RUN).thumb;
    expect(t.pts.length).toBeGreaterThan(1); expect(t.pts.length).toBeLessThanOrEqual(30);
    expect(by(RUN).muscles).toBeUndefined();
    expect("thumb" in by("w-walk")).toBe(false);
    expect(JSON.stringify(by(RUN).thumb)).not.toMatch(/106\.\d{3}|-6\.\d{3}/);
  });
  it("adds the aggregated muscles to the workout detail", () => {
    const data = new DashboardData(file, { timezone: "Asia/Jakarta" }); opened.push(data);
    expect((data.workout("w-str") as any).muscles.p).toEqual(["chest", "lats"]);
    expect((data.workout("w-str-none") as any).muscles).toBeNull();
  });
});

describe("list rows", () => {
  it("shows a compact body map left of the sets, a route thumbnail left of the distance, and leaves other rows alone", async () => {
    const h = await boot("#/workouts");
    try {
      expect(h.errors).toEqual([]);
      const str = rowOf(h.doc, "w-str");
      const r = str.querySelector(".r.lead")!;
      expect(r.children[0].matches("svg.bm.bm-sm")).toBe(true);
      expect(r.children[1].classList.contains("rt")).toBe(true);
      expect(text(r.querySelector(".pv"))).toBe("3 sets");
      expect(r.querySelectorAll(".sv").length).toBe(1);
      expect(r.querySelectorAll("svg.bm .m-p").length).toBeGreaterThan(0);
      expect(r.querySelectorAll("svg.bm .m-s").length).toBeGreaterThan(0);
      const run = rowOf(h.doc, RUN).querySelector(".r.lead")!;
      expect(run.children[0].matches("svg.rthumb")).toBe(true);
      expect(run.querySelectorAll("svg.rthumb polyline").length).toBe(1);
      expect(text(run.querySelector(".pv"))).toMatch(/km$/);
      for (const id of ["w-str-none", "w-walk"]) {
        const plain = rowOf(h.doc, id).querySelector(".r")!;
        expect(plain.classList.contains("lead")).toBe(false);
        expect(plain.querySelector("svg")).toBeNull();
      }
    } finally { h.close(); }
  });
});

describe("strength detail", () => {
  it("shows a Muscles used card under the header with figures, legend and an estimate note", async () => {
    const h = await boot("#/workouts/w-str");
    try {
      expect(h.errors).toEqual([]);
      const pane = h.doc.querySelector(".wdetail")!;
      const kids = [...pane.children] as Element[];
      const card = pane.querySelector(".bm-card")!;
      expect(kids.indexOf(card)).toBe(kids.findIndex((k: Element) => k.classList.contains("hero")) + 1);
      expect(text(card.querySelector("h2"))).toBe("Muscles used");
      expect(card.querySelectorAll("svg.bm.bm-lg").length).toBe(1);
      expect(text(card.querySelector(".bm-lbl"))).toBe("FrontBack");
      expect(card.querySelectorAll(".m-p").length).toBeGreaterThan(0);
      expect(card.querySelectorAll(".m-s").length).toBeGreaterThan(0);
      expect(text(card)).toContain("Chest");
      expect(text(card)).toMatch(/Primary muscles/);
      expect(text(card)).toMatch(/Secondary muscles/);
      expect(text(card)).toMatch(/Not targeted/);
      expect(text(card)).toMatch(/Estimate/i);
      expect(text(pane)).toContain("Bench Press"); // the exercise table is still there
    } finally { h.close(); }
  });
  it("shows no map when no set has muscle data", async () => {
    const h = await boot("#/workouts/w-str-none");
    try {
      expect(h.errors).toEqual([]);
      expect(h.doc.querySelector(".bm-card")).toBeNull();
      expect(h.doc.querySelector(".wdetail svg.bm")).toBeNull();
    } finally { h.close(); }
  });
});

describe("sport dropdown keyboard and ARIA", () => {
  const key = (h: any, el: Element, k: string) => el.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  it("opens with the arrow key, filters, moves with arrows, picks with Enter and closes with Escape", async () => {
    const h = await boot("#/workouts");
    try {
      const btn = h.doc.querySelector("button.wtype") as Element;
      const menu = h.doc.querySelector(".wmenu") as Element;
      const search = menu.querySelector("input") as Element;
      key(h, btn, "ArrowDown");
      expect(btn.getAttribute("aria-expanded")).toBe("true");
      expect(h.doc.activeElement).toBe(search);
      const opts = () => [...menu.querySelectorAll("[role=option]")] as Element[];
      expect(search.getAttribute("aria-activedescendant")).toBe(opts()[0]!.id);
      key(h, search, "ArrowDown");
      expect(opts()[1]!.classList.contains("act")).toBe(true);
      expect(search.getAttribute("aria-activedescendant")).toBe(opts()[1]!.id);
      key(h, search, "ArrowUp"); key(h, search, "ArrowUp");
      expect(opts()[0]!.classList.contains("act")).toBe(true); // clamped at the top
      search.value = "walk"; search.dispatchEvent(new h.win.Event("input"));
      expect(opts().map(o => text(o.querySelector(".nm")))).toEqual(["Walking"]);
      search.value = "zzz"; search.dispatchEvent(new h.win.Event("input"));
      expect(opts()).toHaveLength(0);
      expect(text(menu)).toContain("No sports match");
      search.value = "walk"; search.dispatchEvent(new h.win.Event("input"));
      key(h, search, "Enter"); await wait(150);
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      expect(menu.hasAttribute("hidden")).toBe(true);
      expect(text(btn)).toBe("Walking");
      expect(h.fetches.at(-1)).toContain("type=walking");
      expect(h.doc.activeElement).toBe(btn);
      // Escape closes without changing the filter
      btn.click();
      expect(btn.getAttribute("aria-expanded")).toBe("true");
      expect(opts().find(o => o.getAttribute("aria-selected") === "true")!.querySelector(".nm")!.textContent).toBe("Walking");
      key(h, menu.querySelector("input"), "Escape");
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      expect(text(btn)).toBe("Walking");
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });
  it("closes on a click outside and with a second click on the button", async () => {
    const h = await boot("#/workouts");
    try {
      const btn = h.doc.querySelector("button.wtype") as Element;
      btn.click();
      expect(btn.getAttribute("aria-expanded")).toBe("true");
      h.doc.body.dispatchEvent(new h.win.Event("pointerdown", { bubbles: true }));
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      btn.click(); btn.click();
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    } finally { h.close(); }
  });
});
