import { describe, expect, it } from "vitest";
import { createZeppMcpServer } from "../src/mcp/server";
import { createServices } from "../src/services";
import { parseConfig } from "../src/config";

const config = parseConfig({
  MCP_SECRET: "mcp-secret", ZEPP_APP_TOKEN: "zepp-token", ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com", USER_TIMEZONE: "Asia/Jakarta"
});

function toolNames(server: unknown): string[] {
  const registry = (server as { _registeredTools: Record<string, unknown> | Map<string, unknown> })._registeredTools;
  return registry instanceof Map ? [...registry.keys()] : Object.keys(registry);
}

describe("MCP tool registration", () => {
  it("keeps the 13 existing tools and only adds sync_status when a status provider is given", () => {
    const services = createServices(config);
    const base = toolNames(createZeppMcpServer(services));
    expect(base).toHaveLength(13);
    expect(base).not.toContain("sync_status");
    const withSync = toolNames(createZeppMcpServer(services, { syncStatus: () => ({ hello: "world" }) }));
    expect(withSync).toHaveLength(14);
    expect(withSync).toContain("sync_status");
    expect(base.every(name => withSync.includes(name))).toBe(true);
  });
});