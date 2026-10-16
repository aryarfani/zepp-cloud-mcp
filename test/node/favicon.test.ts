import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { createDashboard } from "../../src/dashboard/handler";
import { seedDashboardDb } from "./dashboard-seed";

const ORIGIN = "https://zepp.test";
const PASSWORD = "correct horse battery staple";
let dir: string, file: string; const opened: DashboardData[] = [];
beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), "zepp-fav-")); file = path.join(dir, "zepp.db"); seedDashboardDb(file); });
afterAll(() => { for (const d of opened) d.close(); rmSync(dir, { recursive: true, force: true }); });
const make = () => { const data = new DashboardData(file, { timezone: "Asia/Jakarta" }); opened.push(data); return createDashboard({ ownerPassword: PASSWORD, data, failDelayMs: 0 }); };
const get = (h: (r: Request) => Promise<Response>, p: string, cookie?: string) => h(new Request(ORIGIN + p, cookie ? { headers: { cookie } } : {}));

describe("dashboard favicon", () => {
  it("serves every icon without a session, and still protects everything else", async () => {
    const h = make();
    const types: Record<string, string> = { "/dashboard/favicon.svg": "image/svg+xml; charset=utf-8", "/dashboard/favicon-16.png": "image/png", "/dashboard/favicon-32.png": "image/png", "/dashboard/apple-touch-icon.png": "image/png", "/dashboard/icon-192.png": "image/png", "/dashboard/icon-512.png": "image/png", "/dashboard/favicon.ico": "image/x-icon" };
    for (const [p, t] of Object.entries(types)) {
      const res = await get(h, p);
      expect(res.status, p).toBe(200); expect(res.headers.get("content-type")).toBe(t);
      expect(res.headers.get("cache-control")).toContain("max-age"); expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect((await get(h, "/dashboard")).status).toBe(302);
    for (const p of ["overview", "recovery", "training", "status"]) expect((await get(h, "/dashboard/api/" + p)).status).toBe(401);
    expect((await get(h, "/dashboard/icon-1024.png")).status).toBe(302); // unknown path: the normal auth redirect, nothing leaks
  });

  it("links the icons from the login page and the dashboard, and the CSP allows them", async () => {
    const h = make();
    const login = await get(h, "/dashboard/login");
    const html = await login.text();
    for (const frag of ['rel="icon" href="/dashboard/favicon.svg" type="image/svg+xml"', 'href="/dashboard/favicon-32.png"', 'href="/dashboard/favicon-16.png"', 'rel="apple-touch-icon" href="/dashboard/apple-touch-icon.png"', 'rel="shortcut icon" href="/favicon.ico"']) expect(html).toContain(frag);
    expect(login.headers.get("content-security-policy")).toMatch(/img-src 'self'/);
    const csrf = login.headers.getSetCookie()[0]!.split(";")[0]!.split("=")[1]!;
    const res = await h(new Request(ORIGIN + "/dashboard/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN, cookie: "zepp_dash_csrf=" + csrf }, body: new URLSearchParams({ csrf, password: PASSWORD }).toString() }));
    const cookie = res.headers.getSetCookie().find(c => c.startsWith("zepp_dash="))!.split(";")[0]!;
    const page = await get(h, "/dashboard", cookie);
    expect(await page.text()).toContain('rel="apple-touch-icon" href="/dashboard/apple-touch-icon.png"');
    expect(page.headers.get("content-security-policy")).toMatch(/img-src 'self'/);
  });
});
