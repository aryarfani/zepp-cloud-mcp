// OAuth 2.1 authorization server for the Zepp MCP (single owner, dynamic client registration, PKCE S256).
// Web-standard APIs only (Request/Response/crypto.subtle) so it runs in Node and in workerd tests.

export const OAUTH_SCOPE = "mcp";
export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 30 * 24 * 3600;
const CODE_TTL_S = 300;
const REFRESH_REUSE_GRACE_S = 30;
const MAX_CLIENTS = 100;
const MAX_BODY_BYTES = 16 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_IP = 5;
const LOGIN_MAX_GLOBAL = 20;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_MAX_PER_IP = 20;
const REGISTER_MAX_GLOBAL = 100;

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";

export interface ClientRecord {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: AuthMethod;
  client_secret_hash?: string;
  created_at: number;
}
export interface CodeRecord {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  expires_at: number;
}
export interface TokenRecord {
  client_id: string;
  scope: string;
  expires_at: number;
  family: string;
  used_at?: number;
}
export interface OAuthState {
  version: 1;
  clients: Record<string, ClientRecord>;
  codes: Record<string, CodeRecord>;
  access: Record<string, TokenRecord>;
  refresh: Record<string, TokenRecord>;
}
export interface OAuthStore {
  read(): OAuthState;
  write(state: OAuthState): void;
}

export function emptyState(): OAuthState {
  return { version: 1, clients: {}, codes: {}, access: {}, refresh: {} };
}

export class MemoryOAuthStore implements OAuthStore {
  private state: OAuthState = emptyState();
  read(): OAuthState { return structuredClone(this.state); }
  write(state: OAuthState): void { this.state = structuredClone(state); }
}

export interface OAuthOptions {
  ownerPassword: string;
  store: OAuthStore;
  /** Fixed public origin, e.g. https://zepp.arfani.my.id. Falls back to the request origin. */
  issuer?: string | undefined;
  now?: () => number;
}

export interface OAuthProvider {
  handle(request: Request): Promise<Response | null>;
  authenticate(request: Request): Promise<boolean>;
  challengeHeader(request: Request, invalidToken: boolean): string;
}

// ---------- helpers ----------
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomToken(prefix: string, bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return prefix + b64url(a);
}
async function sha256(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}
async function sha256Hex(input: string): Promise<string> {
  return [...(await sha256(input))].map(v => v.toString(16).padStart(2, "0")).join("");
}
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function isAllowedRedirectUri(raw: string): boolean {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.username || u.password || u.hash) return false;
  if (u.protocol === "http:") {
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  }
  if (u.protocol !== "https:" || u.port) return false;
  const p = u.pathname;
  if (u.hostname === "chatgpt.com") {
    return p === "/connector_platform_oauth_redirect" || (p.startsWith("/connector/oauth/") && p.length > "/connector/oauth/".length);
  }
  if (u.hostname === "chat.openai.com") {
    return p === "/connector_platform_oauth_redirect" ||
      (p.startsWith("/connector/oauth/") && p.length > "/connector/oauth/".length) ||
      (/^\/aip\/[A-Za-z0-9_-]+\/oauth\/callback$/.test(p));
  }
  if (u.hostname === "platform.openai.com") return p === "/apps-manage/oauth";
  if (u.hostname === "claude.ai") return p === "/api/mcp/auth_callback";
  return false;
}

class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number) {}
  count(key: string, windowMs: number): number {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter(v => t - v < windowMs);
    if (list.length) this.hits.set(key, list); else this.hits.delete(key);
    return list.length;
  }
  add(key: string): void {
    const list = this.hits.get(key) ?? [];
    list.push(this.now());
    this.hits.set(key, list);
    if (this.hits.size > 5000) this.hits.clear();
  }
}

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", ...extra }
  });
}
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "600"
};
function oauthError(error: string, description: string, status = 400, extra: Record<string, string> = {}): Response {
  return jsonResponse({ error, error_description: description }, status, { ...CORS, ...extra });
}
function htmlPage(title: string, body: string, status = 200, extra: Record<string, string> = {}): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;background:#0f1419;color:#e6edf3;display:flex;justify-content:center;padding:2rem}main{max-width:26rem;width:100%;background:#1a212a;border-radius:12px;padding:1.5rem}h1{font-size:1.2rem;margin-top:0}input{width:100%;box-sizing:border-box;padding:.6rem;margin:.5rem 0 1rem;border-radius:6px;border:1px solid #3a4655;background:#0f1419;color:#e6edf3}button{padding:.6rem 1rem;border-radius:6px;border:0;margin-right:.5rem;cursor:pointer;font-size:1rem}.ok{background:#2f81f7;color:#fff}.no{background:#3a4655;color:#e6edf3}.err{color:#ff7b72}code{word-break:break-all}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      ...extra
    }
  });
}
/**
 * Same-origin check for the consent POST. The expected origin comes from the configured public issuer,
 * never from the request URL (behind nginx the request URL is http://127.0.0.1:PORT).
 * - Origin present and not "null": must equal the expected origin.
 * - Origin absent or "null" (Chrome sends "null" for same-origin form POSTs under Referrer-Policy: no-referrer):
 *   use Sec-Fetch-Site (browser-controlled, not forgeable by pages): only "same-origin" passes;
 *   else the Referer origin must match; with no signal at all the request is rejected.
 * The per-form CSRF cookie/token check still runs afterwards.
 */
export function isSameOriginPost(request: Request, expectedOrigin: string): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== "null") return origin === expectedOrigin;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site.toLowerCase() === "same-origin";
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).origin === expectedOrigin; } catch { return false; }
  }
  return false;
}
function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") || "unknown";
}
async function readBody(request: Request): Promise<string | null> {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) return null;
  return new TextDecoder().decode(buf);
}

const CSRF_COOKIE = "zepp_oauth_csrf";

// ---------- provider ----------
export function createOAuth(opts: OAuthOptions): OAuthProvider {
  const now = opts.now ?? (() => Date.now());
  const nowS = () => Math.floor(now() / 1000);
  const limiter = new RateLimiter(now);
  const store = opts.store;
  const fixedIssuer = opts.issuer ? opts.issuer.replace(/\/+$/, "") : undefined;
  const issuerOf = (request: Request) => fixedIssuer ?? new URL(request.url).origin;

  function prune(state: OAuthState): void {
    const t = nowS();
    for (const [k, v] of Object.entries(state.codes)) if (v.expires_at <= t) delete state.codes[k];
    for (const [k, v] of Object.entries(state.access)) if (v.expires_at <= t) delete state.access[k];
    for (const [k, v] of Object.entries(state.refresh)) if (v.expires_at <= t) delete state.refresh[k];
  }
  function revokeFamily(state: OAuthState, family: string): void {
    for (const [k, v] of Object.entries(state.access)) if (v.family === family) delete state.access[k];
    for (const [k, v] of Object.entries(state.refresh)) if (v.family === family) delete state.refresh[k];
  }

  function protectedResourceMetadata(request: Request): Response {
    const issuer = issuerOf(request);
    return jsonResponse({
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [OAUTH_SCOPE],
      resource_name: "Zepp Cloud MCP"
    }, 200, CORS);
  }
  function authServerMetadata(request: Request): Response {
    const issuer = issuerOf(request);
    return jsonResponse({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      revocation_endpoint: `${issuer}/revoke`,
      scopes_supported: [OAUTH_SCOPE],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      authorization_response_iss_parameter_supported: true,
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"]
    }, 200, CORS);
  }

  // ----- dynamic client registration (RFC 7591) -----
  async function register(request: Request): Promise<Response> {
    const ip = clientIp(request);
    if (limiter.count(`reg:${ip}`, REGISTER_WINDOW_MS) >= REGISTER_MAX_PER_IP || limiter.count("reg:*", REGISTER_WINDOW_MS) >= REGISTER_MAX_GLOBAL) {
      return oauthError("invalid_client_metadata", "Too many registrations; try again later", 429);
    }
    limiter.add(`reg:${ip}`); limiter.add("reg:*");
    const raw = await readBody(request);
    if (raw === null) return oauthError("invalid_client_metadata", "Request body too large", 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return oauthError("invalid_client_metadata", "Body must be JSON"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return oauthError("invalid_client_metadata", "Body must be a JSON object");
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || uris.length < 1 || uris.length > 10) return oauthError("invalid_redirect_uri", "redirect_uris must be an array of 1-10 URIs");
    for (const u of uris) {
      if (typeof u !== "string" || !isAllowedRedirectUri(u)) return oauthError("invalid_redirect_uri", "redirect_uri is not allowed");
    }
    const grantTypes: unknown = body.grant_types ?? ["authorization_code"];
    if (!Array.isArray(grantTypes) || !grantTypes.every(g => g === "authorization_code" || g === "refresh_token") || !grantTypes.includes("authorization_code")) {
      return oauthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported");
    }
    const responseTypes: unknown = body.response_types ?? ["code"];
    if (!Array.isArray(responseTypes) || !responseTypes.every(r => r === "code")) {
      return oauthError("invalid_client_metadata", "Only the code response type is supported");
    }
    const method: unknown = body.token_endpoint_auth_method ?? "none";
    if (method !== "none" && method !== "client_secret_post" && method !== "client_secret_basic") {
      return oauthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method");
    }
    const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : "MCP client";
    const client_id = randomToken("zmc_", 18);
    const record: ClientRecord = {
      client_id, client_name: name, redirect_uris: [...new Set(uris as string[])],
      token_endpoint_auth_method: method, created_at: nowS()
    };
    let secret: string | undefined;
    if (method !== "none") {
      secret = randomToken("zms_", 32);
      record.client_secret_hash = await sha256Hex(secret);
    }
    const state = store.read();
    prune(state);
    state.clients[client_id] = record;
    const ids = Object.values(state.clients).sort((a, b) => a.created_at - b.created_at).map(c => c.client_id);
    while (ids.length > MAX_CLIENTS) {
      const drop = ids.shift()!;
      delete state.clients[drop];
      for (const [k, v] of Object.entries(state.access)) if (v.client_id === drop) delete state.access[k];
      for (const [k, v] of Object.entries(state.refresh)) if (v.client_id === drop) delete state.refresh[k];
      for (const [k, v] of Object.entries(state.codes)) if (v.client_id === drop) delete state.codes[k];
    }
    store.write(state);
    return jsonResponse({
      client_id,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: record.created_at,
      client_name: name,
      redirect_uris: record.redirect_uris,
      grant_types: grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: method
    }, 201, CORS);
  }

  // ----- authorization endpoint -----
  type AuthCheck =
    | { kind: "page_error"; message: string }
    | { kind: "redirect_error"; redirect_uri: string; state: string | undefined; error: string; description: string }
    | { kind: "ok"; client: ClientRecord; redirect_uri: string; state: string | undefined; code_challenge: string; resources: string[] };

  function checkAuthRequest(get: (n: string) => string | undefined, getAll: (n: string) => string[], issuer: string): AuthCheck {
    const state = store.read();
    const client_id = get("client_id");
    const redirect_uri = get("redirect_uri");
    const client = client_id ? state.clients[client_id] : undefined;
    if (!client) return { kind: "page_error", message: "Unknown client. Re-add the connector so it registers again." };
    if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
      return { kind: "page_error", message: "The redirect URI does not match this client's registration." };
    }
    const st = get("state");
    const fail = (error: string, description: string): AuthCheck => ({ kind: "redirect_error", redirect_uri, state: st, error, description });
    if (get("response_type") !== "code") return fail("unsupported_response_type", "response_type must be code");
    const challenge = get("code_challenge");
    if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return fail("invalid_request", "A valid S256 code_challenge is required");
    if (get("code_challenge_method") !== "S256") return fail("invalid_request", "code_challenge_method must be S256");
    const resources = getAll("resource");
    for (const r of resources) {
      const norm = r.replace(/\/+$/, "");
      if (norm !== issuer && norm !== `${issuer}/mcp`) return fail("invalid_target", "Unknown resource");
    }
    return { kind: "ok", client, redirect_uri, state: st, code_challenge: challenge, resources };
  }

  function redirectWith(redirect_uri: string, params: Record<string, string | undefined>, issuer: string, extra: Record<string, string> = {}): Response {
    const u = new URL(redirect_uri);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
    u.searchParams.set("iss", issuer);
    return new Response(null, { status: 303, headers: { location: u.toString(), "cache-control": "no-store", ...extra } });
  }

  function loginForm(check: Extract<AuthCheck, { kind: "ok" }>, csrf: string, fields: Record<string, string>, error?: string): string {
    const hidden = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join("");
    const host = new URL(check.redirect_uri).host;
    return `<h1>Authorize access to Zepp data</h1>
<p><strong>${escapeHtml(check.client.client_name)}</strong> is requesting read-only access to your Zepp health data via this MCP server.</p>
<p>After you decide, you return to <code>${escapeHtml(host)}</code>.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/authorize">${hidden}<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<label>Owner password<input type="password" name="password" autocomplete="current-password" required autofocus></label>
<button class="ok" type="submit" name="action" value="approve">Authorize</button><button class="no" type="submit" name="action" value="deny" formnovalidate>Deny</button></form>`;
  }

  async function authorizeGet(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const issuer = issuerOf(request);
    const p = url.searchParams;
    const check = checkAuthRequest(n => p.get(n) ?? undefined, n => p.getAll(n), issuer);
    if (check.kind === "page_error") return htmlPage("Authorization error", `<h1>Authorization error</h1><p class="err">${escapeHtml(check.message)}</p>`, 400);
    if (check.kind === "redirect_error") {
      return redirectWith(check.redirect_uri, { error: check.error, error_description: check.description, state: check.state }, issuer);
    }
    const csrf = randomToken("", 24);
    const fields: Record<string, string> = {
      response_type: "code", client_id: check.client.client_id, redirect_uri: check.redirect_uri,
      code_challenge: check.code_challenge, code_challenge_method: "S256"
    };
    if (check.state !== undefined) fields.state = check.state;
    const html = loginForm(check, csrf, fields);
    // resource params are re-derived as hidden inputs (names may repeat)
    const withResources = html.replace("<input type=\"hidden\" name=\"csrf\"", check.resources.map(r => `<input type="hidden" name="resource" value="${escapeHtml(r)}">`).join("") + "<input type=\"hidden\" name=\"csrf\"");
    return htmlPage("Authorize", withResources, 200, {
      "set-cookie": `${CSRF_COOKIE}=${csrf}; Path=/authorize; HttpOnly; Secure; SameSite=Strict; Max-Age=900`
    });
  }

  async function authorizePost(request: Request): Promise<Response> {
    const issuer = issuerOf(request);
    if (!isSameOriginPost(request, new URL(issuer).origin)) {
      return htmlPage("Authorization error", `<h1>Authorization error</h1><p class="err">Cross-origin request rejected.</p>`, 403);
    }
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.startsWith("application/x-www-form-urlencoded")) {
      return htmlPage("Authorization error", `<h1>Authorization error</h1><p class="err">Unsupported content type.</p>`, 415);
    }
    const raw = await readBody(request);
    if (raw === null) return htmlPage("Authorization error", `<h1>Authorization error</h1><p class="err">Request too large.</p>`, 413);
    const form = new URLSearchParams(raw);
    const check = checkAuthRequest(n => form.get(n) ?? undefined, n => form.getAll(n), issuer);
    if (check.kind === "page_error") return htmlPage("Authorization error", `<h1>Authorization error</h1><p class="err">${escapeHtml(check.message)}</p>`, 400);
    if (check.kind === "redirect_error") {
      return redirectWith(check.redirect_uri, { error: check.error, error_description: check.description, state: check.state }, issuer);
    }
    const cookieCsrf = parseCookies(request.headers.get("cookie"))[CSRF_COOKIE];
    const formCsrf = form.get("csrf") ?? "";
    if (!cookieCsrf || !(await safeEqual(cookieCsrf, formCsrf))) {
      return htmlPage("Authorization error", `<h1>Authorization error</h1><p class="err">Session expired or invalid. Go back to the connector and start again.</p>`, 400);
    }
    const clearCookie = { "set-cookie": `${CSRF_COOKIE}=; Path=/authorize; HttpOnly; Secure; SameSite=Strict; Max-Age=0` };
    if (form.get("action") === "deny") {
      return redirectWith(check.redirect_uri, { error: "access_denied", error_description: "The owner denied the request", state: check.state }, issuer, clearCookie);
    }
    const ip = clientIp(request);
    if (limiter.count(`login:${ip}`, LOGIN_WINDOW_MS) >= LOGIN_MAX_PER_IP || limiter.count("login:*", LOGIN_WINDOW_MS) >= LOGIN_MAX_GLOBAL) {
      return htmlPage("Too many attempts", `<h1>Too many attempts</h1><p class="err">Try again in 15 minutes.</p>`, 429, { "retry-after": "900" });
    }
    const password = form.get("password") ?? "";
    if (!(await safeEqual(password, opts.ownerPassword))) {
      limiter.add(`login:${ip}`); limiter.add("login:*");
      const fields: Record<string, string> = {
        response_type: "code", client_id: check.client.client_id, redirect_uri: check.redirect_uri,
        code_challenge: check.code_challenge, code_challenge_method: "S256"
      };
      if (check.state !== undefined) fields.state = check.state;
      const html = loginForm(check, cookieCsrf, fields, "Incorrect password.")
        .replace("<input type=\"hidden\" name=\"csrf\"", check.resources.map(r => `<input type="hidden" name="resource" value="${escapeHtml(r)}">`).join("") + "<input type=\"hidden\" name=\"csrf\"");
      return htmlPage("Authorize", html, 401);
    }
    const code = randomToken("zmk_", 32);
    const codeHash = await sha256Hex(code);
    const s = store.read();
    prune(s);
    s.codes[codeHash] = {
      client_id: check.client.client_id, redirect_uri: check.redirect_uri, code_challenge: check.code_challenge,
      scope: OAUTH_SCOPE, expires_at: nowS() + CODE_TTL_S
    };
    store.write(s);
    return redirectWith(check.redirect_uri, { code, state: check.state }, issuer, clearCookie);
  }

  // ----- token endpoint -----
  async function authenticateClient(request: Request, form: URLSearchParams): Promise<ClientRecord | Response> {
    let id = form.get("client_id") ?? undefined;
    let secret = form.get("client_secret") ?? undefined;
    const basic = request.headers.get("authorization");
    if (basic?.startsWith("Basic ")) {
      try {
        const decoded = atob(basic.slice(6));
        const i = decoded.indexOf(":");
        if (i > 0) { id = decodeURIComponent(decoded.slice(0, i)); secret = decodeURIComponent(decoded.slice(i + 1)); }
      } catch { return oauthError("invalid_client", "Malformed Authorization header", 401); }
    }
    if (!id) return oauthError("invalid_client", "client_id is required", 401);
    const client = store.read().clients[id];
    if (!client) return oauthError("invalid_client", "Unknown client", 401);
    if (client.token_endpoint_auth_method !== "none") {
      if (!secret || !client.client_secret_hash || !(await safeEqual(await sha256Hex(secret), client.client_secret_hash))) {
        return oauthError("invalid_client", "Client authentication failed", 401);
      }
    }
    return client;
  }

  async function issuePair(client_id: string, family: string): Promise<Record<string, unknown>> {
    const access = randomToken("zma_");
    const refresh = randomToken("zmr_");
    const [ah, rh] = await Promise.all([sha256Hex(access), sha256Hex(refresh)]);
    const s = store.read();
    prune(s);
    const t = nowS();
    s.access[ah] = { client_id, scope: OAUTH_SCOPE, expires_at: t + ACCESS_TTL_S, family };
    s.refresh[rh] = { client_id, scope: OAUTH_SCOPE, expires_at: t + REFRESH_TTL_S, family };
    store.write(s);
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: OAUTH_SCOPE };
  }

  async function token(request: Request): Promise<Response> {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.startsWith("application/x-www-form-urlencoded")) return oauthError("invalid_request", "Content-Type must be application/x-www-form-urlencoded");
    const raw = await readBody(request);
    if (raw === null) return oauthError("invalid_request", "Request body too large", 413);
    const form = new URLSearchParams(raw);
    const auth = await authenticateClient(request, form);
    if (auth instanceof Response) return auth;
    const client = auth;
    const grant = form.get("grant_type");

    if (grant === "authorization_code") {
      const code = form.get("code");
      const verifier = form.get("code_verifier");
      const redirect_uri = form.get("redirect_uri");
      if (!code || !verifier || !redirect_uri) return oauthError("invalid_request", "code, code_verifier and redirect_uri are required");
      const codeHash = await sha256Hex(code);
      const s = store.read();
      prune(s);
      const rec = s.codes[codeHash];
      delete s.codes[codeHash]; // single use, even on failure
      store.write(s);
      if (!rec || rec.client_id !== client.client_id) return oauthError("invalid_grant", "Invalid or expired authorization code");
      if (rec.redirect_uri !== redirect_uri) return oauthError("invalid_grant", "redirect_uri mismatch");
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError("invalid_grant", "Invalid code_verifier");
      const challenge = b64url(await sha256(verifier));
      if (!(await safeEqual(challenge, rec.code_challenge))) return oauthError("invalid_grant", "PKCE verification failed");
      return jsonResponse(await issuePair(client.client_id, randomToken("", 12)), 200, CORS);
    }

    if (grant === "refresh_token") {
      const rt = form.get("refresh_token");
      if (!rt) return oauthError("invalid_request", "refresh_token is required");
      const rh = await sha256Hex(rt);
      const s = store.read();
      prune(s);
      const rec = s.refresh[rh];
      if (!rec || rec.client_id !== client.client_id) return oauthError("invalid_grant", "Invalid or expired refresh token");
      if (rec.used_at !== undefined) {
        if (nowS() - rec.used_at > REFRESH_REUSE_GRACE_S) { revokeFamily(s, rec.family); store.write(s); }
        return oauthError("invalid_grant", "Refresh token already used");
      }
      rec.used_at = nowS();
      store.write(s);
      return jsonResponse(await issuePair(client.client_id, rec.family), 200, CORS);
    }
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
  }

  async function revoke(request: Request): Promise<Response> {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.startsWith("application/x-www-form-urlencoded")) return oauthError("invalid_request", "Content-Type must be application/x-www-form-urlencoded");
    const raw = await readBody(request);
    if (raw === null) return oauthError("invalid_request", "Request body too large", 413);
    const form = new URLSearchParams(raw);
    const auth = await authenticateClient(request, form);
    if (auth instanceof Response) return auth;
    const tok = form.get("token");
    if (tok) {
      const h = await sha256Hex(tok);
      const s = store.read();
      const rec = s.refresh[h] ?? s.access[h];
      if (rec && rec.client_id === auth.client_id) { revokeFamily(s, rec.family); store.write(s); }
    }
    return new Response(null, { status: 200, headers: { "cache-control": "no-store", ...CORS } });
  }

  // ----- public surface -----
  async function handle(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    const method = request.method;
    const wellKnown = new Set([
      "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp",
      "/.well-known/openid-configuration", "/.well-known/openid-configuration/mcp", "/mcp/.well-known/openid-configuration"
    ]);
    const corsPaths = new Set(["/register", "/token", "/revoke"]);
    if ((wellKnown.has(path) || corsPaths.has(path)) && method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (wellKnown.has(path)) {
      if (method !== "GET" && method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      return path.startsWith("/.well-known/oauth-protected-resource") ? protectedResourceMetadata(request) : authServerMetadata(request);
    }
    const postOnly = (fn: (r: Request) => Promise<Response>) =>
      method === "POST" ? fn(request) : Promise.resolve(new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }));
    if (path === "/register") return postOnly(register);
    if (path === "/token") return postOnly(token);
    if (path === "/revoke") return postOnly(revoke);
    if (path === "/authorize") {
      if (method === "GET") return authorizeGet(request);
      if (method === "POST") return authorizePost(request);
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, POST" } });
    }
    return null;
  }

  async function authenticate(request: Request): Promise<boolean> {
    const value = request.headers.get("authorization");
    if (!value?.startsWith("Bearer ")) return false;
    const tok = value.slice(7).trim();
    if (!tok.startsWith("zma_") || tok.length > 200) return false;
    const rec = store.read().access[await sha256Hex(tok)];
    return !!rec && rec.expires_at > nowS();
  }

  function challengeHeader(request: Request, invalidToken: boolean): string {
    const meta = `${issuerOf(request)}/.well-known/oauth-protected-resource/mcp`;
    const err = invalidToken ? `error="invalid_token", error_description="The access token is invalid or expired", ` : "";
    return `Bearer ${err}resource_metadata="${meta}", scope="${OAUTH_SCOPE}"`;
  }

  return { handle, authenticate, challengeHeader };
}