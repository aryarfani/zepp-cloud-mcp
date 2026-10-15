import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { TILE_HOST, createDashboard } from "../../src/dashboard/handler";
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
  dir = mkdtempSync(path.join(tmpdir(), "zepp-rd-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  const ins = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const kinds: Array<[string, number]> = [["walking", 6], ["outdoor_running", 1], ["pool_swimming", 14], ["indoor_cycling", 9], ["hiking", 8], ["treadmill", 8]];
  for (let i = 0; i < 12; i++) {
    const [type, code] = kinds[i % kinds.length]!;
    const day = new Date(Date.UTC(2026, 8, 20) - i * 86400000); // September 2026
    ins.run(`s${i}`, type, code, day.toISOString(), day.toISOString().slice(0, 10), new Date(day.getTime() + 1800000).toISOString(), 1800, 3000, 200, 140, 160, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  }
  const day0 = new Date(Date.UTC(2026, 9, 14, 3, 0));
  ins.run("s-nodist", "yoga", 60, day0.toISOString(), day0.toISOString().slice(0, 10), new Date(day0.getTime() + 1800000).toISOString(), 1800, null, 100, 90, 110, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  db.close();
  const store = new ZeppStore(file);
  store.saveWorkoutAnalysis(RUN, analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA), "2026-10-15T00:00:00Z");
  store.close();
});
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });

async function login(handler: (r: Request) => Promise<Response>) {
  const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
  const csrf = lp.headers.getSetCookie()[0]!.split(";")[0]!.split("=")[1]!;
  const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
  return res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
}

async function boot(hash: string, opts: { storage?: Record<string, string>; online?: boolean } = {}) {
  const data = new DashboardData(file, { timezone: "Asia/Jakarta" });
  opened.push(data);
  const handler = createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0 });
  const cookie = await login(handler);
  const html = await (await handler(new Request(ORIGIN + "/dashboard", { headers: { cookie } }))).text();
  const errors: string[] = []; const vc = new VirtualConsole();
  vc.on("jsdomError", (e: Error) => errors.push(e.message));
  const fetches: string[] = [];
  const dom = new JSDOM(html, {
    url: ORIGIN + "/dashboard" + hash, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window: any) {
      for (const [k, v] of Object.entries(opts.storage ?? {})) window.localStorage.setItem(k, v);
      window.fetch = async (u: string) => {
        fetches.push(u);
        const r = await handler(new Request(ORIGIN + u, { headers: { cookie } }));
        return { ok: r.ok, status: r.status, json: () => r.json() };
      };
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      if (opts.online === false) Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    }
  });
  await wait(300);
  return { win: dom.window, doc: dom.window.document, errors, fetches, close: () => dom.window.close(), handler, cookie };
}

describe("sidebar", () => {
  it("collapses to an icon rail, keeps tooltips, and remembers the state in localStorage", async () => {
    const h = await boot("#/overview");
    try {
      const app = h.doc.getElementById("app")!, btn = h.doc.getElementById("collapse")!;
      expect(app.classList.contains("collapsed")).toBe(false);
      expect(btn.getAttribute("aria-expanded")).toBe("true");
      btn.click();
      expect(app.classList.contains("collapsed")).toBe(true);
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      expect(btn.getAttribute("aria-label")).toBe("Expand sidebar");
      expect(h.win.localStorage.getItem("zepp.sidebar")).toBe("collapsed");
      for (const a of h.doc.querySelectorAll("nav.menu a")) { expect(a.getAttribute("title")).toBeTruthy(); expect(a.getAttribute("aria-label")).toBe(a.getAttribute("title")); }
      btn.click();
      expect(app.classList.contains("collapsed")).toBe(false);
      expect(h.win.localStorage.getItem("zepp.sidebar")).toBe("expanded");
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
    const again = await boot("#/overview", { storage: { "zepp.sidebar": "collapsed" } });
    try {
      expect(again.doc.getElementById("app")!.classList.contains("collapsed")).toBe(true);
      expect(again.doc.getElementById("collapse")!.getAttribute("aria-label")).toBe("Expand sidebar");
    } finally { again.close(); }
  });
});

describe("workouts list: compact rows, sport dropdown and search", () => {
  it("renders dense rows with sport icons, a sport dropdown with counts, and the primary value on the right", async () => {
    const h = await boot("#/workouts");
    try {
      expect(h.errors).toEqual([]);
      const rows = [...h.doc.querySelectorAll(".wlist .wrow")];
      expect(rows.length).toBeGreaterThan(10);
      for (const r of rows) {
        expect(r.querySelector(".sico svg")).not.toBeNull();
        expect(r.querySelector(".wmain .t")).not.toBeNull();
        expect(text(r.querySelector(".wmain .sub"))).toMatch(/\d{1,2} \w{3} \u00b7 \d\d:\d\d/);
        expect(text(r.querySelector(".wmain .sub"))).not.toMatch(/sets?\b/); // no set count on the left
        expect(r.querySelector(".r .pv")).not.toBeNull();
      }
      // distance sports: km in bold on top, duration muted underneath
      const run = rows.find(r => /Outdoor running/.test(text(r)))!;
      expect(text(run.querySelector(".r .pv"))).toMatch(/^\d+\.\d\d km$/);
      expect(text(run.querySelector(".r .sv"))).toMatch(/^\d+h \d\dm$|^\d+m$/);
      // strength: sets are the primary value, duration underneath
      const strength = rows.find(r => /Strength/.test(text(r)))!;
      expect(text(strength.querySelector(".r .pv"))).toBe("3 sets");
      expect(text(strength.querySelector(".r .sv"))).toMatch(/\d/);
      // neither distance nor sets: duration is the only (primary) value
      const plain = rows.find(r => r.getAttribute("href") === "#/workouts/s-nodist")!;
      expect(plain.querySelector(".r")!.children.length).toBe(1);
      expect(text(plain.querySelector(".r .pv"))).toBe("30m");
      expect(strength.querySelector(".sico")!.classList.contains("f-str")).toBe(true);
      expect(rows.find(r => /Walking/.test(text(r)))!.querySelector(".sico")!.classList.contains("f-walk")).toBe(true);
      expect(rows.find(r => /Pool swimming/.test(text(r)))!.querySelector(".sico")!.classList.contains("f-swim")).toBe(true);
      expect(h.doc.querySelector(".chips")).toBeNull();
      const select = h.doc.querySelector(".wfilter select.wtype") as Element;
      expect(select.getAttribute("aria-label")).toBe("Filter by sport");
      const options = [...select.options] as Element[];
      expect(options[0].value).toBe("");
      expect(options[0].text).toMatch(/^All sports \(\d+\)$/);
      expect(options.length).toBeGreaterThanOrEqual(6);
      for (const o of options) expect(o.text).toMatch(/\(\d+\)$/);
      expect(select.value).toBe("");
      // the dropdown sits next to the search box
      expect(select.parentElement!.previousElementSibling!.querySelector("input[type=search]")).not.toBeNull();
      // filtering by choosing an option goes through the existing type API param
      const walking = options.find(o => /^Walking/.test(o.text))!;
      select.value = walking.value; select.dispatchEvent(new h.win.Event("change")); await wait(150);
      expect(h.fetches.at(-1)).toContain("type=walking");
      expect([...h.doc.querySelectorAll(".wlist .wrow")].every(r => /Walking/.test(text(r)))).toBe(true);
      expect(h.doc.querySelector(".wlist-pane input[type=search]")!.getAttribute("aria-label")).toBe("Search workouts");
    } finally { h.close(); }
  });

  it("searches through the API without rebuilding the list, and shows an empty state", async () => {
    const h = await boot("#/workouts");
    try {
      const list = h.doc.querySelector(".wlist")!;
      const input = h.doc.querySelector(".wsearch") as Element;
      input.value = "walk"; input.dispatchEvent(new h.win.Event("input")); await wait(450);
      expect(h.fetches.at(-1)).toContain("q=walk");
      const rows = [...h.doc.querySelectorAll(".wlist .wrow")];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(r => /Walking/.test(text(r)))).toBe(true);
      expect(h.doc.querySelector(".wlist")).toBe(list);
      input.value = "oct"; input.dispatchEvent(new h.win.Event("input")); await wait(450);
      expect([...h.doc.querySelectorAll(".wlist .wrow .sub")].every(e => / Oct /.test(text(e)))).toBe(true);
      input.value = "zzzz-nothing"; input.dispatchEvent(new h.win.Event("input")); await wait(450);
      expect(h.doc.querySelectorAll(".wlist .wrow")).toHaveLength(0);
      expect(text(h.doc.querySelector(".wlist > .wend"))).toBe("No workouts match");
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });

  it("selecting a workout does not rebuild the list, and the API search param is validated and authenticated", async () => {
    const h = await boot("#/workouts");
    try {
      const list = h.doc.querySelector(".wlist")!;
      (h.doc.querySelector(".wlist .wrow") as Element).click(); await wait(200);
      expect(h.doc.querySelector(".wlist")).toBe(list);
      expect(h.doc.querySelector(".hero h2")).not.toBeNull();
      const noAuth = await h.handler(new Request(ORIGIN + "/dashboard/api/workouts?q=walk"));
      expect(noAuth.status).toBe(401);
      const long = await h.handler(new Request(ORIGIN + "/dashboard/api/workouts?q=" + "x".repeat(61), { headers: { cookie: h.cookie } }));
      expect(long.status).toBe(400);
      const sql = await h.handler(new Request(ORIGIN + "/dashboard/api/workouts?q=" + encodeURIComponent("'; DROP TABLE workouts;--"), { headers: { cookie: h.cookie } }));
      expect(sql.status).toBe(200);
      expect((await sql.json() as any).total).toBe(0);
      const ok = await (await h.handler(new Request(ORIGIN + "/dashboard/api/workouts?q=walking", { headers: { cookie: h.cookie } }))).json() as any;
      expect(ok.total).toBeGreaterThan(0);
    } finally { h.close(); }
  });
});

describe("workout detail: hero, tiles and the route map", () => {
  const imgs = (doc: Element) => [...doc.querySelectorAll(".mapbox .maptiles img")] as Element[];

  it("shows a hero header and icon tiles", async () => {
    const h = await boot("#/workouts/" + encodeURIComponent(RUN));
    try {
      expect(h.errors).toEqual([]);
      expect(text(h.doc.querySelector(".hero h2"))).toContain("Outdoor running");
      expect(h.doc.querySelector(".hero .sico.lg.f-run svg")).not.toBeNull();
      const tiles = [...h.doc.querySelectorAll(".wdetail > .cards .card .label")].map(text);
      expect(tiles).toEqual(["Distance", "Duration", "Heart rate", "Energy"]);
      expect(h.doc.querySelectorAll(".wdetail > .cards .card .label svg").length).toBe(4);
      expect(h.doc.querySelectorAll(".wa svg.chart linearGradient").length).toBeGreaterThanOrEqual(6); // soft fills on the three charts
    } finally { h.close(); }
  });

  it("draws an OpenStreetMap tile map with markers, zoom controls and attribution, tiles only from the tile host", async () => {
    const h = await boot("#/workouts/" + encodeURIComponent(RUN));
    try {
      const box = h.doc.querySelector(".mapbox")!;
      const list = imgs(h.doc);
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(48);
      for (const img of list) {
        expect(img.getAttribute("src")).toMatch(new RegExp("^" + TILE_HOST.replace(/\./g, "\\.") + "/\\d+/\\d+/\\d+\\.png$"));
        expect(img.getAttribute("referrerpolicy")).toBe("origin");
        expect(img.getAttribute("alt")).toBe("");
      }
      const z0 = Number(list[0]!.getAttribute("src").split("/")[3]);
      expect(z0).toBeGreaterThan(10);
      const svg = box.querySelector("svg.route")!;
      expect(svg.querySelectorAll("circle").length).toBe(2);
      expect(svg.querySelector("path")!.getAttribute("d")).toMatch(/^M/);
      expect(text(box.querySelector(".mapattr"))).toBe("\u00a9 OpenStreetMap contributors");
      expect(box.querySelector(".mapattr a")!.getAttribute("rel")).toContain("noopener");
      const zoomIn = box.querySelector('button[aria-label="Zoom in"]') as Element;
      zoomIn.click();
      expect(Number(imgs(h.doc)[0]!.getAttribute("src").split("/")[3])).toBe(z0 + 1);
      (box.querySelector('button[aria-label="Zoom out"]') as Element).click();
      (box.querySelector('button[aria-label="Zoom out"]') as Element).click();
      expect(Number(imgs(h.doc)[0]!.getAttribute("src").split("/")[3])).toBe(z0 - 1);
      (box.querySelector('button[aria-label="Fit route"]') as Element).click();
      expect(Number(imgs(h.doc)[0]!.getAttribute("src").split("/")[3])).toBe(z0);
      // keyboard pan keeps rendering
      box.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await wait(60);
      expect(h.errors).toEqual([]);
      // only the API was fetched by script; images are the only other requests and they all point at the tile host
      expect(h.fetches.every(u => u.startsWith("/dashboard/api/"))).toBe(true);
    } finally { h.close(); }
  });

  it("falls back to the plain SVG track when tiles fail to load", async () => {
    const h = await boot("#/workouts/" + encodeURIComponent(RUN));
    try {
      const box = h.doc.querySelector(".mapbox")!;
      for (const img of imgs(h.doc).slice(0, 3)) img.dispatchEvent(new h.win.Event("error"));
      expect(box.classList.contains("plain")).toBe(true);
      expect(imgs(h.doc)).toHaveLength(0);
      expect(text(box.querySelector(".mapnote"))).toContain("plain GPS track");
      expect(box.querySelector("svg.route path")).not.toBeNull();
      expect(box.querySelector(".mapattr")!.classList.contains("hidden")).toBe(true);
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });

  it("can be switched off (remembered in localStorage) and never requests tiles when off or offline", async () => {
    const h = await boot("#/workouts/" + encodeURIComponent(RUN));
    try {
      const toggle = h.doc.querySelector(".maphead button") as Element;
      expect(toggle.textContent).toBe("Hide map");
      toggle.click();
      expect(h.win.localStorage.getItem("zepp.map")).toBe("off");
      expect(imgs(h.doc)).toHaveLength(0);
      expect(toggle.textContent).toBe("Show map");
      expect(text(h.doc.querySelector(".mapnote"))).toMatch(/plain GPS track/i);
      toggle.click();
      expect(imgs(h.doc).length).toBeGreaterThan(0);
    } finally { h.close(); }
    const off = await boot("#/workouts/" + encodeURIComponent(RUN), { storage: { "zepp.map": "off" } });
    try { expect(imgs(off.doc)).toHaveLength(0); expect(off.doc.querySelector(".mapbox svg.route path")).not.toBeNull(); } finally { off.close(); }
    const offline = await boot("#/workouts/" + encodeURIComponent(RUN), { online: false });
    try { expect(imgs(offline.doc)).toHaveLength(0); expect(text(offline.doc.querySelector(".mapnote"))).toContain("Offline"); } finally { offline.close(); }
  });
});

describe("every route renders with fixture data", () => {
  it("shows skeletons first and then real content without JS errors on all views", async () => {
    const routes = ["#/overview", "#/sleep", "#/activity", "#/charge", "#/workouts", "#/exercises", "#/workouts/exercises", "#/workouts/w-str", "#/workouts/" + encodeURIComponent(RUN), "#/weight", "#/sync"];
    for (const hash of routes) {
      const h = await boot(hash);
      try {
        expect(h.errors, hash).toEqual([]);
        const view = h.doc.getElementById("view")!;
        expect(view.querySelector(".skel"), hash + " still loading").toBeNull();
        expect(view.querySelector(".err"), hash + " error").toBeNull();
        expect(text(view).length, hash).toBeGreaterThan(20);
        expect(text(h.doc.getElementById("subtitle"))).not.toBe("");
        expect(h.fetches.every(u => u.startsWith("/dashboard/api/")), hash).toBe(true);
      } finally { h.close(); }
    }
  });
});

describe("exercises page and sidebar", () => {
  it("has Exercises as its own sidebar item after Workouts, with a different icon, and no tab bar on Workouts", async () => {
    const h = await boot("#/workouts");
    try {
      const links = [...h.doc.querySelectorAll("nav.menu a")] as Element[];
      expect(links.map(a => a.getAttribute("data-route"))).toEqual(["overview", "sleep", "activity", "charge", "workouts", "exercises", "weight", "sync"]);
      const paths = Object.fromEntries(links.map(a => [a.getAttribute("data-route"), a.querySelector("path")!.getAttribute("d")]));
      expect(paths.exercises).not.toBe(paths.workouts);
      expect(h.doc.querySelector(".tabs")).toBeNull();
      expect(h.doc.querySelector(".split")).not.toBeNull();
      h.win.location.hash = "#/exercises"; await wait(300);
      expect(h.doc.querySelector("nav.menu a.active")!.getAttribute("data-route")).toBe("exercises");
      expect(text(h.doc.getElementById("title"))).toBe("Exercises");
      expect(h.doc.querySelectorAll("#view tbody tr").length).toBeGreaterThan(0);
      expect(h.doc.getElementById("content")!.classList.contains("fit")).toBe(false);
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
    const old = await boot("#/workouts/exercises");
    try {
      expect(old.win.location.hash).toBe("#/exercises");
      expect(old.doc.querySelector("nav.menu a.active")!.getAttribute("data-route")).toBe("exercises");
      expect(old.doc.querySelectorAll("#view tbody tr").length).toBeGreaterThan(0);
    } finally { old.close(); }
  });
});
