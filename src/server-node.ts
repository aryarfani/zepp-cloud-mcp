import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { createApp } from './app';
import { createOAuth } from './oauth';
import { FileOAuthStore } from './oauth-file-store';
import { parseConfig } from './config';
import { createServices, type ServiceContext } from './services';
import { ZeppStore } from './store/store';
import { parseSyncConfig } from './sync/config';
import { createSyncService, type SyncService } from './sync/service';
import { startSyncScheduler } from './sync/scheduler';
import { createMemoryCache, DEFAULT_MAX_CACHE_ENTRIES } from './memory-cache';
if (typeof (globalThis as any).caches === 'undefined') {
  (globalThis as any).caches = { default: createMemoryCache() } as any;
  console.log('[zepp] in-memory cache enabled (TTL honored, max ' + DEFAULT_MAX_CACHE_ENTRIES + ' entries)');
}
function loadEnv(): Env {
  return {
    MCP_SECRET: process.env.MCP_SECRET || '',
    ZEPP_APP_TOKEN: process.env.ZEPP_APP_TOKEN || '',
    ZEPP_USER_ID: process.env.ZEPP_USER_ID || '',
    ZEPP_REGION_HOST: process.env.ZEPP_REGION_HOST || '',
    USER_TIMEZONE: process.env.USER_TIMEZONE || 'Asia/Jakarta',
  } as Env;
}
const MAX_BODY = 1024 * 1024;
function toFetchRequest(nodeReq: http.IncomingMessage, body: Buffer): Request {
  const host = nodeReq.headers.host || 'localhost';
  const proto = (nodeReq.headers['x-forwarded-proto'] as string) || 'https';
  const url = proto + '://' + host + (nodeReq.url || '/');
  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeReq.headers)) {
    if (!v) continue;
    if (Array.isArray(v)) headers.set(k, v.join(', '));
    else headers.set(k, v as string);
  }
  const method = nodeReq.method || 'GET';
  const hasBody = body.length > 0 && method !== 'GET' && method !== 'HEAD';
  return new Request(url, { method, headers, body: hasBody ? body : undefined } as any);
}
const PORT = parseInt(process.env.PORT || '8788', 10);
const env = loadEnv();
if (!env.MCP_SECRET || !env.ZEPP_APP_TOKEN || !env.ZEPP_USER_ID) {
  console.warn('[zepp] WARNING: secrets not set - /mcp will return 500 until env is configured');
}
const ownerPassword = process.env.OAUTH_OWNER_PASSWORD || '';
let oauth = null as ReturnType<typeof createOAuth> | null;
if (ownerPassword.length >= 16) {
  const storePath = process.env.OAUTH_STORE_PATH || path.join(process.cwd(), 'data', 'oauth-store.json');
  oauth = createOAuth({ ownerPassword, store: new FileOAuthStore(storePath), issuer: process.env.OAUTH_ISSUER || undefined });
  console.log('[zepp] OAuth enabled');
} else {
  console.warn('[zepp] OAUTH_OWNER_PASSWORD missing or shorter than 16 chars - OAuth disabled, static bearer only');
}
// Local store + daily sync (node:sqlite). A store/sync problem must never stop the MCP server from starting.
const syncConfig = parseSyncConfig(process.env);
let syncService: SyncService | null = null;
try {
  const store = new ZeppStore(path.resolve(syncConfig.dbPath));
  const closed = store.closeInterruptedRuns(new Date().toISOString());
  if (closed) console.warn('[zepp] closed ' + closed + ' interrupted sync run(s) from a previous start');
  const credentialsOk = Boolean(env.MCP_SECRET && env.ZEPP_APP_TOKEN && env.ZEPP_USER_ID);
  let zeppCtx: ServiceContext | null = null;
  if (credentialsOk) {
    try { zeppCtx = createServices(parseConfig(env)); } catch (e: any) { console.warn('[zepp] sync disabled, invalid Zepp config: ' + (e?.message ?? 'error')); }
  }
  if (zeppCtx) {
    syncService = createSyncService({ ctx: zeppCtx, store, config: syncConfig, log: m => console.log('[zepp] ' + m) });
    startSyncScheduler({ service: syncService, lastSuccessAt: () => store.lastSuccessfulRun()?.finished_at ?? null, timezone: env.USER_TIMEZONE, log: m => console.log('[zepp] ' + m) });
  } else {
    console.warn('[zepp] daily sync not started (Zepp credentials missing or invalid); sync_status still reads the store');
  }
  if (!syncService) {
    // Status-only service so the tool still works: reuse a stub context that is never used for requests.
    syncService = createSyncService({ ctx: { config: { ...env, regionLabel: 'n/a' }, zepp: null as any } as ServiceContext, store, config: { ...syncConfig, enabled: false } });
  }
  console.log('[zepp] local store ready at ' + syncConfig.dbPath);
} catch (e: any) {
  console.error('[zepp] local store unavailable, sync_status disabled: ' + (e?.message ?? 'error'));
}
const app = createApp({ env, oauth, port: PORT, ...(syncService ? { syncStatus: () => syncService!.status() } : {}) });
async function handleNodeRequest(nodeReq: http.IncomingMessage, nodeRes: http.ServerResponse) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of nodeReq) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) {
      nodeRes.writeHead(413, { 'content-type': 'text/plain' });
      nodeRes.end('Payload Too Large');
      return;
    }
    chunks.push(chunk as Buffer);
  }
  const response = await app(toFetchRequest(nodeReq, Buffer.concat(chunks)));
  nodeRes.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const ab = await response.arrayBuffer();
    nodeRes.end(Buffer.from(ab));
  } else {
    nodeRes.end();
  }
}
const server = http.createServer((req, res) => {
  handleNodeRequest(req, res).catch(err => {
    console.error('[zepp] unhandled', err);
    if (!res.headersSent) { res.writeHead(500); res.end('Internal Error'); }
  });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('[zepp] listening on 127.0.0.1:' + PORT);
});