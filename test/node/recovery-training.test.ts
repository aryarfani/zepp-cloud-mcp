import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard, type DashboardLive } from "../../src/dashboard/handler";
import { buildTrack, toGpx, toTcx, fileBase } from "../../src/dashboard/export";
import { ZeppError } from "../../src/errors";
import { MIGRATIONS } from "../../src/store/migrations";
import { ZeppStore } from "../../src/store/store";
import { runSync } from "../../src/sync/sync";
import { analyzeWorkout } from "../../src/zepp/workout-analysis";
import { RUN_HISTORY_EXTRA, runDetail } from "../fixtures/run-detail";
import { seedDashboardDb } from "./dashboard-seed";
import { NOW as SYNC_NOW, mockCtx } from "./helpers";

type Element = any;
const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";
const RUN = "zepp:1760482800:cnVuLmRldmljZQ";
const NOW = Date.parse("2026-10-15T05:00:00Z"); // Thursday 12:00 in Jakarta; the week starts Mon 12 Oct
let dir: string, file: string;
const opened: DashboardData[] = [];
const stores: ZeppStore[] = [];
const wait = (ms = 40) => new Promise(r => setTimeout(r, ms));
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
afterEach(() => { while (stores.length) { try { stores.pop()!.close(); } catch { /* closed */ } } });

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zepp-rt-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  const ins = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for (const [id, date, dist] of [["p1", "2026-10-07", 5000], ["p2", "2026-09-20", 8000], ["p3", "2026-08-30", 3000]] as const) {
    ins.run(id, "outdoor_running", 1, `${date}T01:00:00.000Z`, date, `${date}T02:00:00.000Z`, 1800, dist, 250, 140, 160, "device", "{}", "{}", 0, "2026-10-15T00:00:00Z");
  }
  db.close();
  const store = new ZeppStore(file);
  store.saveWorkoutAnalysis(RUN, analyzeWorkout(runDetail(), RUN_HISTORY_EXTRA), "2026-10-15T00:00:00Z");
  const day = (date: string, over: Record<string, unknown>) => ({ date, hrv_ms: null, hrv_samples: null, readiness: null, sleep_hrv: null, sleep_rhr: null, hrv_score: null, rhr_score: null, hrv_baseline: null, rhr_baseline: null, odi: null, odi_events: null, spo2_dips: null, spo2_low: null, ...over });
  store.upsertRecoveryDays([
    day("2026-10-13", { hrv_ms: 60, hrv_samples: 40, readiness: 70, sleep_rhr: 57 }),
    day("2026-10-14", { hrv_ms: 80, hrv_samples: 38, readiness: 90, spo2_dips: 3, spo2_low: 88, odi: 1.5 }),
    day("2026-10-15", { sleep_hrv: 55, readiness: 80, spo2_dips: 1, spo2_low: 91 })
  ], "2026-10-15T00:00:00Z");
  store.close();
});
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });

function make(live?: DashboardLive) {
  const data = new DashboardData(file, { timezone: "Asia/Jakarta", now: () => NOW });
  opened.push(data);
  const handler = createDashboard({ ownerPassword: PASSWORD, data, now: () => NOW, failDelayMs: 0, sleep: async () => {}, ...(live ? { live } : {}) });
  return { handler, data };
}
const cookieValue = (res: Response, name: string) => res.headers.getSetCookie().find(c => c.startsWith(name + "="))?.split(";")[0]!.slice(name.length + 1);
async function session(handler: (r: Request) => Promise<Response>) {
  const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
  const csrf = cookieValue(lp, "zepp_dash_csrf")!;
  const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
  return `zepp_dash=${cookieValue(res, "zepp_dash")}`;
}
const get = (handler: (r: Request) => Promise<Response>, p: string, cookie?: string) => handler(new Request(ORIGIN + p, cookie ? { headers: { cookie } } : {}));

describe("migration 4 (recovery)", () => {
  it("upgrades a v3 database in place without touching existing data, then is idempotent", () => {
    const f = path.join(dir, "upgrade.db");
    const old = new ZeppStore(f, MIGRATIONS.filter(m => m.version <= 3)); stores.push(old);
    old.close();
    const raw = new DatabaseSync(f);
    raw.prepare("INSERT INTO daily_summary (date, steps, updated_at) VALUES ('2026-10-01', 4242, 'x')").run();
    raw.prepare("INSERT INTO sync_runs (trigger, started_at, ok, status, range_start, range_end) VALUES ('manual', 'x', 1, 'ok', '2026-10-01', '2026-10-02')").run();
    raw.close();
    const s = new ZeppStore(f); stores.push(s);
    expect(s.stats().schema_version).toBe(4);
    s.close();
    const again = new ZeppStore(f); stores.push(again);
    expect(again.stats().schema_version).toBe(4);
    expect(again.lastRun()).toMatchObject({ trigger: "manual", counts: { recovery_days: 0 } });
    again.close();
    const check = new DatabaseSync(f);
    expect(check.prepare("SELECT steps FROM daily_summary WHERE date = '2026-10-01'").get()).toMatchObject({ steps: 4242 });
    expect(check.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 4").get()).toMatchObject({ n: 1 });
    check.close();
  });

  it("upsertRecoveryDays is idempotent and a null never erases a stored value", () => {
    const s = new ZeppStore(":memory:"); stores.push(s);
    const row = (over: Record<string, unknown>) => ({ date: "2026-10-01", hrv_ms: null, hrv_samples: null, readiness: null, sleep_hrv: null, sleep_rhr: null, hrv_score: null, rhr_score: null, hrv_baseline: null, rhr_baseline: null, odi: null, odi_events: null, spo2_dips: null, spo2_low: null, ...over });
    s.upsertRecoveryDays([row({ hrv_ms: 70, readiness: 80 })], "t1");
    s.upsertRecoveryDays([row({ hrv_ms: 70, readiness: 80 })], "t2");
    s.upsertRecoveryDays([row({ spo2_dips: 2 })], "t3"); // a partial refetch keeps hrv + readiness
    expect(s.stats().recovery_days.rows).toBe(1);
  });
});

describe("sync recovery step", () => {
  const events = (items: unknown[]) => ({ items });
  it("stores recovery rows from the event streams and is idempotent", async () => {
    const { ctx } = mockCtx();
    const inner = ctx.zepp.get.bind(ctx.zepp);
    const at = (h: number) => SYNC_NOW - h * 3_600_000;
    (ctx.zepp as any).get = async (req: any) => {
      const t = String(req.query?.eventType ?? ""), st = String(req.query?.subType ?? "");
      if (t === "hrv_sdnn") return events([{ timestamp: at(30), value: JSON.stringify({ samples: [{ s: 0, sdnn: 66 }, { s: 60000, sdnn: 74 }] }), extra: "{}" }]);
      if (t === "readiness") return events([{ timestamp: at(30), value: JSON.stringify({ timestamp: at(30), timestampUpdate: at(29), rdnsScore: 77, sleepHRV: 70, sleepRHR: 56 }) }]);
      if (t === "blood_oxygen" && st === "osa_event") return events([{ timestamp: at(28), extra: JSON.stringify({ spo2_decrease: 89 }) }]);
      return inner(req);
    };
    const store = new ZeppStore(":memory:"); stores.push(store);
    const o = { backfillDays: 5, recentDays: 3, overlapDays: 2, requestDelayMs: 0, now: () => SYNC_NOW };
    const first = await runSync(ctx, store, o, "manual", { days: 5 });
    expect(first.ok).toBe(true);
    expect(first.counts.recovery_days).toBeGreaterThan(0);
    const before = store.stats().recovery_days.rows;
    expect(before).toBeGreaterThan(0);
    await runSync(ctx, store, o, "manual", { days: 5 });
    expect(store.stats().recovery_days.rows).toBe(before);
  });

  it("a failing recovery fetch never fails the sync (optional step)", async () => {
    const { ctx } = mockCtx();
    const inner = ctx.zepp.get.bind(ctx.zepp);
    (ctx.zepp as any).get = async (req: any) => {
      if (String(req.query?.eventType) === "readiness") throw new ZeppError("upstream_error", "boom", 500);
      return inner(req);
    };
    const store = new ZeppStore(":memory:"); stores.push(store);
    const r = await runSync(ctx, store, { backfillDays: 5, recentDays: 3, overlapDays: 2, requestDelayMs: 0, now: () => SYNC_NOW }, "manual", { days: 5 });
    expect(r.ok).toBe(true);
    expect(r.counts.recovery_days).toBe(0);
    expect(r.counts.daily).toBeGreaterThan(0);
  });
});

describe("dashboard API: recovery and training", () => {
  it("requires a session", async () => {
    const { handler } = make();
    for (const p of ["recovery", "training", `workouts/${RUN}/export.gpx`, `workouts/${RUN}/export.tcx`]) expect((await get(handler, "/dashboard/api/" + p)).status).toBe(401);
  });

  it("recovery: series, averages (readiness fallbacks), validation", async () => {
    const { handler } = make(); const cookie = await session(handler);
    const r = await (await get(handler, "/dashboard/api/recovery?days=30", cookie)).json() as any;
    expect(r.available).toBe(true);
    expect(r.series.find((x: any) => x.date === "2026-10-14")).toMatchObject({ hrv_ms: 80, hrv_source: "overnight_samples", readiness: 90, spo2_dips: 3 });
    expect(r.series.find((x: any) => x.date === "2026-10-15")).toMatchObject({ hrv_ms: 55, hrv_source: "readiness" });
    expect(r.summary).toMatchObject({ avg_hrv_ms: 65, hrv_days: 3, avg_readiness: 80, latest_readiness: { date: "2026-10-15", value: 80 }, spo2_dips_total: 4, spo2_nights: 2, spo2_low: 88 });
    expect(r.summary.avg_resting_hr_bpm).toBeGreaterThan(55); // daily summary resting HR plus the readiness fallback for 13 Oct
    expect((await get(handler, "/dashboard/api/recovery?days=0", cookie)).status).toBe(400);
    expect((await get(handler, "/dashboard/api/recovery?days=abc", cookie)).status).toBe(400);
    const narrow = await (await get(handler, "/dashboard/api/recovery?days=2", cookie)).json() as any;
    expect(narrow.series.map((x: any) => x.date)).toEqual(expect.not.arrayContaining(["2026-10-13"]));
  });

  it("training: week and month totals, eight weekly bars starting Monday, sports", async () => {
    const { handler } = make(); const cookie = await session(handler);
    const t = await (await get(handler, "/dashboard/api/training", cookie)).json() as any;
    expect(t).toMatchObject({ available: true, today: "2026-10-15", week_start: "2026-10-12" });
    expect(t.this_week).toMatchObject({ count: 2, distance_m: 10000 }); // the seeded run plus the strength session (no distance)
    expect(t.weeks).toHaveLength(8);
    expect(t.weeks[7]).toMatchObject({ week_start: "2026-10-12" });
    expect(t.weeks[6]).toMatchObject({ week_start: "2026-10-05", distance_m: 5000, count: 1 });
    expect(t.weeks[0].week_start).toBe("2026-08-24");
    expect(t.weeks[0]).toMatchObject({ distance_m: 3000 });
    expect(t.this_month.distance_m).toBe(15000);
    expect(t.last_month.distance_m).toBe(8000 + 0);
    expect(t.sports.length).toBeGreaterThan(0);
    expect(t.watch).toMatchObject({ available: false, last_sync_at: null });
    expect(t.planned).toEqual([]);
  });

  it("training: watch last-sync and planned workouts come from the cached live probes; errors are never shown", async () => {
    let watchCalls = 0, planCalls = 0, failWatch = false;
    const live: DashboardLive = {
      watchLastSync: async () => { watchCalls++; if (failWatch) throw new Error("token=SECRET-UPSTREAM"); return { last_sync_at: new Date(NOW - 14 * 60_000).toISOString(), effective_at: null }; },
      plannedWorkouts: async () => { planCalls++; return [{ title: "Long run", start_at: "2026-10-18T06:00:00.000Z", end_at: null, status: 0 }]; }
    };
    let clock = NOW;
    const data = new DashboardData(file, { timezone: "Asia/Jakarta", now: () => NOW }); opened.push(data);
    const handler = createDashboard({ ownerPassword: PASSWORD, data, now: () => clock, failDelayMs: 0, sleep: async () => {}, live });
    const cookie = await session(handler);
    const a = await (await get(handler, "/dashboard/api/training", cookie)).json() as any;
    expect(a.watch).toMatchObject({ available: true, minutes_ago: 14 });
    expect(a.planned).toEqual([{ title: "Long run", start_at: "2026-10-18T06:00:00.000Z", end_at: null, status: 0 }]);
    await Promise.all([get(handler, "/dashboard/api/training", cookie), get(handler, "/dashboard/api/training", cookie)]);
    expect([watchCalls, planCalls]).toEqual([1, 1]); // cached, not one upstream call per page view
    clock += 3 * 60_000; failWatch = true;
    const b = await get(handler, "/dashboard/api/training", cookie);
    const bt = await b.text();
    expect(watchCalls).toBe(2);
    expect(bt).not.toContain("SECRET"); expect(bt).not.toContain("token");
    expect(JSON.parse(bt).watch.available).toBe(false);
    await get(handler, "/dashboard/api/training", cookie);
    expect(watchCalls).toBe(2); // a failure is remembered for a minute
  });
});

describe("GPX / TCX export", () => {
  const parse = (xml: string, mime: string) => {
    const doc = new JSDOM("").window.DOMParser.prototype.parseFromString.call(new (new JSDOM("").window.DOMParser)(), xml, mime as any);
    return doc;
  };

  it("serves a valid GPX with attachment headers, one trkpt per stored route point, increasing times and heart rate", async () => {
    const { handler, data } = make(); const cookie = await session(handler);
    const res = await get(handler, `/dashboard/api/workouts/${encodeURIComponent(RUN)}/export.gpx`, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/gpx+xml");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="zepp-outdoor-running-20261015-\d{4}\.gpx"$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const xml = await res.text();
    const doc = parse(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.localName).toBe("gpx");
    expect(doc.documentElement.getAttribute("version")).toBe("1.1");
    expect(doc.documentElement.namespaceURI).toBe("http://www.topografix.com/GPX/1/1");
    const stored = (data.analysis(RUN) as any).analysis;
    const pts = [...doc.getElementsByTagName("trkpt")];
    expect(pts.length).toBe(stored.route.points.length);
    expect(pts.length).toBeGreaterThan(2);
    let prev = 0;
    for (const p of pts) {
      const lat = Number(p.getAttribute("lat")), lon = Number(p.getAttribute("lon"));
      expect(Math.abs(lat)).toBeLessThanOrEqual(90); expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      const t = Date.parse(p.getElementsByTagName("time")[0]!.textContent!);
      expect(t).toBeGreaterThanOrEqual(prev); prev = t;
    }
    // schema order inside trkpt: ele, time, extensions
    const first = pts[0]!;
    const order = [...first.children].map((c: Element) => c.localName);
    expect(order.indexOf("time")).toBeGreaterThanOrEqual(0);
    if (order.includes("ele")) expect(order.indexOf("ele")).toBeLessThan(order.indexOf("time"));
    if (order.includes("extensions")) expect(order.indexOf("extensions")).toBeGreaterThan(order.indexOf("time"));
    expect(xml).toContain("gpxtpx:hr");
  });

  it("serves a valid TCX with the route, distance and heart rate", async () => {
    const { handler } = make(); const cookie = await session(handler);
    const res = await get(handler, `/dashboard/api/workouts/${encodeURIComponent(RUN)}/export.tcx`, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("tcx");
    expect(res.headers.get("content-disposition")).toMatch(/filename="zepp-outdoor-running-20261015-\d{4}\.tcx"/);
    const doc = parse(await res.text(), "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.localName).toBe("TrainingCenterDatabase");
    const tps = [...doc.getElementsByTagName("Trackpoint")];
    expect(tps.length).toBeGreaterThan(2);
    const lap = doc.getElementsByTagName("Lap")[0]!;
    expect(["TotalTimeSeconds", "DistanceMeters", "Calories", "Intensity", "TriggerMethod", "Track"].every(n => lap.getElementsByTagName(n).length >= 1)).toBe(true);
    // Lap child order required by the schema
    const order = [...lap.children].map((c: Element) => c.localName);
    expect(order.indexOf("TotalTimeSeconds")).toBeLessThan(order.indexOf("DistanceMeters"));
    expect(order.indexOf("Calories")).toBeLessThan(order.indexOf("Intensity"));
    expect(order.indexOf("Intensity")).toBeLessThan(order.indexOf("Track"));
    const dists = tps.map((t: Element) => Number(t.getElementsByTagName("DistanceMeters")[0]!.textContent));
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
    expect(doc.getElementsByTagName("HeartRateBpm").length).toBeGreaterThan(0);
  });

  it("404s for an unknown workout, a workout without a stored route, and a malformed id", async () => {
    const { handler } = make(); const cookie = await session(handler);
    for (const id of ["nope", "w-str", "bad%20id", "%E0%A4%A"]) {
      const res = await get(handler, `/dashboard/api/workouts/${id}/export.gpx`, cookie);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-disposition")).toBeNull();
    }
  });

  it("escapes markup in names and never emits control characters", () => {
    const w = { workout_id: "x", activity_type: "run<&\">", started_at: "2026-10-15T00:00:00Z", duration_s: 60, distance_m: 100, calories_kcal: 5, avg_hr_bpm: null, max_hr_bpm: null };
    const track = buildTrack(w, { points: [[1, 1], [1.001, 1.001]], bbox: [1, 1, 1.001, 1.001] } as any, null)!;
    expect(track).toHaveLength(2);
    expect(track[0]!.time).toBe("2026-10-15T00:00:00Z");
    expect(track[1]!.time).toBe("2026-10-15T00:01:00Z");
    for (const xml of [toGpx(w, track), toTcx(w, track)]) {
      expect(xml).not.toContain("<&"); expect(xml).not.toContain('">>');
      const doc = new (new JSDOM("").window.DOMParser)().parseFromString(xml, "application/xml");
      expect(doc.querySelector("parsererror")).toBeNull();
    }
    expect(fileBase(w, "Asia/Jakarta")).toBe("zepp-run-run-20261015-0700".replace("run-run", "run"));
    expect(buildTrack(w, { points: [[1, 1]], bbox: [1, 1, 1, 1] } as any, null)).toBeNull();
    expect(buildTrack(w, null, null)).toBeNull();
  });
});

describe("Recovery and Training pages (jsdom)", () => {
  async function boot(hash: string, live?: DashboardLive) {
    const { handler } = make(live); const cookie = await session(handler);
    const html = await (await handler(new Request(ORIGIN + "/dashboard", { headers: { cookie } }))).text();
    const errors: string[] = []; const vc = new VirtualConsole();
    vc.on("jsdomError", (e: Error) => errors.push(e.message));
    const fetches: string[] = [];
    const dom = new JSDOM(html, {
      url: ORIGIN + "/dashboard" + hash, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(window: any) {
        window.fetch = async (u: string) => { fetches.push(u); const r = await handler(new Request(ORIGIN + u, { headers: { cookie } })); return { ok: r.ok, status: r.status, json: () => r.json() }; };
        window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      }
    });
    await wait(150);
    return { dom, doc: dom.window.document, errors, fetches, handler, cookie };
  }

  it("Recovery: cards, charts and range chips", async () => {
    const { doc, errors, fetches } = await boot("#recovery");
    expect(errors).toEqual([]);
    expect(fetches).toContain("/dashboard/api/recovery?days=30");
    expect(text(doc.querySelector("h1"))).toBe("Recovery");
    const labels = [...doc.querySelectorAll(".card .label")].map(text);
    expect(labels).toEqual(["Avg HRV", "Resting HR", "Readiness", "SpO2 dips"]);
    const cards = [...doc.querySelectorAll(".card")].map(text);
    expect(cards[0]).toContain("65"); expect(cards[0]).toContain("ms");
    expect(cards[2]).toContain("80"); expect(cards[2]).toContain("/ 100");
    expect(cards[3]).toContain("4 dips"); expect(cards[3]).toContain("lowest 88%");
    expect(doc.querySelectorAll("svg.chart").length).toBe(3); // HRV, resting HR, readiness
    expect([...doc.querySelectorAll("#rangebar button")].map(text)).toEqual(["30 days", "90 days", "180 days", "365 days"]);
    expect(text(doc.querySelector("nav.menu a.active"))).toBe("Recovery");
  });

  it("Recovery: the 90 day chip refetches", async () => {
    const { doc, fetches } = await boot("#recovery");
    const chip = [...doc.querySelectorAll("#rangebar button")].find((b: Element) => text(b) === "90 days") as Element | undefined;
    expect(chip).toBeTruthy();
    chip!.click(); await wait(150);
    expect(fetches).toContain("/dashboard/api/recovery?days=90");
  });

  it("Training: week and month cards, eight bars, watch pill and planned strip", async () => {
    const live: DashboardLive = {
      watchLastSync: async () => ({ last_sync_at: new Date(NOW - 14 * 60_000).toISOString(), effective_at: null }),
      plannedWorkouts: async () => [{ title: "Long run", start_at: "2026-10-18T06:00:00.000Z", end_at: null, status: 0 }]
    };
    const { doc, errors } = await boot("#training", live);
    expect(errors).toEqual([]);
    expect([...doc.querySelectorAll(".card .label")].map(text)).toEqual(["This week", "Last week", "This month", "Last month"]);
    expect(text(doc.querySelectorAll(".card")[0])).toContain("10.0");
    expect(doc.querySelectorAll("svg.chart rect[rx]").length).toBeGreaterThanOrEqual(1);
    expect(text(doc.querySelector(".watchpill"))).toMatch(/^Watch last synced 14 min ago$/);
    expect(text(doc.querySelector(".planstrip"))).toContain("Long run");
  });

  it("Training: no watch pill and no planned strip when the probes have nothing", async () => {
    const { doc } = await boot("#training");
    expect(doc.querySelector(".watchpill")).toBeNull();
    expect(doc.querySelector(".planstrip")).toBeNull();
    expect(text(doc.querySelector("main"))).not.toContain("Planned workouts");
  });

  it("Workout detail: the Export menu appears for a workout with a route and offers GPX and TCX", async () => {
    const { doc } = await boot("#workouts/" + encodeURIComponent(RUN));
    await wait(200);
    const btn = doc.querySelector(".expbtn") as Element;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    const menu = doc.querySelector(".expmenu") as Element;
    expect(menu.classList.contains("hidden")).toBe(true);
    btn.click();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(menu.classList.contains("hidden")).toBe(false);
    const links = [...menu.querySelectorAll("a")] as Element[];
    expect(links.map(text)).toEqual(["Download GPX", "Download TCX"]);
    expect(links.map(a => a.getAttribute("href"))).toEqual([`/dashboard/api/workouts/${encodeURIComponent(RUN)}/export.gpx`, `/dashboard/api/workouts/${encodeURIComponent(RUN)}/export.tcx`]);
    expect(links.every(a => a.hasAttribute("download"))).toBe(true);
    menu.dispatchEvent(new (doc.defaultView as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu.classList.contains("hidden")).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("Workout detail: no Export menu for a workout without a route", async () => {
    const { doc } = await boot("#workouts/w-str");
    await wait(200);
    expect(doc.querySelector(".expbtn")).toBeNull();
  });
});
