// Read-only web dashboard: /dashboard (login, session cookie, JSON API under /dashboard/api/*, one self-contained page).
// Web-standard APIs only; the node:sqlite access lives in ./data and is injected.
import { RateLimiter, clientIp, isSameOriginPost, parseCookies, randomToken, safeEqual } from "../oauth";
import type { DashboardData } from "./data";
import { SESSION_COOKIE, SESSION_TTL_S, createSessionManager, deriveSessionKeyMaterial, type SessionManager } from "./session";
import { renderDashboardHtml, renderLoginHtml } from "./ui";

const CSRF_COOKIE = "zepp_dash_csrf";
const DASHBOARD_MAX_DAYS = 366;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_IP = 5;
const LOGIN_MAX_GLOBAL = 20;
const MAX_LOGIN_BODY = 4096;
const DEFAULT_FAIL_DELAY_MS = 600;

export interface DashboardOptions {
  ownerPassword: string;
  /** Optional DASHBOARD_SESSION_SECRET (at least 32 characters). Without it the signing key is derived from the owner password. */
  sessionSecret?: string;
  data: DashboardData;
  /**
   * Optional: fetch + store the analysis of one workout from Zepp (server side only, the browser never sees Zepp credentials).
   * Called at most once per workout that has no stored analysis; it must rate-limit itself.
   */
  loadAnalysis?: (workoutId: string) => Promise<{ status: "ok"; analysis: unknown } | { status: "unavailable"; reason: string }>;
  /** Optional: live sync status (next run, running) merged into /dashboard/api/status. */
  syncStatus?: () => unknown;
  now?: () => number;
  /** Pause after a wrong password (default 600 ms). */
  failDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function isDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function securityHeaders(contentType: string, nonce?: string): Headers {
  const h = new Headers();
  h.set("content-type", contentType);
  h.set("cache-control", "no-store");
  h.set("pragma", "no-cache");
  h.set("x-frame-options", "DENY");
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "same-origin");
  h.set("cross-origin-opener-policy", "same-origin");
  h.set("cross-origin-resource-policy", "same-origin");
  h.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("strict-transport-security", "max-age=31536000");
  h.set("x-robots-tag", "noindex, nofollow");
  if (nonce) {
    h.set("content-security-policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; ` +
      `form-action 'self'; base-uri 'none'; frame-ancestors 'none'`);
  }
  return h;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: securityHeaders("application/json; charset=utf-8") });
}
function text(body: string, status: number, extra: Record<string, string> = {}): Response {
  const h = securityHeaders("text/plain; charset=utf-8");
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(body, { status, headers: h });
}
function page(html: (nonce: string) => string, status = 200, cookies: string[] = []): Response {
  const nonce = randomToken("", 18);
  const h = securityHeaders("text/html; charset=utf-8", nonce);
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(html(nonce), { status, headers: h });
}
function redirect(location: string, cookies: string[] = [], status = 302): Response {
  const h = securityHeaders("text/plain; charset=utf-8");
  h.set("location", location);
  for (const c of cookies) h.append("set-cookie", c);
  return new Response(null, { status, headers: h });
}

const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}; Path=/dashboard; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_S}`;
const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/dashboard; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const csrfCookie = (token: string) => `${CSRF_COOKIE}=${token}; Path=/dashboard; HttpOnly; Secure; SameSite=Strict; Max-Age=900`;
const clearCsrfCookie = () => `${CSRF_COOKIE}=; Path=/dashboard; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function intParam(raw: string | null, fallback: number, min: number, max: number): number | null {
  if (raw === null || raw === "") return fallback;
  if (!/^\d{1,5}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function createDashboard(opts: DashboardOptions): (request: Request) => Promise<Response> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const limiter = new RateLimiter(now);
  let sessionsPromise: Promise<SessionManager> | undefined;
  const sessions = () => (sessionsPromise ??= deriveSessionKeyMaterial(opts.ownerPassword, opts.sessionSecret).then(k => createSessionManager(k, now)));
  const { data } = opts;

  async function currentSession(request: Request) {
    const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
    return { token, session: await (await sessions()).verify(token) };
  }

  function loginPage(csrf: string, error?: string, status = 200): Response {
    return page(nonce => renderLoginHtml({ nonce, csrf, ...(error ? { error } : {}) }), status, [csrfCookie(csrf)]);
  }

  async function loginPost(request: Request): Promise<Response> {
    if (!isSameOriginPost(request, new URL(request.url).origin)) return text("Cross-origin request rejected.", 403);
    if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) return text("Unsupported content type.", 415);
    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_LOGIN_BODY) return text("Request too large.", 413);
    const form = new URLSearchParams(new TextDecoder().decode(buf));
    const cookieCsrf = parseCookies(request.headers.get("cookie"))[CSRF_COOKIE];
    if (!cookieCsrf || !(await safeEqual(cookieCsrf, form.get("csrf") ?? ""))) {
      return loginPage(randomToken("", 24), "The form expired. Please try again.", 400);
    }
    const ip = clientIp(request);
    if (limiter.count(`login:${ip}`, LOGIN_WINDOW_MS) >= LOGIN_MAX_PER_IP || limiter.count("login:*", LOGIN_WINDOW_MS) >= LOGIN_MAX_GLOBAL) {
      return withRetryAfter(page(nonce => renderLoginHtml({ nonce, csrf: cookieCsrf, error: "Too many attempts. Try again in 15 minutes.", locked: true }), 429, [csrfCookie(cookieCsrf)]));
    }
    if (!(await safeEqual(form.get("password") ?? "", opts.ownerPassword))) {
      limiter.add(`login:${ip}`); limiter.add("login:*");
      await sleep(opts.failDelayMs ?? DEFAULT_FAIL_DELAY_MS);
      return loginPage(cookieCsrf, "Incorrect password.", 401);
    }
    const { token } = await (await sessions()).issue();
    return redirect("/dashboard", [sessionCookie(token), clearCsrfCookie()], 303);
  }

  function withRetryAfter(response: Response): Response { response.headers.set("retry-after", "900"); return response; }

  async function api(request: Request, url: URL, path: string): Promise<Response> {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    const q = url.searchParams;
    try {
      switch (path) {
        case "overview": return json(data.overview());
        case "exercises": return json(data.exercises());
        case "status": return json(data.status(opts.syncStatus ? safeStatus(opts.syncStatus) : undefined));
        case "trends": case "weight": case "charge": {
          const days = intParam(q.get("days"), 30, 1, DASHBOARD_MAX_DAYS);
          if (days === null) return json({ error: `days must be an integer from 1 to ${DASHBOARD_MAX_DAYS}` }, 400);
          if (path === "trends") return json(data.trends(days));
          if (path === "weight") return json(data.weight(days));
          const date = q.get("date");
          if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must use YYYY-MM-DD" }, 400);
          return json(data.charge(days, date ?? undefined));
        }
        case "workouts": {
          const limit = intParam(q.get("limit"), 25, 1, 100);
          const offset = intParam(q.get("offset"), 0, 0, 100000);
          const dayParam = q.get("days");
          const days = dayParam === null || dayParam === "" ? undefined : intParam(dayParam, 0, 1, DASHBOARD_MAX_DAYS);
          const type = q.get("type") ?? undefined;
          if (limit === null || offset === null || days === null || (type !== undefined && type.length > 60)) return json({ error: "Invalid query parameters" }, 400);
          return json(data.workouts({ limit, offset, ...(days !== undefined ? { days } : {}), ...(type ? { type } : {}) }));
        }
        default: {
          if (path.startsWith("workouts/") && path.endsWith("/analysis")) {
            let id = "";
            try { id = decodeURIComponent(path.slice("workouts/".length, -"/analysis".length)); } catch { /* falls through to 404 */ }
            if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) return json({ error: "Not found" }, 404);
            const found = data.workout(id) as { workout: { activity_type?: unknown; zepp_type?: unknown } } | null;
            if (!found) return json({ error: "Not found" }, 404);
            if (found.workout.zepp_type === 52 || /strength/.test(String(found.workout.activity_type))) return json({ status: "unavailable", reason: "strength" });
            const stored = data.analysis(id);
            if (stored?.status === "ok" && stored.analysis) return json({ status: "ok", source: "stored", fetched_at: stored.fetched_at, analysis: stored.analysis });
            if (stored?.status === "empty") return json({ status: "unavailable", reason: "no_detail" });
            if (!opts.loadAnalysis) return json({ status: "unavailable", reason: "not_synced" });
            const loaded = await opts.loadAnalysis(id);
            return json(loaded.status === "ok" ? { status: "ok", source: "fetched", analysis: loaded.analysis } : loaded);
          }
          if (path.startsWith("workouts/")) {
            // Workout ids look like "zepp:<trackid>:<source>", so the colons arrive percent-encoded.
            let id = "";
            try { id = decodeURIComponent(path.slice("workouts/".length)); } catch { /* falls through to 404 */ }
            if (/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) {
              const detail = data.workout(id);
              if (detail) return json(detail);
            }
            return json({ error: "Not found" }, 404);
          }
          return json({ error: "Not found" }, 404);
        }
      }
    } catch (error) {
      console.error(`[zepp] dashboard query failed: ${error instanceof Error ? error.name : "error"}`);
      return json({ error: "Dashboard query failed" }, 500);
    }
  }

  function safeStatus(provider: () => unknown): unknown {
    try {
      const s = provider() as Record<string, unknown>;
      // Only the schedule/state bits; never file paths or settings.
      const schedule = (s.schedule ?? {}) as Record<string, unknown>;
      return { enabled: s.enabled ?? null, running: s.running ?? null, next_run_at: schedule.next_run_at ?? null, local_hour: schedule.local_hour ?? null };
    } catch { return undefined; }
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    if (path === "/dashboard/login") {
      if (method === "GET") {
        if ((await currentSession(request)).session) return redirect("/dashboard");
        return loginPage(randomToken("", 24));
      }
      if (method === "POST") return loginPost(request);
      return text("Method not allowed", 405, { allow: "GET, POST" });
    }

    const { token, session } = await currentSession(request);

    if (path === "/dashboard/logout") {
      if (method !== "POST") return text("Method not allowed", 405, { allow: "POST" });
      if (!isSameOriginPost(request, url.origin)) return text("Cross-origin request rejected.", 403);
      await (await sessions()).revoke(token);
      return redirect("/dashboard/login", [clearSessionCookie()], 303);
    }

    if (path.startsWith("/dashboard/api/") || path === "/dashboard/api") {
      if (!session) return json({ error: "Authentication required" }, 401);
      return api(request, url, path.slice("/dashboard/api/".length));
    }

    if (path === "/dashboard") {
      if (method !== "GET") return text("Method not allowed", 405, { allow: "GET" });
      if (!session) return redirect("/dashboard/login");
      return page(nonce => renderDashboardHtml(nonce));
    }
    return session ? text("Not Found", 404) : redirect("/dashboard/login");
  };
}
