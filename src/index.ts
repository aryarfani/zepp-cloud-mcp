import { createMcpHandler } from "agents/mcp/server";
import { requireBearer } from "./auth";
import { parseConfig } from "./config";
import { createZeppMcpServer } from "./mcp/server";
import { createServices } from "./services";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== "https:") return new Response("HTTPS Required", { status: 400 });
    if (url.pathname === "/" && request.method === "GET") return Response.json({ service: "zepp-cloud-mcp", version: "0.1.0" });
    if (url.pathname === "/health" && request.method === "GET") return Response.json({ status: "ok" });
    if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404 });
    if (!requireBearer(request, env.MCP_SECRET)) return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });

    let services;
    try { services = createServices(parseConfig(env)); }
    catch { return Response.json({ error: "Worker configuration is invalid" }, { status: 500 }); }

    const handler = createMcpHandler(() => createZeppMcpServer(services), { route: "/mcp", corsOptions: false });
    return handler(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
