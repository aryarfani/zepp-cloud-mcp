import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { createDashboard } from "../../src/dashboard/handler";
import { DashboardData } from "../../src/dashboard/data";
import { DASHBOARD_JS, renderDashboardHtml, renderLoginHtml } from "../../src/dashboard/ui";
import { seedDashboardDb } from "./dashboard-seed";

const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";
const NOW = Date.parse("2026-10-15T05:00:00Z"); // 12:00 in Asia/Jakarta
let dir: string;
let file: string;

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "zepp-dash-")); file = path.join(dir, "zepp.db"); seedDashboardDb(file); });
const opened: DashboardData[] = [];
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });

function make(opts: { password?: string; now?: () => number; dbFile?: string; sessionSecret?: string } = {}) {
  const data = new DashboardData(opts.dbFile ?? file, { timezone: "Asia/Jakarta", now: opts.now ?? (() => NOW) });
  opened.push(data);
  const handler = createDashboard({
    ownerPassword: opts.password ?? PASSWORD, data, now: opts.now ?? (() => NOW), failDelayMs: 0, sleep: async () => {},
    ...(opts.sessionSecret ? { sessionSecret: opts.sessionSecret } : {}),
    syncStatus: () => ({ enabled: true, running: false, schedule: { next_run_at: "2026-10-16T21:00:00.000Z", local_hour: 4 }, db: { file: "/secret/path.db" }, settings: { x: 1 } })
  });
  return { handler, data };
}

const cookieValue = (res: Response, name: string) => res.headers.getSetCookie().find(c => c.startsWith(name + "="))?.split(";")[0]!.slice(name.length + 1);
const req = (p: string, init: RequestInit & { headers?: Record<string, string> } = {}) => new Request(ORIGIN + p, init);

async function csrfPair(handler: (r: Request) => Promise<Response>) {
  const res = await handler(req("/dashboard/login"));
  const token = cookieValue(res, "zepp_dash_csrf")!;
  return { res, token, cookie: `zepp_dash_csrf=${token}` };
}
async function login(handler: (r: Request) => Promise<Response>, password = PASSWORD, ip = "1.2.3.4", extra: Record<string, string> = {}) {
  const { token, cookie } = await csrfPair(handler);
  return handler(req("/dashboard/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie, "x-real-ip": ip, ...extra },
    body: new URLSearchParams({ csrf: token, password }).toString()
  }));
}
async function session(handler: (r: Request) => Promise<Response>) {
  const res = await login(handler);
  expect(res.status).toBe(303);
  return `zepp_dash=${cookieValue(res, "zepp_dash")}`;
}
const get = (handler: (r: Request) => Promise<Response>, p: string, cookie?: string) => handler(req(p, cookie ? { headers: { cookie } } : {}));

describe("dashboard authentication", () => {
  it("redirects unauthenticated page requests to the login form and rejects API calls with 401", async () => {
    const { handler } = make();
    for (const p of ["/dashboard", "/dashboard/", "/dashboard/anything"]) {
      const res = await get(handler, p);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/dashboard/login");
    }
    for (const p of ["overview", "trends", "workouts", "workouts/w-run", "exercises", "status", "weight", "charge"]) {
      const res = await get(handler, "/dashboard/api/" + p);
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain("steps");
    }
  });

  it("serves the login form with security headers, a CSP nonce and a strict CSRF cookie", async () => {
    const { handler } = make();
    const { res, token } = await csrfPair(handler);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
    const html = await res.text();
    expect(html).toContain(`value="${token}"`);
    expect(html).toContain(`<style nonce="${/nonce-([^';]+)/.exec(csp)![1]}">`);
    const setCookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash_csrf="))!;
    expect(setCookie).toMatch(/HttpOnly/); expect(setCookie).toMatch(/Secure/); expect(setCookie).toMatch(/SameSite=Strict/); expect(setCookie).toMatch(/Path=\/dashboard/);
  });

  it("rejects a login POST without a valid CSRF token, from another origin, or with the wrong content type", async () => {
    const { handler } = make();
    const { token, cookie } = await csrfPair(handler);
    const post = (headers: Record<string, string>, body: string) => handler(req("/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body }));
    const good = new URLSearchParams({ csrf: token, password: PASSWORD }).toString();
    expect((await post({ origin: ORIGIN }, good)).status).toBe(400);                       // no CSRF cookie
    expect((await post({ origin: ORIGIN, cookie }, new URLSearchParams({ csrf: "other", password: PASSWORD }).toString())).status).toBe(400);
    expect((await post({ origin: ORIGIN, cookie }, new URLSearchParams({ password: PASSWORD }).toString())).status).toBe(400);
    expect((await post({ origin: "https://evil.example", cookie }, good)).status).toBe(403);
    expect((await post({ cookie }, good)).status).toBe(403);                                // no Origin/Sec-Fetch-Site/Referer at all
    expect((await post({ origin: ORIGIN, cookie, "content-type": "application/json" }, "{}")).status).toBe(415);
    expect((await post({ origin: ORIGIN, cookie }, "x".repeat(5000))).status).toBe(413);
    // none of those minted a session
    expect((await post({ origin: ORIGIN, cookie }, good)).status).toBe(303);
  });

  it("rejects a wrong password without issuing a session", async () => {
    const { handler } = make();
    const res = await login(handler, "wrong password");
    expect(res.status).toBe(401);
    expect(cookieValue(res, "zepp_dash")).toBeUndefined();
    expect(await res.text()).toContain("Incorrect password.");
  });

  it("issues an HttpOnly, Secure, SameSite=Lax session cookie for about 7 days on success and clears the CSRF cookie", async () => {
    const { handler } = make();
    const res = await login(handler);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/dashboard");
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const sess = cookies.find(c => c.startsWith("zepp_dash="))!;
    expect(sess).toMatch(/HttpOnly/); expect(sess).toMatch(/Secure/); expect(sess).toMatch(/SameSite=Lax/); expect(sess).toMatch(/Path=\/dashboard/);
    expect(sess).toMatch(/Max-Age=604800/);
    expect(cookies.find(c => c.startsWith("zepp_dash_csrf="))).toMatch(/Max-Age=0/);
    expect(sess).not.toContain(PASSWORD);
  });

  it("locks out after repeated failures (even with the right password) with a Retry-After, and recovers after the window", async () => {
    let now = NOW;
    const { handler } = make({ now: () => now });
    for (let i = 0; i < 5; i++) expect((await login(handler, "nope", "9.9.9.9")).status).toBe(401);
    const locked = await login(handler, PASSWORD, "9.9.9.9");
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBe("900");
    expect(cookieValue(locked, "zepp_dash")).toBeUndefined();
    now += 16 * 60 * 1000;
    expect((await login(handler, PASSWORD, "9.9.9.9")).status).toBe(303);
  });

  it("logout revokes the session", async () => {
    const { handler } = make();
    const cookie = await session(handler);
    expect((await get(handler, "/dashboard/api/status", cookie)).status).toBe(200);
    expect((await handler(req("/dashboard/logout", { method: "GET", headers: { cookie } }))).status).toBe(405);
    expect((await handler(req("/dashboard/logout", { method: "POST", headers: { cookie, origin: "https://evil.example" } }))).status).toBe(403);
    expect((await get(handler, "/dashboard/api/status", cookie)).status).toBe(200); // the rejected attempts changed nothing
    const out = await handler(req("/dashboard/logout", { method: "POST", headers: { cookie, origin: ORIGIN } }));
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/dashboard/login");
    expect(out.headers.getSetCookie()[0]).toMatch(/zepp_dash=;.*Max-Age=0/);
    expect((await get(handler, "/dashboard/api/status", cookie)).status).toBe(401);
    expect((await get(handler, "/dashboard", cookie)).status).toBe(302);
  });

  it("rejects tampered, foreign and expired session cookies", async () => {
    let now = NOW;
    const { handler } = make({ now: () => now });
    const cookie = await session(handler);
    const [name, token] = [cookie.split("=")[0]!, cookie.slice(cookie.indexOf("=") + 1)];
    const parts = token.split(".");
    expect((await get(handler, "/dashboard/api/status", `${name}=${parts.slice(0, 3).join(".")}.${"A".repeat(43)}`)).status).toBe(401);
    expect((await get(handler, "/dashboard/api/status", `${name}=${parts[0]}.${parts[1]}.${Number(parts[2]) + 999999}.${parts[3]}`)).status).toBe(401);
    expect((await get(handler, "/dashboard/api/status", `${name}=garbage`)).status).toBe(401);
    const other = make({ password: "a completely different password" });
    expect((await get(other.handler, "/dashboard/api/status", cookie)).status).toBe(401);       // key derived from the owner password
    const withSecret = make({ sessionSecret: "s".repeat(40) });
    expect((await get(withSecret.handler, "/dashboard/api/status", cookie)).status).toBe(401);  // DASHBOARD_SESSION_SECRET changes the key
    expect((await get(handler, "/dashboard/api/status", cookie)).status).toBe(200);
    now += 8 * 24 * 3600 * 1000;
    expect((await get(handler, "/dashboard/api/status", cookie)).status).toBe(401);             // expired after 7 days
  });

  it("only allows the expected methods", async () => {
    const { handler } = make();
    const cookie = await session(handler);
    expect((await handler(req("/dashboard", { method: "POST", headers: { cookie } }))).status).toBe(405);
    expect((await handler(req("/dashboard/api/overview", { method: "POST", headers: { cookie } }))).status).toBe(405);
    expect((await handler(req("/dashboard/login", { method: "PUT" }))).status).toBe(405);
    expect((await get(handler, "/dashboard/nope", cookie)).status).toBe(404);
  });
});

describe("dashboard page", () => {
  it("serves a self-contained page with a nonce CSP once signed in", async () => {
    const { handler } = make();
    const cookie = await session(handler);
    const res = await get(handler, "/dashboard", cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    const csp = res.headers.get("content-security-policy")!;
    const nonce = /nonce-([^';]+)/.exec(csp)![1]!;
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain(`<style nonce="${nonce}">`);
    expect(csp).toContain("connect-src 'self'");
  });

  it("makes no external requests and builds the DOM without innerHTML or inline handlers", () => {
    const html = renderDashboardHtml("abc") + renderLoginHtml({ nonce: "abc", csrf: "x" });
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/<link[^>]*href=/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(DASHBOARD_JS).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    const urls = DASHBOARD_JS.match(/https?:\/\/[^"'\s)]+/g) ?? [];
    expect(urls).toEqual(["http://www.w3.org/2000/svg"]); // the SVG XML namespace, not a network request
    expect(DASHBOARD_JS.match(/fetch\(/g)).toHaveLength(1);
    expect(DASHBOARD_JS).toContain('"/dashboard/api/"');
  });

  it("has JavaScript that parses", () => {
    expect(() => new vm.Script(DASHBOARD_JS, { filename: "dashboard.js" })).not.toThrow();
  });

  it("escapes values placed into the login page", () => {
    const html = renderLoginHtml({ nonce: "n\"<", csrf: "\"><script>alert(1)</script>", error: "<b>x</b>" });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("dashboard API (temp database)", () => {
  async function api(p: string) {
    const { handler } = make();
    const cookie = await session(handler);
    const res = await get(handler, "/dashboard/api/" + p, cookie);
    return { res, body: await res.json() as any };
  }

  it("overview: latest steps, last night, resting HR fallback, charge, last workout, weight", async () => {
    const { res, body } = await api("overview");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.today).toBe("2026-10-15");
    expect(body.daily).toMatchObject({ date: "2026-10-15", steps: 10000 });
    expect(body.resting_hr).toMatchObject({ date: "2026-10-14", resting_hr_bpm: 63 }); // latest day has none
    expect(body.sleep).toMatchObject({ sleep_date: "2026-10-15", duration_s: 25200, score: 82 });
    expect(body.sleep.stage_s).toEqual({ light: 7200, deep: 5400, rem: 12600 });
    expect(body.charge).toMatchObject({ date: "2026-10-15", samples: 12, min: 40, max: 51, last: 51, first: 40 });
    expect(body.workout).toMatchObject({ workout_id: "w-run", activity_type: "outdoor_running" });
    expect(body.weight).toMatchObject({ weight_kg: 64.5 });
    expect(body.blood_pressure).toBeNull();
    expect(JSON.stringify(body)).not.toContain("raw-only");
  });

  it("trends: windows by days, merges sleep per date, matches DB counts", async () => {
    const { body } = await api("trends?days=30");
    expect(body.daily).toHaveLength(5); // 2026-06-01 is outside the window
    expect(body.sleep.map((s: any) => [s.sleep_date, s.duration_s])).toEqual([["2026-10-14", 3600], ["2026-10-15", 25200]]);
    expect(body.charge).toHaveLength(2);
    expect(body.charge[1]).toMatchObject({ date: "2026-10-15", samples: 12 });
    expect(body.weight).toHaveLength(1); // 2026-08-01 is older than 30 days
    expect(body.blood_pressure).toEqual([]);
    expect(body.stress).toEqual([expect.objectContaining({ date: "2026-10-15", source: "single_stress", avg: 44 })]);
    expect((await api("trends?days=180")).body.daily).toHaveLength(6);
    expect((await api("weight?days=90")).body.records).toHaveLength(2);
  });

  it("workouts: list, type filter, paging, total", async () => {
    const all = (await api("workouts")).body;
    expect(all.total).toBe(2);
    expect(all.workouts.map((w: any) => w.workout_id)).toEqual(["w-run", "w-str"]);
    expect(all.workouts[1].strength_sets).toBe(3);
    expect(all.types).toEqual(expect.arrayContaining([{ type: "outdoor_running", n: 1 }, { type: "strength_training", n: 1 }]));
    expect((await api("workouts?type=strength_training")).body.workouts).toHaveLength(1);
    const page2 = (await api("workouts?limit=1&offset=1")).body;
    expect(page2.workouts.map((w: any) => w.workout_id)).toEqual(["w-str"]);
    expect(page2.total).toBe(2);
    expect((await api("workouts?days=1")).body.workouts.map((w: any) => w.workout_id)).toEqual(["w-run"]);
  });

  it("workout detail: strength sets with names, unknown ids shown as unknown_<id>", async () => {
    const { res, body } = await api("workouts/w-str");
    expect(res.status).toBe(200);
    expect(body.sets.map((s: any) => [s.exercise, s.known, s.reps])).toEqual([["Pull Up", true, 10], ["Bench Press", true, 12], ["unknown_9999", false, 8]]);
    expect(JSON.stringify(body)).not.toContain("raw_json");
    expect((await api("workouts/nope")).res.status).toBe(404);
  });

  it("exercises: lists every id and flags the unmapped ones", async () => {
    const { body } = await api("exercises");
    expect(body.unknown_count).toBe(1);
    const byId = Object.fromEntries(body.exercises.map((e: any) => [e.action_type, e]));
    expect(byId[9999]).toMatchObject({ name: "unknown_9999", known: false, sets: 1, example_workout_id: "w-str" });
    expect(byId[6]).toMatchObject({ name: "Bench Press", known: true });
  });

  it("charge: daily rows, and 5-minute samples plus insights for one date", async () => {
    const { body } = await api("charge?days=30&date=2026-10-15");
    expect(body.days_data).toHaveLength(2);
    expect(body.samples.length).toBeGreaterThan(0);
    expect(body.samples.length).toBeLessThanOrEqual(3);
    expect(body.insights).toHaveLength(1);
  });

  it("status: last run, coverage that matches the DB, no file paths", async () => {
    const { body } = await api("status");
    expect(body.last_success).toMatchObject({ ok: 1, trigger: "scheduled" });
    const cov = Object.fromEntries(body.coverage.map((c: any) => [c.table, c]));
    expect(cov.daily_summary).toMatchObject({ rows: 6, first: "2026-06-01", last: "2026-10-15" });
    expect(cov.workouts.rows).toBe(2);
    expect(cov.charge_samples.rows).toBe(13);
    expect(cov.blood_pressure.rows).toBe(0);
    expect(body.strength_sets).toBe(3);
    expect(body.sync).toEqual({ enabled: true, running: false, next_run_at: "2026-10-16T21:00:00.000Z", local_hour: 4 });
    expect(JSON.stringify(body)).not.toContain("/secret/path.db");
  });

  it("reports unavailable (not an error) when the database does not exist yet", async () => {
    const { handler } = make({ dbFile: path.join(dir, "missing.db") });
    const cookie = await session(handler);
    const overview = await (await get(handler, "/dashboard/api/overview", cookie)).json() as any;
    expect(overview.available).toBe(false);
    expect((await (await get(handler, "/dashboard/api/workouts", cookie)).json() as any).workouts).toEqual([]);
    expect((await get(handler, "/dashboard/api/workouts/x", cookie)).status).toBe(404);
  });
});

describe("dashboard API input handling", () => {
  it("validates parameters and is not injectable", async () => {
    const { handler } = make();
    const cookie = await session(handler);
    const q = async (p: string) => { const r = await get(handler, "/dashboard/api/" + p, cookie); return { status: r.status, body: await r.json() as any }; };
    for (const bad of ["trends?days=0", "trends?days=367", "trends?days=abc", "trends?days=1;DROP%20TABLE%20workouts", "weight?days=-1", "charge?days=30&date=2026-10-15'--", "charge?date=bad", "workouts?limit=1000", "workouts?offset=-1", "workouts?days=x"]) {
      expect((await q(bad)).status).toBe(400);
    }
    // injection attempts through string parameters match nothing and change nothing
    const injected = await q("workouts?type=" + encodeURIComponent("x' OR '1'='1"));
    expect(injected.status).toBe(200);
    expect(injected.body.workouts).toEqual([]);
    expect((await q("workouts?type=" + encodeURIComponent("'; DROP TABLE workouts; --"))).body.total).toBe(0);
    expect((await q("workouts/" + encodeURIComponent("w-run' OR '1'='1"))).status).toBe(404);
    expect((await q("workouts/" + encodeURIComponent("w-run' OR '1'='1"))).body.error).toBe("Not found");
    expect((await q("workouts/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
    expect((await q("workouts?type=" + "a".repeat(100))).status).toBe(400);
    const after = await q("workouts");
    expect(after.body.total).toBe(2);
    expect((await q("nope")).status).toBe(404);
  });

  it("opens the database read-only: the dashboard connection cannot write", () => {
    const db = new DatabaseSync(file, { readOnly: true });
    expect(() => db.exec("DELETE FROM workouts")).toThrow();
    db.close();
    const probe = new DashboardData(file, { timezone: "UTC" });
    expect(probe.available()).toBe(true);
    opened.push(probe);
  });
});

describe("integration with the app", () => {
  const env = { MCP_SECRET: "mcp-secret", ZEPP_APP_TOKEN: "t", ZEPP_USER_ID: "1", ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com", USER_TIMEZONE: "Asia/Jakarta" } as unknown as Env;

  it("routes /dashboard to the handler and leaves /health, / and /mcp untouched", async () => {
    const { handler } = make();
    const app = createApp({ env, oauth: null, dashboard: handler });
    expect((await app(req("/dashboard"))).status).toBe(302);
    expect((await app(req("/health"))).status).toBe(200);
    expect((await (await app(req("/"))).json() as any).service).toBe("zepp-cloud-mcp");
    const mcp = await app(req("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(mcp.status).toBe(401);
    expect(mcp.headers.get("www-authenticate")).toBeTruthy();
    expect((await app(req("/dashboardx"))).status).toBe(404);
  });

  it("answers 404 for /dashboard when it is not configured", async () => {
    const app = createApp({ env, oauth: null });
    expect((await app(req("/dashboard"))).status).toBe(404);
    expect((await app(req("/dashboard/api/overview"))).status).toBe(404);
  });
});