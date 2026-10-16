import { createMcpHandler } from "agents/mcp/server";
import { requireBearer } from "./auth";
import { iconResponse } from "./dashboard/icons";
import { parseConfig } from "./config";
import { createZeppMcpServer } from "./mcp/server";
import { createServices } from "./services";
import type { OAuthProvider } from "./oauth";

export interface AppDeps {
  env: Env;
  /** null disables OAuth (static bearer only). */
  oauth: OAuthProvider | null;
  port?: number;
  /** Node server only: returns the local store/sync status for the `sync_status` tool. Omit to leave that tool out. */
  syncStatus?: () => unknown;
  /** Node server only: handles /dashboard and /dashboard/* (the read-only web dashboard). Without it those paths are 404. */
  dashboard?: (request: Request) => Promise<Response>;
}

export function createApp(deps: AppDeps): (request: Request) => Promise<Response> {
  const { env, oauth } = deps;
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({ service: "zepp-cloud-mcp", version: "0.1.0", runtime: "node" });
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok", runtime: "node", port: deps.port ?? 8788 });
    }
    // Browsers ask for /favicon.ico at the root; served only where the dashboard exists (the Node server).
    if (deps.dashboard && url.pathname === "/favicon.ico") return iconResponse(url.pathname, request.method)!;
    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      return deps.dashboard ? deps.dashboard(request) : new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
    }
    if (oauth) {
      const res = await oauth.handle(request);
      if (res) return res;
    }
    if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });

    const hasStatic = env.MCP_SECRET.length > 0 && requireBearer(request, env.MCP_SECRET);
    if (!hasStatic) {
      const oauthOk = oauth ? await oauth.authenticate(request) : false;
      if (!oauthOk) {
        const sentToken = (request.headers.get("authorization") ?? "").startsWith("Bearer ");
        const challenge = oauth ? oauth.challengeHeader(request, sentToken) : "Bearer";
        return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": challenge, "content-type": "text/plain" } });
      }
    }

    let services;
    try { services = createServices(parseConfig(env)); }
    catch (e: any) {
      return Response.json({ error: "Worker configuration is invalid", detail: e?.message }, { status: 500 });
    }
    const handler = createMcpHandler(() => createZeppMcpServer(services, deps.syncStatus ? { syncStatus: deps.syncStatus } : {}), { route: "/mcp", corsOptions: false });
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;
    return handler(request, env, ctx);
  };
}