import { requireBearer } from "./auth";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== "https:") {
      return new Response("HTTPS Required", { status: 400 });
    }
    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({ service: "zepp-cloud-mcp", version: "0.1.0" });
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok" });
    }
    if (url.pathname === "/mcp") {
      if (!requireBearer(request, env.MCP_SECRET)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "www-authenticate": "Bearer" }
        });
      }
      return new Response("MCP not registered yet", { status: 501 });
    }
    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
