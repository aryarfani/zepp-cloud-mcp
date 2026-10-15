import { describe, expect, it } from "vitest";
import { createDashboard } from "../src/dashboard/handler";

// POST /dashboard/api/sync/run: auth, same-origin, per-session CSRF token, no parameters, one run at a time, rate limit.
// The handler never touches the data object for these routes, so a stub is enough (the database part is covered in the node tests).
const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";

function setup(startSync?: () => "started" | "running" | "unavailable", now = () => 1_800_000_000_000) {
  const handler = createDashboard({ ownerPassword: PASSWORD, data: {} as any, failDelayMs: 0, now, sleep: async () => {}, ...(startSync ? { startSync } : {}) });
  return handler;
}
async function login(handler: (r: Request) => Promise<Response>) {
  const lp = await handler(new Request(ORIGIN + "/dashboard/login"));
  const csrf = lp.headers.getSetCookie().find(c => c.startsWith("zepp_dash_csrf="))!.split(";")[0]!.split("=")[1]!;
  const res = await handler(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
  const cookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
  const html = await (await handler(new Request(ORIGIN + "/dashboard", { headers: { cookie } }))).text();
  const token = /data-csrf="([^"]+)"/.exec(html)![1]!;
  return { cookie, token };
}
const post = (handler: (r: Request) => Promise<Response>, init: { cookie?: string; token?: string; origin?: string | null; path?: string; body?: string; method?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (init.cookie) headers.cookie = init.cookie;
  if (init.token !== undefined) headers["x-csrf-token"] = init.token;
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return handler(new Request(ORIGIN + (init.path ?? "/dashboard/api/sync/run"), { method: init.method ?? "POST", headers, ...(init.body !== undefined ? { body: init.body } : {}) }));
};

describe("POST /dashboard/api/sync/run", () => {
  it("requires a session", async () => {
    const calls: string[] = [];
    const h = setup(() => { calls.push("x"); return "started"; });
    const res = await post(h, { token: "whatever" });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("puts a per-session CSRF token in the page and rejects a missing, wrong or other-session token", async () => {
    const calls: string[] = [];
    const h = setup(() => { calls.push("x"); return "started"; });
    const a = await login(h), b = await login(h);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(a.token).not.toBe(b.token);
    expect((await post(h, { cookie: a.cookie })).status).toBe(403);
    expect((await post(h, { cookie: a.cookie, token: "wrong" })).status).toBe(403);
    expect((await post(h, { cookie: a.cookie, token: b.token })).status).toBe(403);
    expect(calls).toEqual([]);
    const ok = await post(h, { cookie: a.cookie, token: a.token });
    expect(ok.status).toBe(202);
    expect(await ok.json()).toEqual({ started: true, running: true });
    expect(calls).toHaveLength(1);
  });

  it("rejects cross-origin and origin-less requests, other methods, query strings and bodies", async () => {
    const calls: string[] = [];
    const h = setup(() => { calls.push("x"); return "started"; });
    const s = await login(h);
    expect((await post(h, { ...s, origin: "https://evil.example" })).status).toBe(403);
    expect((await post(h, { ...s, origin: null })).status).toBe(403);
    expect((await post(h, { ...s, method: "GET" })).status).toBe(405);
    expect((await post(h, { ...s, method: "PUT" })).status).toBe(405);
    expect((await post(h, { ...s, path: "/dashboard/api/sync/run?days=400&start=2020-01-01" })).status).toBe(400);
    expect((await post(h, { ...s, body: "days=400" })).status).toBe(400);
    expect((await post(h, { ...s, body: JSON.stringify({ start: "2020-01-01", end: "2026-01-01" }) })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns the current state without starting another run when one is already running", async () => {
    let n = 0;
    const h = setup(() => { n++; return "running"; });
    const s = await login(h);
    const res = await post(h, s);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ started: false, running: true });
    expect(n).toBe(1); // asked once; the service itself refuses to start a second routine
  });

  it("is unavailable (503) without a sync service or credentials", async () => {
    const none = setup();
    const s1 = await login(none);
    expect((await post(none, s1)).status).toBe(503);
    const un = setup(() => "unavailable");
    const s2 = await login(un);
    const res = await post(un, s2);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/token|zepp\.com|stack/i);
  });

  it("limits manual runs to 5 per hour and frees the window afterwards; refused starts do not count", async () => {
    let t = 1_800_000_000_000, mode: "started" | "running" = "started";
    const h = setup(() => mode, () => t);
    const s = await login(h);
    for (let i = 0; i < 5; i++) expect((await post(h, s)).status).toBe(202);
    const limited = await post(h, s);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await limited.json()).error).toMatch(/Too many/);
    t += 61 * 60 * 1000;
    expect((await post(h, s)).status).toBe(202);
    // "already running" answers do not use up the budget
    t += 61 * 60 * 1000; mode = "running";
    for (let i = 0; i < 8; i++) expect((await post(h, s)).status).toBe(409);
    mode = "started";
    expect((await post(h, s)).status).toBe(202);
  });

  it("never exposes upstream errors or secrets when the starter throws", async () => {
    const h = setup(() => { throw new Error("401 from https://api-mifit.zepp.com apptoken=SECRET123"); });
    const s = await login(h);
    const res = await post(h, s);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toBe(JSON.stringify({ error: "Could not start the sync" }));
    expect(body).not.toMatch(/SECRET|apptoken|zepp\.com/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the logout and login routes are unchanged (same-origin only, no sync token needed)", async () => {
    const h = setup(() => "started");
    const s = await login(h);
    const out = await h(new Request(ORIGIN + "/dashboard/logout", { method: "POST", headers: { cookie: s.cookie, origin: ORIGIN } }));
    expect(out.status).toBe(303);
    expect((await post(h, s)).status).toBe(401); // the revoked session no longer works
  });
});
