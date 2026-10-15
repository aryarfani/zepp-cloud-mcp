import 'dotenv/config';
import http from 'node:http';
import { createMcpHandler } from 'agents/mcp/server';
import { requireBearer } from './auth';
import { parseConfig } from './config';
import { createZeppMcpServer } from './mcp/server';
import { createServices } from './services';
if (typeof (globalThis as any).caches === 'undefined') {
  const mem = new Map<string, Response>();
  (globalThis as any).caches = {
    default: {
      async match(req: Request) { const hit = mem.get(req.url); return hit ? hit.clone() : undefined; },
      async put(req: Request, res: Response) { mem.set(req.url, res.clone()); }
    }
  } as any;
  console.log('[zepp] caches shim enabled');
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
async function handleNodeRequest(nodeReq: http.IncomingMessage, nodeRes: http.ServerResponse, env: Env) {
  const chunks: Buffer[] = [];
  for await (const chunk of nodeReq) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  const request = toFetchRequest(nodeReq, body);
  const url = new URL(request.url);
  if (url.pathname === '/' && request.method === 'GET') {
    nodeRes.writeHead(200, { 'content-type': 'application/json' });
    nodeRes.end(JSON.stringify({ service: 'zepp-cloud-mcp', version: '0.1.0', runtime: 'node' }));
    return;
  }
  if (url.pathname === '/health' && request.method === 'GET') {
    nodeRes.writeHead(200, { 'content-type': 'application/json' });
    nodeRes.end(JSON.stringify({ status: 'ok', runtime: 'node', port: PORT }));
    return;
  }
  if (url.pathname !== '/mcp') {
    nodeRes.writeHead(404, { 'content-type': 'text/plain' });
    nodeRes.end('Not Found');
    return;
  }
  if (!requireBearer(request, env.MCP_SECRET)) {
    nodeRes.writeHead(401, { 'www-authenticate': 'Bearer', 'content-type': 'text/plain' });
    nodeRes.end('Unauthorized');
    return;
  }
  let services;
  try { services = createServices(parseConfig(env as any)); }
  catch (e: any) {
    nodeRes.writeHead(500, { 'content-type': 'application/json' });
    nodeRes.end(JSON.stringify({ error: 'Worker configuration is invalid', detail: e?.message }));
    return;
  }
  const handler = createMcpHandler(() => createZeppMcpServer(services), { route: '/mcp', corsOptions: false });
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;
  const response = await handler(request, env, ctx);
  nodeRes.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const ab = await response.arrayBuffer();
    nodeRes.end(Buffer.from(ab));
  } else {
    nodeRes.end();
  }
}
const PORT = parseInt(process.env.PORT || '8788', 10);
const env = loadEnv();
if (!env.MCP_SECRET || !env.ZEPP_APP_TOKEN || !env.ZEPP_USER_ID) {
  console.warn('[zepp] WARNING: secrets not set - /mcp will return 500 until env is configured');
}
const server = http.createServer((req, res) => {
  handleNodeRequest(req, res, env).catch(err => {
    console.error('[zepp] unhandled', err);
    if (!res.headersSent) { res.writeHead(500); res.end('Internal Error'); }
  });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('[zepp] listening on 127.0.0.1:' + PORT);
});
