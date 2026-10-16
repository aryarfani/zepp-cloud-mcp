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
function fakeSync(opts: { ok?: boolean; progress?: any; running?: boolean; withStart?: boolean } = {}) {
  const f = { running: !!opts.running, started: 0, progress: opts.progress ?? null, ok: opts.ok ?? true,
    finish() {
      const db = new DatabaseSync(file);
      db.prepare("INSERT INTO sync_runs (trigger, started_at, finished_at, ok, status, range_start, range_end, daily_rows, error_kind) VALUES (?,?,?,?,?,?,?,?,?)")
        .run("manual", "2026-10-15T14:00:00Z", "2026-10-15T14:00:09Z", f.ok ? 1 : 0, f.ok ? "ok" : "error", "2026-10-09", "2026-10-15", 7, f.ok ? null : "upstream");
      db.close(); f.running = false;
    } };
  const status = () => ({ enabled: true, running: f.running, schedule: { next_run_at: "2026-10-16T21:00:00.000Z", local_hour: 4 }, settings: { recent_days: 7, overlap_days: 2 }, ...(f.progress ? { progress: f.progress } : {}) });
  const startSync = () => { if (f.running) return "running" as const; f.running = true; f.started++; return "started" as const; };
  return { f, status, ...(opts.withStart === false ? {} : { startSync }) };
}

async function boot(sync: ReturnType<typeof fakeSync>, hash = "#/sync") {
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
    url: ORIGIN + "/dashboard" + hash, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
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
  it("shows a primary button with the since-last-sync hint, and the existing status panels", async () => {
    const { doc, errors } = await boot(fakeSync());
    const btn = doc.querySelector(".syncbtn");
    expect(btn).toBeTruthy();
    expect(text(btn)).toBe("Sync now");
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains("primary")).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy(); // refresh icon
    expect(text(doc.querySelector(".synchint"))).toBe("Fetches since the last sync (+2 days overlap)");
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

  const STEPS = ["Daily & sleep", "Workouts", "Strength", "Hybrid Charge", "Emotion", "Blood pressure", "Routes (workout details)", "Weight", "Streams"]
    .map((label, i) => ({ id: ["daily_sleep", "workouts", "strength", "charge", "emotion", "blood_pressure", "routes", "weight", "streams"][i], label }));
  const progress = (current: number, over: any = {}) => ({ steps: STEPS, current, window_start: "2026-10-13", window_end: "2026-10-15", mode: "overlap", since: "2026-10-15", overlap_days: 2, ...over });

  it("starts in the running state when a sync is already in progress, with the step stepper from the reported progress", async () => {
    const { doc } = await boot(fakeSync({ running: true, progress: progress(3) }));
    const btn = doc.querySelector(".syncbtn");
    expect(btn.disabled).toBe(true);
    expect(text(btn)).toBe("Syncing…");
    expect(doc.querySelector(".pbar").classList.contains("hidden")).toBe(true); // the indeterminate bar is only the fallback
    const items = [...doc.querySelectorAll(".stepper li")] as Element[];
    expect(items.length).toBe(9);
    expect(items.map(li => text(li.querySelector(".slbl")))).toEqual(STEPS.map(x => x.label));
    expect(items.map(li => li.className)).toEqual(["step done", "step done", "step done", "step cur", "step pend", "step pend", "step pend", "step pend", "step pend"]);
    expect(items[0].querySelector("svg")).toBeTruthy(); // check mark on done steps
    expect(text(items[4].querySelector(".sdot"))).toBe("5");
    expect(items[3].getAttribute("aria-current")).toBe("step");
    expect(text(doc.querySelector(".stepline"))).toBe("Step 4 of 9: Hybrid Charge");
    expect(text(doc.querySelector(".stepsub"))).toBe("Fetching since 13 Oct (last sync + 2 days overlap)");
    expect(text(doc.querySelector(".steplast"))).toMatch(/^Last sync: \d{2} \w{3}, \d{2}:\d{2}$/);
  });

  it("says first sync backfill, and shows the window number for chunked windows", async () => {
    const { doc } = await boot(fakeSync({ running: true, progress: progress(1, { mode: "backfill", since: null, window_start: "2026-07-18", chunk: { index: 2, total: 7 } }) }));
    expect(text(doc.querySelector(".stepsub"))).toBe("Fetching since 18 Jul (first sync backfill)");
    expect(text(doc.querySelector(".stepline"))).toBe("Step 2 of 9: Workouts (window 2 of 7)");
  });

  it("falls back to the indeterminate bar when the sync reports no (or unusable) progress", async () => {
    const { doc } = await boot(fakeSync({ running: true, progress: { steps: [{ id: "bad id", label: "x" }], current: 0, window_start: "x" } }));
    expect(doc.querySelector(".stepper").classList.contains("hidden")).toBe(true);
    const bar = doc.querySelector(".pbar");
    expect(bar.classList.contains("hidden")).toBe(false);
    expect(bar.classList.contains("ind")).toBe(true);
  });

  it("advances the stepper while polling, without rebuilding the steps, and hides it when the run ends", async () => {
    const sync = fakeSync({ running: true, progress: progress(0) });
    const { doc } = await boot(sync);
    const first = doc.querySelector(".stepper li");
    expect(text(doc.querySelector(".stepline"))).toBe("Step 1 of 9: Daily & sleep");
    sync.f.progress = progress(5);
    await wait(2500);
    expect(text(doc.querySelector(".stepline"))).toBe("Step 6 of 9: Blood pressure");
    expect(doc.querySelector(".stepper li")).toBe(first); // same elements, classes updated (keeps the pulse animation steady)
    expect([...doc.querySelectorAll(".stepper li.done")].length).toBe(5);
    sync.f.progress = null; sync.f.finish();
    await wait(2500);
    expect(doc.querySelector(".stepper").classList.contains("hidden")).toBe(true);
    expect(text(doc.querySelector(".synmsg"))).toBe("Sync finished.");
  }, 20000);

  it("shows only whitelisted progress fields from the status API (no extra or secret fields)", async () => {
    const sync = fakeSync({ running: true, progress: { ...progress(2), token: "SECRET-TOKEN", db: "/secret/path.db", steps: STEPS.map(x => ({ ...x, url: "https://api.example/secret" })) } });
    const data = new DashboardData(file, { timezone: "Asia/Jakarta" }); opened.push(data);
    const handler = createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0, syncStatus: sync.status, startSync: sync.startSync! });
    const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
    const csrf = lp.headers.getSetCookie()[0]!.split(";")[0]!.split("=")[1]!;
    const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
    const cookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
    const body = await (await handler(new Request(ORIGIN + "/dashboard/api/status", { headers: { cookie } }))).json() as any;
    expect(Object.keys(body.sync.progress).sort()).toEqual(["chunk", "current", "mode", "overlap_days", "since", "steps", "total", "window_end", "window_start"]);
    expect(body.sync.progress).toMatchObject({ current: 2, total: 9, window_start: "2026-10-13", mode: "overlap" });
    expect(body.sync.overlap_days).toBe(2);
    expect(JSON.stringify(body)).not.toMatch(/SECRET|secret/);
    sync.f.running = false;
    const idle = await (await handler(new Request(ORIGIN + "/dashboard/api/status", { headers: { cookie } }))).json() as any;
    expect(idle.sync.progress).toBeNull(); // never shown when nothing is running
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

describe("sidebar Sync item while a sync runs (every page)", () => {
  const nav = (doc: Element) => doc.querySelector('nav.menu a[data-route="sync"]');
  const statusCalls = (calls: Array<{ url: string }>) => calls.filter(c => c.url === "/dashboard/api/status").length;

  it("is plain when idle, on a non-Sync page, and does not poll", async () => {
    const { doc, calls } = await boot(fakeSync(), "#/weight");
    expect(nav(doc).classList.contains("syncing")).toBe(false);
    expect(nav(doc).getAttribute("aria-label")).toBe("Sync");
    const before = statusCalls(calls);
    await wait(3600); // longer than the running poll interval: an idle page must not poll that fast
    expect(statusCalls(calls)).toBe(before);
  }, 15000);

  it("animates on a non-Sync page when a sync is already running, with no badge or step text", async () => {
    const { doc } = await boot(fakeSync({ running: true, progress: { steps: [{ id: "daily_sleep", label: "Daily & sleep" }], current: 0, window_start: "2026-10-13", window_end: "2026-10-15", mode: "overlap" } }), "#/sleep");
    const a = nav(doc);
    expect(a.classList.contains("syncing")).toBe(true);
    expect(a.getAttribute("aria-label")).toBe("Sync (running)");
    expect(a.getAttribute("title")).toBe("Sync (running)");
    expect([...a.children].map((c: Element) => c.tagName.toLowerCase())).toEqual(["svg", "span"]); // icon + label only, no badge
    expect(text(a)).toBe("Sync");
    expect(doc.querySelectorAll("nav.menu a.syncing").length).toBe(1); // only the Sync item
  });

  it("follows the status: picked up on a route change, polled while running, and stops when the run ends", async () => {
    const sync = fakeSync();
    const { doc, calls } = await boot(sync, "#/overview");
    expect(nav(doc).classList.contains("syncing")).toBe(false);
    sync.f.running = true; // e.g. the scheduled run starts while this page is open
    await wait(2700); // past the minimum gap between checks
    doc.defaultView.location.hash = "#/weight";
    await wait(500);
    expect(nav(doc).classList.contains("syncing")).toBe(true);
    const n = statusCalls(calls);
    sync.f.running = false;
    await wait(3600); // the busy poll (about 3 s) notices the run ended without any navigation
    expect(nav(doc).classList.contains("syncing")).toBe(false);
    expect(nav(doc).getAttribute("aria-label")).toBe("Sync");
    expect(statusCalls(calls)).toBeGreaterThan(n);
    const after = statusCalls(calls);
    await wait(3600);
    expect(statusCalls(calls)).toBe(after); // idle again: no fast polling
  }, 30000);

  it("starts animating right after clicking Sync now (and on the Sync page itself)", async () => {
    const sync = fakeSync();
    const { doc } = await boot(sync);
    expect(nav(doc).classList.contains("syncing")).toBe(false);
    doc.querySelector(".syncbtn").click();
    await wait(200);
    expect(nav(doc).classList.contains("syncing")).toBe(true);
    sync.f.finish();
    await wait(2500);
    expect(nav(doc).classList.contains("syncing")).toBe(false);
  }, 15000);

  it("has the spin and glow styles, the collapsed variant and the reduced-motion fallback", async () => {
    const { doc } = await boot(fakeSync());
    const css = [...doc.querySelectorAll("style")].map((e: Element) => e.textContent).join("\n");
    expect(css).toContain("nav.menu a.syncing svg{color:var(--teal);animation:navspin");
    expect(css).toContain("nav.menu a.syncing{animation:navglow");
    expect(css).toContain("@keyframes navspin{to{transform:rotate(360deg)}}");
    expect(css).toContain(".app.collapsed nav.menu a.syncing{animation:none}"); // collapsed: just the spinning icon
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{nav\.menu a\.syncing,\.app\.collapsed nav\.menu a\.syncing\{animation:none;box-shadow:[^}]+\}nav\.menu a\.syncing svg\{animation:none\}\}/);
  });
});
