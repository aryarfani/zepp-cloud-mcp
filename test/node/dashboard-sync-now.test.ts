import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard } from "../../src/dashboard/handler";
import { seedDashboardDb } from "./dashboard-seed";

type Element = any;
const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";
let dir: string, file: string;
const opened: DashboardData[] = [];
const wait = (ms = 40) => new Promise(r => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "zepp-sync-now-")); file = path.join(dir, "zepp.db"); seedDashboardDb(file); });
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });

/** A fake sync routine standing in for the real one: it writes a sync_runs row like the real one and flips `running`. */
function fakeSync(opts: { ok?: boolean; progress?: { done: number; total: number } | null; running?: boolean; withStart?: boolean } = {}) {
  const f = { running: !!opts.running, started: 0, progress: opts.progress ?? null, ok: opts.ok ?? true,
    finish() {
      const db = new DatabaseSync(file);
      db.prepare("INSERT INTO sync_runs (trigger, started_at, finished_at, ok, status, range_start, range_end, daily_rows, error_kind) VALUES (?,?,?,?,?,?,?,?,?)")
        .run("manual", "2026-10-15T14:00:00Z", "2026-10-15T14:00:09Z", f.ok ? 1 : 0, f.ok ? "ok" : "error", "2026-10-09", "2026-10-15", 7, f.ok ? null : "upstream");
      db.close(); f.running = false;
    } };
  const status = () => ({ enabled: true, running: f.running, schedule: { next_run_at: "2026-10-16T21:00:00.000Z", local_hour: 4 }, settings: { recent_days: 7 }, ...(f.progress ? { progress: f.progress } : {}) });
  const startSync = () => { if (f.running) return "running" as const; f.running = true; f.started++; return "started" as const; };
  return { f, status, ...(opts.withStart === false ? {} : { startSync }) };
}

async function boot(sync: ReturnType<typeof fakeSync>) {
  const data = new DashboardData(file, { timezone: "Asia/Jakarta" });
  opened.push(data);
  const handler = createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0, syncStatus: sync.status, ...(sync.startSync ? { startSync: sync.startSync } : {}) });
  const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
  const csrf = lp.headers.getSetCookie()[0]!.split(";")[0]!.split("=")[1]!;
  const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
  const cookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
  const html = await (await handler(new Request(ORIGIN + "/dashboard", { headers: { cookie } }))).text();
  const errors: string[] = []; const vc = new VirtualConsole();
  vc.on("jsdomError", (e: Error) => errors.push(e.message));
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const dom = new JSDOM(html, {
    url: ORIGIN + "/dashboard#/sync", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window: any) {
      window.fetch = async (u: string, init: any = {}) => {
        calls.push({ url: u, method: init.method ?? "GET", headers: init.headers ?? {} });
        const r = await handler(new Request(ORIGIN + u, { method: init.method ?? "GET", headers: { cookie, origin: ORIGIN, ...(init.headers ?? {}) } }));
        return { ok: r.ok, status: r.status, json: () => r.json() };
      };
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    }
  });
  await wait(300);
  return { dom, doc: dom.window.document as Element, errors, calls };
}

describe("Sync tab: Sync now", () => {
  it("shows a primary button with the 7-day hint, and the existing status panels", async () => {
    const { doc, errors } = await boot(fakeSync());
    const btn = doc.querySelector(".syncbtn");
    expect(btn).toBeTruthy();
    expect(text(btn)).toBe("Sync now");
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains("primary")).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy(); // refresh icon
    expect(text(doc.querySelector(".synchint"))).toBe("Fetches the last 7 days");
    expect(doc.querySelector(".pbar:not(.hidden)")).toBeNull();
    expect(text(doc.getElementById("view"))).toContain("Recent runs");
    expect(errors).toEqual([]);
  });

  it("click: POSTs with the CSRF token and no parameters, then shows Syncing… with an indeterminate bar, and finishes with a success message and a refreshed run list", async () => {
    const sync = fakeSync();
    const { doc, calls, errors } = await boot(sync);
    const before = doc.querySelectorAll("#view table tbody tr").length;
    doc.querySelector(".syncbtn").click();
    await wait(150);
    const post = calls.find(c => c.method === "POST")!;
    expect(post.url).toBe("/dashboard/api/sync/run");
    expect(post.headers["x-csrf-token"]).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(sync.f.started).toBe(1);
    const btn = doc.querySelector(".syncbtn");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(text(btn)).toBe("Syncing…");
    const bar = doc.querySelector(".pbar");
    expect(bar.classList.contains("hidden")).toBe(false);
    expect(bar.classList.contains("ind")).toBe(true); // the fake reports no progress, so none is invented
    expect(text(doc.querySelector(".synprog"))).toBe("");
    sync.f.finish();
    await wait(2500); // one poll interval
    const btn2 = doc.querySelector(".syncbtn");
    expect(btn2.disabled).toBe(false);
    expect(text(btn2)).toBe("Sync now");
    expect(doc.querySelector(".pbar").classList.contains("hidden")).toBe(true);
    expect(text(doc.querySelector(".synmsg"))).toBe("Sync finished.");
    expect(doc.querySelector(".synmsg").classList.contains("ok")).toBe(true);
    expect(doc.querySelectorAll("#view table tbody tr").length).toBeGreaterThan(before - 1);
    expect(text(doc.getElementById("view"))).toContain("manual");
    expect(errors).toEqual([]);
  }, 15000);

  it("shows a short failure message from the stored run (no upstream text) when the run failed", async () => {
    const sync = fakeSync({ ok: false });
    const { doc } = await boot(sync);
    doc.querySelector(".syncbtn").click();
    await wait(150);
    sync.f.finish();
    await wait(2500);
    const msg = doc.querySelector(".synmsg");
    expect(msg.classList.contains("bad")).toBe(true);
    expect(text(msg)).toBe("Sync failed (upstream). See Recent runs.");
    expect(doc.querySelector(".syncbtn").disabled).toBe(false);
  }, 15000);

  it("starts in the running state when a sync is already in progress, with real progress if the sync reports it", async () => {
    const { doc } = await boot(fakeSync({ running: true, progress: { done: 3, total: 7 } }));
    const btn = doc.querySelector(".syncbtn");
    expect(btn.disabled).toBe(true);
    expect(text(btn)).toBe("Syncing…");
    const bar = doc.querySelector(".pbar");
    expect(bar.classList.contains("ind")).toBe(false);
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
    expect(bar.querySelector(".fill").style.width).toBe("43%");
    expect(text(doc.querySelector(".synprog"))).toBe("Day 3 of 7");
  });

  it("has no button when manual sync is not wired up", async () => {
    const { doc } = await boot(fakeSync({ withStart: false }));
    expect(doc.querySelector(".syncbtn")).toBeNull();
    expect(text(doc.getElementById("view"))).toContain("Recent runs");
  });

  it("returns to idle when a poll sees that the sync has finished", async () => {
    const sync = fakeSync({ running: true });
    const { doc } = await boot(sync);
    sync.f.running = false; // the page still thinks it is running; nothing to click, so check the idle state after a poll
    await wait(2500);
    expect(doc.querySelector(".syncbtn").disabled).toBe(false);
  }, 15000);
});
