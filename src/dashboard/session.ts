// Signed, stateless dashboard sessions (HMAC-SHA-256 over "sid.expiry"), plus an in-memory revocation list for logout.
// Web-standard crypto only. Nothing here is written to disk.
import { b64url, randomToken } from "../oauth";

export const SESSION_COOKIE = "zepp_dash";
export const SESSION_TTL_S = 7 * 24 * 3600;

const enc = new TextEncoder();

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
}

/**
 * The signing key material: DASHBOARD_SESSION_SECRET when set (at least 32 characters), otherwise derived from the owner
 * password, so changing the password also invalidates every session.
 */
export async function deriveSessionKeyMaterial(ownerPassword: string, sessionSecret?: string): Promise<string> {
  if (sessionSecret && sessionSecret.length >= 32) return sessionSecret;
  const key = await hmacKey(ownerPassword, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("zepp-dashboard-session-key-v1")));
  return b64url(mac);
}

export interface SessionManager {
  issue(): Promise<{ token: string; expiresAt: number }>;
  verify(token: string | undefined): Promise<{ sid: string; expiresAt: number } | null>;
  revoke(token: string | undefined): Promise<void>;
  /** Token for the page of this session, sent back in the x-csrf-token header on mutating calls (HMAC of the session id; no storage). */
  csrfToken(sid: string): Promise<string>;
}

export function createSessionManager(keyMaterial: string, now: () => number = () => Date.now()): SessionManager {
  const revoked = new Map<string, number>(); // sid -> expiry (s); forgotten once the session would have expired anyway
  const nowS = () => Math.floor(now() / 1000);
  let keyPromise: Promise<CryptoKey> | undefined;
  const key = () => (keyPromise ??= hmacKey(keyMaterial, ["sign", "verify"]));
  const pruneRevoked = () => { const t = nowS(); for (const [sid, exp] of revoked) if (exp <= t) revoked.delete(sid); };

  async function parse(token: string | undefined): Promise<{ sid: string; expiresAt: number } | null> {
    if (!token || token.length > 256) return null;
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "s1") return null;
    const [, sid, expRaw, sigRaw] = parts as [string, string, string, string];
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(sid) || !/^\d{1,12}$/.test(expRaw)) return null;
    const sig = fromB64url(sigRaw);
    if (!sig) return null;
    // crypto.subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify("HMAC", await key(), sig, enc.encode(`s1.${sid}.${expRaw}`));
    if (!valid) return null;
    const expiresAt = Number(expRaw);
    if (expiresAt <= nowS()) return null;
    return { sid, expiresAt };
  }

  return {
    async issue() {
      const sid = randomToken("", 24);
      const expiresAt = nowS() + SESSION_TTL_S;
      const body = `s1.${sid}.${expiresAt}`;
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
      return { token: `${body}.${b64url(sig)}`, expiresAt };
    },
    async verify(token) {
      const session = await parse(token);
      if (!session) return null;
      return revoked.has(session.sid) ? null : session;
    },
    async csrfToken(sid) {
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(`csrf.v1.${sid}`)));
      return b64url(mac);
    },
    async revoke(token) {
      const session = await parse(token);
      if (!session) return;
      pruneRevoked();
      revoked.set(session.sid, session.expiresAt);
    }
  };
}