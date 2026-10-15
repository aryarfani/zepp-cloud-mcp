import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard } from "../../src/dashboard/handler";
import { DASHBOARD_JS } from "../../src/dashboard/ui";
import { MUSCLE_IDS } from "../../src/zepp/strength-muscle-catalog";
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
    expect(t.pts.length).toBeGreaterThan(1); expect(t.pts.length).toBeLessThanOrEqual(60);
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
      const th = run.children[0] as Element;
      expect(th.getAttribute("width")).toBe("64"); expect(th.getAttribute("height")).toBe("64");
      expect(th.getAttribute("viewBox")).toBe("0 0 64 64");
      expect(th.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
      expect(th.querySelectorAll("circle").length).toBe(1); // green start dot only
      // the route is drawn inside the tile with padding and at its true aspect ratio
      const nums = th.querySelector("polyline")!.getAttribute("points")!.split(" ").flatMap((p: string) => p.split(",").map(Number));
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(10); expect(Math.max(...nums)).toBeLessThanOrEqual(54);
      // body map: explicit size matching its viewBox aspect, natural proportions
      const bm = r.children[0] as Element;
      const [, , vw, vh] = bm.getAttribute("viewBox")!.split(" ").map(Number);
      expect(Number(bm.getAttribute("height"))).toBeGreaterThanOrEqual(56); expect(Number(bm.getAttribute("height"))).toBeLessThanOrEqual(68);
      expect(Math.abs(Number(bm.getAttribute("width")) / Number(bm.getAttribute("height")) - vw! / vh!)).toBeLessThan(0.02);
      expect(bm.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
      // only the selected card carries the teal outline class
      expect(h.doc.querySelectorAll(".wrow.sel").length).toBe(0);
      expect(text(run.querySelector(".pv"))).toMatch(/km$/);
      for (const id of ["w-str-none", "w-walk"]) {
        const plain = rowOf(h.doc, id).querySelector(".r")!;
        expect(plain.classList.contains("lead")).toBe(false);
        expect(plain.querySelector("svg")).toBeNull();
      }
    } finally { h.close(); }
  });
});

describe("selected card", () => {
  it("only the selected row carries the teal selection class, and it moves when another is opened", async () => {
    const h = await boot("#/workouts/w-str");
    try {
      const sel = () => [...h.doc.querySelectorAll(".wrow.sel")] as Element[];
      expect(sel().map(r => r.getAttribute("href"))).toEqual(["#/workouts/w-str"]);
      rowOf(h.doc, "w-walk").click(); h.win.location.hash = "#/workouts/w-walk"; await wait(300);
      expect(sel().map(r => r.getAttribute("href"))).toEqual(["#/workouts/w-walk"]);
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
      expect(text(card.querySelector(".bm-legend"))).toBe("Primary muscle usedSecondary muscle usedNon-target muscle");
      expect(text(card.querySelector(".bm-lists"))).toContain("Chest, Lats");
      expect(text(card.querySelector("h2"))).toBe("Muscles used"); // shown upper case by CSS
      expect(card.querySelectorAll(".bm-lbl span").length).toBe(2);
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

describe("body map artwork", () => {
  it("has a region for every muscle group of the catalogue (front or back) and no unknown ids", () => {
    const ids = new Set([...DASHBOARD_JS.matchAll(/\["([a-z_]+)", "M[^"]+"\]/g)].map(m => m[1]!));
    for (const id of MUSCLE_IDS) expect(ids.has(id), `region for ${id}`).toBe(true);
    for (const id of ids) expect((MUSCLE_IDS as readonly string[]).includes(id), `known id ${id}`).toBe(true);
  });

  it("draws every region in both halves of each figure, coloured per muscle, with the same figure in the card and in rows", async () => {
    const h = await boot("#/workouts/w-str");
    try {
      const card = h.doc.querySelector(".bm-card")!;
      const lg = card.querySelector("svg.bm-lg")!;
      const drawn = new Set([...lg.querySelectorAll("[data-m]")].map((e: Element) => e.getAttribute("data-m")));
      for (const id of MUSCLE_IDS) expect(drawn.has(id), `drawn ${id}`).toBe(true);
      // primary chest + lats, secondary front delts / biceps / triceps / upper back; everything else is the non-target grey
      const cls = (m: string) => [...lg.querySelectorAll(`[data-m="${m}"]`)].map((e: Element) => e.getAttribute("class"));
      expect(new Set(cls("chest"))).toEqual(new Set(["m-p"]));
      expect(new Set(cls("lats"))).toEqual(new Set(["m-p"]));
      expect(new Set(cls("biceps"))).toEqual(new Set(["m-s"]));
      expect(new Set(cls("quads"))).toEqual(new Set(["m-n"]));
      // a region exists in the front and back figure where the anatomy has it; each is mirrored (even count)
      expect(lg.querySelectorAll('[data-m="chest"]').length % 2).toBe(0);
      expect(lg.querySelectorAll('[data-m="chest"]').length).toBeGreaterThanOrEqual(2);
      expect(lg.querySelectorAll('[data-m="glutes"]').length).toBeGreaterThanOrEqual(2);
      // outline styling: white strokes, light grey / red / amber fills are set in the stylesheet
      const html = h.doc.documentElement.outerHTML;
      expect(html).toMatch(/\.bm \.m-p\{fill:#e8362f\}/);
      expect(html).toMatch(/\.bm \.m-s\{fill:#f7a600\}/);
      expect(html).toMatch(/\.bm \.m-n,\.bm \.m-p,\.bm \.m-s\{stroke:#fff/);
      // the row map is the same artwork, drawn with the same viewBox and an explicit square size
      const row = rowOf(h.doc, "w-str").querySelector("svg.bm-sm")!;
      expect(row.getAttribute("viewBox")).toBe(lg.getAttribute("viewBox"));
      expect(row.getAttribute("width")).toBe(row.getAttribute("height"));
      expect(row.querySelectorAll("path").length).toBe(lg.querySelectorAll("path").length);
      expect(row.querySelectorAll("title").length).toBe(0); // no per-row tooltips
    } finally { h.close(); }
  });
});
