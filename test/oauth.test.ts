import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createOAuth, isAllowedRedirectUri, MemoryOAuthStore } from "../src/oauth";

const ISSUER = "https://zepp.example.test";
const PASSWORD = "correct-horse-battery-staple";
const STATIC = "static-bearer-secret-for-tests";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

const env = {
  MCP_SECRET: STATIC,
  ZEPP_APP_TOKEN: "fake-app-token",
  ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
  USER_TIMEZONE: "Asia/Jakarta"
} as unknown as Env;

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

function setup(clock = { t: 1_800_000_000_000 }) {
  const store = new MemoryOAuthStore();
  const oauth = createOAuth({ ownerPassword: PASSWORD, store, issuer: ISSUER, now: () => clock.t });
  const app = createApp({ env, oauth });
  const call = (path: string, init: RequestInit = {}) => app(new Request(ISSUER + path, init));
  const form = (body: Record<string, string>) => ({
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": "203.0.113.9" },
    body: new URLSearchParams(body).toString()
  });
  async function register(extra: Record<string, unknown> = {}) {
    const res = await call("/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], ...extra })
    });
    return res;
  }
  async function authorize(client_id: string, challenge: string, opts: { password?: string; redirect?: string; state?: string } = {}) {
    const params = {
      response_type: "code", client_id, redirect_uri: opts.redirect ?? REDIRECT, state: opts.state ?? "st-123",
      code_challenge: challenge, code_challenge_method: "S256", resource: ISSUER + "/mcp"
    };
    const page = await call("/authorize?" + new URLSearchParams(params));
    expect(page.status).toBe(200);
    const html = await page.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(cookie).toContain(csrf);
    const post = await call("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: ISSUER, "x-real-ip": "203.0.113.9" },
      body: new URLSearchParams({ ...params, csrf, password: opts.password ?? PASSWORD, action: "approve" }).toString()
    });
    return post;
  }
  const mcpInit = (token: string) => call("/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })
  });
  async function fullFlow() {
    const reg = await (await register()).json() as any;
    const { verifier, challenge } = await pkce();
    const res = await authorize(reg.client_id, challenge);
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    const code = loc.searchParams.get("code")!;
    const tok = await call("/token", form({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: reg.client_id }));
    return { reg, loc, code, verifier, tok };
  }
  return { store, call, form, register, authorize, mcpInit, fullFlow };
}

describe("redirect URI policy", () => {
  it("allows ChatGPT and localhost, rejects the rest", () => {
    expect(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/abc123")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:3000/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://chatgpt.com.evil.test/connector_platform_oauth_redirect")).toBe(false);
    expect(isAllowedRedirectUri("https://chatgpt.com/other")).toBe(false);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/")).toBe(false);
    expect(isAllowedRedirectUri("http://evil.test/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/x#frag")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
  });
});

describe("discovery and challenge", () => {
  it("serves metadata", async () => {
    const { call } = setup();
    for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const body = await (await call(p)).json() as any;
      expect(body.resource).toBe(ISSUER + "/mcp");
      expect(body.authorization_servers).toEqual([ISSUER]);
    }
    for (const p of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
      const body = await (await call(p)).json() as any;
      expect(body.issuer).toBe(ISSUER);
      expect(body.authorization_endpoint).toBe(ISSUER + "/authorize");
      expect(body.token_endpoint).toBe(ISSUER + "/token");
      expect(body.registration_endpoint).toBe(ISSUER + "/register");
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    }
  });

  it("401 on /mcp carries resource_metadata", async () => {
    const { call } = setup();
    const res = await call("/mcp", { method: "POST" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp"`);
    const bad = await call("/mcp", { method: "POST", headers: { authorization: "Bearer zma_nope" } });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain("invalid_token");
  });

  it("still accepts the static bearer", async () => {
    const { mcpInit } = setup();
    const res = await mcpInit(STATIC);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("zepp-cloud-mcp");
  });
});

describe("registration", () => {
  it("registers a public client", async () => {
    const { register } = setup();
    const res = await register();
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.client_id).toMatch(/^zmc_/);
    expect(body.client_secret).toBeUndefined();
    expect(body.token_endpoint_auth_method).toBe("none");
  });
  it("rejects bad redirect URIs and bad bodies", async () => {
    const { register, call } = setup();
    expect((await register({ redirect_uris: ["https://evil.test/cb"] })).status).toBe(400);
    expect((await register({ redirect_uris: [] })).status).toBe(400);
    expect((await register({ grant_types: ["password"] })).status).toBe(400);
    expect((await call("/register", { method: "POST", body: "not json" })).status).toBe(400);
  });
  it("issues a hashed secret for confidential clients", async () => {
    const { register, store } = setup();
    const body = await (await register({ token_endpoint_auth_method: "client_secret_post" })).json() as any;
    expect(body.client_secret).toMatch(/^zms_/);
    expect(JSON.stringify(store.read())).not.toContain(body.client_secret);
  });
});

describe("authorization code flow", () => {
  it("register -> authorize -> token -> /mcp -> refresh", async () => {
    const { fullFlow, call, form, mcpInit, store } = setup();
    const { reg, loc, tok } = await fullFlow();
    expect(loc.origin + loc.pathname).toBe(REDIRECT);
    expect(loc.searchParams.get("state")).toBe("st-123");
    expect(loc.searchParams.get("iss")).toBe(ISSUER);
    expect(tok.status).toBe(200);
    const pair = await tok.json() as any;
    expect(pair.token_type).toBe("Bearer");
    expect(pair.expires_in).toBe(3600);
    expect(pair.access_token).toMatch(/^zma_/);
    expect(pair.refresh_token).toMatch(/^zmr_/);

    // tokens are hashed at rest
    const dump = JSON.stringify(store.read());
    expect(dump).not.toContain(pair.access_token);
    expect(dump).not.toContain(pair.refresh_token);

    const mcp = await mcpInit(pair.access_token);
    expect(mcp.status).toBe(200);
    expect(await mcp.text()).toContain("zepp-cloud-mcp");

    const refreshed = await call("/token", form({ grant_type: "refresh_token", refresh_token: pair.refresh_token, client_id: reg.client_id }));
    expect(refreshed.status).toBe(200);
    const pair2 = await refreshed.json() as any;
    expect(pair2.access_token).not.toBe(pair.access_token);
    expect(pair2.refresh_token).not.toBe(pair.refresh_token);
    expect((await mcpInit(pair2.access_token)).status).toBe(200);

    // rotation: the old refresh token is dead
    const reuse = await call("/token", form({ grant_type: "refresh_token", refresh_token: pair.refresh_token, client_id: reg.client_id }));
    expect(reuse.status).toBe(400);
    expect((await reuse.json() as any).error).toBe("invalid_grant");
  });

  it("revokes the whole family when an old refresh token is replayed after the grace period", async () => {
    const clock = { t: 1_800_000_000_000 };
    const { fullFlow, call, form, mcpInit } = setup(clock);
    const { reg, tok } = await fullFlow();
    const pair = await tok.json() as any;
    const r2 = await (await call("/token", form({ grant_type: "refresh_token", refresh_token: pair.refresh_token, client_id: reg.client_id }))).json() as any;
    clock.t += 120_000;
    await call("/token", form({ grant_type: "refresh_token", refresh_token: pair.refresh_token, client_id: reg.client_id }));
    expect((await mcpInit(r2.access_token)).status).toBe(401);
  });

  it("access tokens expire after 1 hour", async () => {
    const clock = { t: 1_800_000_000_000 };
    const { fullFlow, mcpInit } = setup(clock);
    const { tok } = await fullFlow();
    const pair = await tok.json() as any;
    clock.t += 3599_000;
    expect((await mcpInit(pair.access_token)).status).toBe(200);
    clock.t += 2_000;
    expect((await mcpInit(pair.access_token)).status).toBe(401);
  });

  it("codes are single use and PKCE is verified", async () => {
    const { fullFlow, call, form, register, authorize } = setup();
    const { reg, code, verifier } = await fullFlow();
    const replay = await call("/token", form({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: reg.client_id }));
    expect(replay.status).toBe(400);

    const reg2 = await (await register()).json() as any;
    const { challenge } = await pkce();
    const res = await authorize(reg2.client_id, challenge);
    const code2 = new URL(res.headers.get("location")!).searchParams.get("code")!;
    const wrong = await pkce();
    const bad = await call("/token", form({ grant_type: "authorization_code", code: code2, code_verifier: wrong.verifier, redirect_uri: REDIRECT, client_id: reg2.client_id }));
    expect(bad.status).toBe(400);
    expect((await bad.json() as any).error).toBe("invalid_grant");
  });

  it("rejects a code redeemed by a different client", async () => {
    const { call, form, register, authorize } = setup();
    const a = await (await register()).json() as any;
    const b = await (await register()).json() as any;
    const { verifier, challenge } = await pkce();
    const res = await authorize(a.client_id, challenge);
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    const stolen = await call("/token", form({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: b.client_id }));
    expect(stolen.status).toBe(400);
  });

  it("revoke kills the tokens", async () => {
    const { fullFlow, call, form, mcpInit } = setup();
    const { reg, tok } = await fullFlow();
    const pair = await tok.json() as any;
    const rev = await call("/revoke", form({ token: pair.refresh_token, client_id: reg.client_id }));
    expect(rev.status).toBe(200);
    expect((await mcpInit(pair.access_token)).status).toBe(401);
  });
});

describe("authorize endpoint hardening", () => {
  it("requires PKCE S256", async () => {
    const { register, call } = setup();
    const reg = await (await register()).json() as any;
    const base = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, state: "s" };
    const noPkce = await call("/authorize?" + new URLSearchParams(base));
    expect(noPkce.status).toBe(303);
    expect(new URL(noPkce.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
    const plain = await call("/authorize?" + new URLSearchParams({ ...base, code_challenge: "a".repeat(43), code_challenge_method: "plain" }));
    expect(new URL(plain.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
  });

  it("never redirects to an unregistered redirect_uri", async () => {
    const { register, call } = setup();
    const reg = await (await register()).json() as any;
    const { challenge } = await pkce();
    const res = await call("/authorize?" + new URLSearchParams({
      response_type: "code", client_id: reg.client_id, redirect_uri: "https://chatgpt.com/connector/oauth/other",
      code_challenge: challenge, code_challenge_method: "S256"
    }));
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    const unknown = await call("/authorize?client_id=nope&redirect_uri=" + encodeURIComponent(REDIRECT));
    expect(unknown.status).toBe(400);
  });

  it("escapes client-controlled text", async () => {
    const { register, call } = setup();
    const reg = await (await register({ client_name: "<script>alert(1)</script>" })).json() as any;
    const { challenge } = await pkce();
    const res = await call("/authorize?" + new URLSearchParams({
      response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, state: "\"><img src=x onerror=alert(1)>",
      code_challenge: challenge, code_challenge_method: "S256"
    }));
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("rejects wrong password, missing CSRF, foreign origin", async () => {
    const { register, authorize, call } = setup();
    const reg = await (await register()).json() as any;
    const { challenge } = await pkce();
    const wrong = await authorize(reg.client_id, challenge, { password: "nope" });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("location")).toBeNull();

    const params = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", password: PASSWORD, action: "approve", csrf: "x" };
    const noCookie = await call("/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    expect(noCookie.status).toBe(400);
    const foreign = await call("/authorize", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.test", cookie: "zepp_oauth_csrf=x" }, body: new URLSearchParams(params).toString() });
    expect(foreign.status).toBe(403);
  });

  it("rate-limits password guesses", async () => {
    const { register, authorize } = setup();
    const reg = await (await register()).json() as any;
    const { challenge } = await pkce();
    for (let i = 0; i < 5; i++) expect((await authorize(reg.client_id, challenge, { password: "bad" + i })).status).toBe(401);
    const blocked = await authorize(reg.client_id, challenge, { password: PASSWORD });
    expect(blocked.status).toBe(429);
  });

  it("deny redirects with access_denied", async () => {
    const { register, call } = setup();
    const reg = await (await register()).json() as any;
    const { challenge } = await pkce();
    const params = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, state: "s", code_challenge: challenge, code_challenge_method: "S256" };
    const page = await call("/authorize?" + new URLSearchParams(params));
    const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1]!;
    const res = await call("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: `zepp_oauth_csrf=${csrf}` },
      body: new URLSearchParams({ ...params, csrf, action: "deny" }).toString()
    });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
  });
});

describe("OAuth disabled", () => {
  it("returns a plain 401 and no OAuth routes", async () => {
    const app = createApp({ env, oauth: null });
    const res = await app(new Request(ISSUER + "/mcp", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    expect((await app(new Request(ISSUER + "/register", { method: "POST" }))).status).toBe(404);
  });
});