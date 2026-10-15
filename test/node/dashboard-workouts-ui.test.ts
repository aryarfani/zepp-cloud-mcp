import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard } from "../../src/dashboard/handler";
import { seedDashboardDb } from "./dashboard-seed";

// The Node test config has no DOM lib; jsdom nodes are treated as loosely typed.
type Document = any; type Element = any; type HTMLElement = any; type HTMLSelectElement = any; type HTMLButtonElement = any;
const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";
let dir: string;
let file: string;
const opened: DashboardData[] = [];
const wait = (ms = 40) => new Promise(r => setTimeout(r, ms));

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zepp-wk-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  const ins = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  // 60 more workouts: 40 outdoor_running + 20 walking, newest first by index
  for (let i = 0; i < 60; i++) {
    const day = new Date(Date.UTC(2026, 9, 10) - i * 86400000);
    const iso = day.toISOString();
    ins.run(`w${i}`, i % 3 === 2 ? "walking" : "outdoor_running", i % 3 === 2 ? 6 : 1, iso, iso.slice(0, 10), new Date(day.getTime() + 1800000).toISOString(), 1800, 3000, 200, 140, 160, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  }
  db.close();
});
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });

interface Harness {
  win: any; doc: Document; errors: string[]; fetches: string[]; observers: any[];
  fire(i?: number): Promise<void>; hold(): { release: () => void }; close(): void;
}

async function boot(hash: string, opts: { io?: boolean } = {}): Promise<Harness> {
  const data = new DashboardData(file, { timezone: "Asia/Jakarta" });
  opened.push(data);
  const handler = createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0 });
  const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
  const csrf = lp.headers.getSetCookie()[0]!.split(";")[0]!.split("=")[1]!;
  const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
  const cookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
  const html = await (await handler(new Request(ORIGIN + "/dashboard", { headers: { cookie } }))).text();
  const errors: string[] = []; const vc = new VirtualConsole();
  vc.on("jsdomError", (e: Error) => errors.push(e.message));
  const fetches: string[] = []; const observers: any[] = [];
  let gate: Promise<void> | null = null;
  const dom = new JSDOM(html, {
    url: ORIGIN + "/dashboard" + hash, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window: any) {
      window.fetch = async (u: string) => {
        fetches.push(u);
        if (gate && u.includes("offset=") && !u.includes("offset=0")) await gate;
        const r = await handler(new Request(ORIGIN + u, { headers: { cookie } }));
        return { ok: r.ok, status: r.status, json: () => r.json() };
      };
      if (opts.io !== false) {
        window.IntersectionObserver = class {
          cb: any; opts: any; targets = new Set<Element>(); disconnected = false;
          constructor(cb: any, o: any) { this.cb = cb; this.opts = o; observers.push(this); }
          observe(el: Element) { this.targets.add(el); }
          unobserve(el: Element) { this.targets.delete(el); }
          disconnect() { this.disconnected = true; this.targets.clear(); }
        };
      }
    }
  });
  await wait(250);
  return {
    win: dom.window, doc: dom.window.document, errors, fetches, observers,
    async fire(i = 0) { const o = observers[i]; for (const target of [...o.targets]) o.cb([{ isIntersecting: true, target }]); await wait(); },
    hold() { let release!: () => void; gate = new Promise<void>(r => { release = () => { gate = null; r(); }; }); return { release }; },
    close() { dom.window.close(); }
  };
}

const rows = (h: Harness) => h.doc.querySelectorAll(".wlist .wrow");
const pageFetches = (h: Harness) => h.fetches.filter(u => u.startsWith("/dashboard/api/workouts?"));
const rowFor = (h: Harness, id: string) => h.doc.querySelector(`.wlist a.wrow[href="#/workouts/${id}"]`) as HTMLElement;
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("workouts: infinite scroll", () => {
  it("watches a sentinel inside the list scroll container and loads pages until the end", async () => {
    const h = await boot("#/workouts");
    try {
      expect(h.errors).toEqual([]);
      expect(h.observers).toHaveLength(1);
      const list = h.doc.querySelector(".wlist")!;
      expect(h.observers[0].opts.root).toBe(list);
      const end = h.doc.querySelector(".wlist > .wend")!;
      expect([...h.observers[0].targets]).toEqual([end]);
      expect(rows(h)).toHaveLength(25);
      expect(h.doc.querySelector("button")?.textContent).not.toBe("Load more"); // no fallback button while IntersectionObserver exists
      expect(text(h.doc.querySelector(".wlist-pane .seg"))).toContain("25 of 62");
      await h.fire(); expect(rows(h)).toHaveLength(50);
      await h.fire(); expect(rows(h)).toHaveLength(62);
      expect(text(end)).toBe("End of list");
      expect(h.observers[0].targets.size).toBe(0);
      const before = pageFetches(h).length;
      await h.fire(); // nothing is observed any more and a stray callback must not fetch
      h.observers[0].cb([{ isIntersecting: true, target: end }]); await wait();
      expect(pageFetches(h)).toHaveLength(before);
      expect(new Set([...rows(h)].map(r => r.getAttribute("href"))).size).toBe(62); // no duplicates
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });

  it("never runs two page loads at once", async () => {
    const h = await boot("#/workouts");
    try {
      const gate = h.hold();
      const o = h.observers[0], end = h.doc.querySelector(".wlist > .wend")!;
      o.cb([{ isIntersecting: true, target: end }]); o.cb([{ isIntersecting: true, target: end }]); o.cb([{ isIntersecting: true, target: end }]);
      await wait();
      expect(text(end)).toBe("Loading...");
      expect(pageFetches(h).filter(u => u.includes("offset=25"))).toHaveLength(1);
      gate.release(); await wait();
      expect(rows(h)).toHaveLength(50);
    } finally { h.close(); }
  });

  it("respects the type filter and drops a stale page that arrives after the filter changed", async () => {
    const h = await boot("#/workouts");
    try {
      const chip = (label: string) => [...h.doc.querySelectorAll(".wlist-pane .chips button")].find(b => (b.textContent ?? "").startsWith(label)) as HTMLButtonElement;
      const pick = async (label: string) => { chip(label).click(); await wait(); };
      await pick("Walking");
      expect(pageFetches(h).at(-1)).toContain("type=walking");
      expect(rows(h)).toHaveLength(20);
      expect([...rows(h)].every(r => /Walking/.test(r.textContent ?? ""))).toBe(true);
      expect(text(h.doc.querySelector(".wlist > .wend"))).toBe("End of list");

      expect(chip("Walking").getAttribute("aria-pressed")).toBe("true");
      await pick("Outdoor running");
      expect(rows(h)).toHaveLength(25);
      const gate = h.hold();
      await h.fire(); // page 2 of the running list is now in flight...
      await pick("Walking"); // ...and the user switches filter
      gate.release(); await wait();
      expect(rows(h)).toHaveLength(20); // the stale running page was discarded
      expect([...rows(h)].every(r => /Walking/.test(r.textContent ?? ""))).toBe(true);
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });

  it("falls back to a Load more button when IntersectionObserver is unavailable", async () => {
    const h = await boot("#/workouts", { io: false });
    try {
      expect(h.observers).toHaveLength(0);
      const btn = [...h.doc.querySelectorAll(".wlist .wend button")].find(b => b.textContent === "Load more") as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click(); await wait();
      expect(rows(h)).toHaveLength(50);
    } finally { h.close(); }
  });
});

describe("workouts: detail pane is independent of the list", () => {
  it("opening, switching and closing a workout keeps the same list element, rows, scroll and loaded pages", async () => {
    const h = await boot("#/workouts");
    try {
      await h.fire();
      const list = h.doc.querySelector(".wlist") as HTMLElement;
      Object.defineProperty(list, "scrollTop", { writable: true, value: 0 });
      list.scrollTop = 321; list.dispatchEvent(new h.win.Event("scroll"));
      const firstRow = rows(h)[0]!;
      const listFetches = pageFetches(h).length, observerCount = h.observers.length;

      rowFor(h, "w3").click(); await wait(150); // a click keeps the list where it is
      expect(h.doc.querySelector(".wlist")).toBe(list);
      expect(rows(h)[0]).toBe(firstRow);
      expect(rows(h)).toHaveLength(50);
      expect(h.doc.querySelectorAll(".wrow.sel")).toHaveLength(1);
      expect(h.doc.querySelector(".wrow.sel")?.getAttribute("href")).toBe("#/workouts/w3");
      expect(text(h.doc.querySelector(".wdetail"))).toContain("Duration");
      expect(h.doc.querySelector(".split")?.classList.contains("has-detail")).toBe(true);
      expect(list.scrollTop).toBe(321);

      rowFor(h, "w7").click(); await wait(150);
      expect(h.doc.querySelector(".wlist")).toBe(list);
      expect(h.doc.querySelectorAll(".wrow.sel")).toHaveLength(1);
      expect(h.doc.querySelector(".wrow.sel")?.getAttribute("href")).toBe("#/workouts/w7");
      expect(list.scrollTop).toBe(321);
      expect(pageFetches(h)).toHaveLength(listFetches); // the list was not refetched
      expect(h.observers).toHaveLength(observerCount); // nor was the observer recreated

      // a route change that did not start from a click (back button, typed link) scrolls the selected row into view
      const far = rowFor(h, "w20");
      Object.defineProperty(far, "offsetTop", { value: 1000 }); Object.defineProperty(far, "offsetHeight", { value: 50 });
      Object.defineProperty(list, "clientHeight", { value: 400 });
      list.scrollTop = 0;
      h.win.location.hash = "#/workouts/w20"; await wait(150);
      expect(list.scrollTop).toBe(658);
      list.scrollTop = 321; list.dispatchEvent(new h.win.Event("scroll"));

      // stacked layout hides the list while a detail is open, which resets its scroll: back restores it
      list.scrollTop = 0;
      h.win.location.hash = "#/workouts"; await wait(100);
      expect(h.doc.querySelector(".wlist")).toBe(list);
      expect(h.doc.querySelector(".split")?.classList.contains("has-detail")).toBe(false);
      expect(h.doc.querySelectorAll(".wrow.sel")).toHaveLength(0);
      expect(list.scrollTop).toBe(321);
      expect(rows(h)).toHaveLength(50);
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });

  it("direct link: highlights the row when loaded, still shows the detail when it is not loaded yet", async () => {
    const loaded = await boot("#/workouts/w4");
    try {
      expect(loaded.doc.querySelector(".wrow.sel")?.getAttribute("href")).toBe("#/workouts/w4");
      expect(text(loaded.doc.querySelector(".wdetail"))).toContain("Duration");
      expect(loaded.errors).toEqual([]);
    } finally { loaded.close(); }
    const far = await boot("#/workouts/w59");
    try {
      expect(rows(far)).toHaveLength(25);
      expect(far.doc.querySelector(".wrow.sel")).toBeNull();
      expect(text(far.doc.querySelector(".wdetail"))).toContain("Duration");
      await far.fire(); await far.fire(); // once its page loads the row is highlighted
      expect(far.doc.querySelector(".wrow.sel")?.getAttribute("href")).toBe("#/workouts/w59");
      expect(far.errors).toEqual([]);
    } finally { far.close(); }
  });

  it("uses a fixed-height layout for the list view only, and the Exercises tab still renders", async () => {
    const h = await boot("#/workouts");
    try {
      const content = h.doc.getElementById("content")!;
      expect(content.classList.contains("fit")).toBe(true);
      h.win.location.hash = "#/workouts/exercises"; await wait(250);
      expect(content.classList.contains("fit")).toBe(false);
      expect(h.doc.querySelectorAll("#view tbody tr").length).toBeGreaterThan(0);
      expect(h.observers.at(0)?.disconnected).toBe(true); // the list observer is released when the list goes away
      h.win.location.hash = "#/workouts"; await wait(250);
      expect(content.classList.contains("fit")).toBe(true);
      expect(rows(h).length).toBeGreaterThan(0);
      h.win.location.hash = "#/sleep"; await wait(200);
      expect(content.classList.contains("fit")).toBe(false);
      expect(h.errors).toEqual([]);
    } finally { h.close(); }
  });
});