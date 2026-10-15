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

const EXISTING_TOOLS = [
  "zepp_status", "get_daily_summary", "get_sleep", "get_heart_rate", "get_recovery", "get_training_status", "list_workouts",
  "get_workout", "get_workout_samples", "get_workout_route", "get_strength_sets", "get_metric_series", "get_raw_metric"
];
const NEW_TOOLS = ["get_weight", "get_blood_pressure", "get_hybrid_charge", "get_emotion_events", "list_event_types"];

describe("MCP tool registration", () => {
  it("keeps every existing tool, adds the step-3 tools, and only adds sync_status when a status provider is given", () => {
    const services = createServices(config);
    const base = toolNames(createZeppMcpServer(services));
    expect(base).toHaveLength(EXISTING_TOOLS.length + NEW_TOOLS.length);
    expect(base).not.toContain("sync_status");
    for (const name of [...EXISTING_TOOLS, ...NEW_TOOLS]) expect(base).toContain(name);
    const withSync = toolNames(createZeppMcpServer(services, { syncStatus: () => ({ hello: "world" }) }));
    expect(withSync).toHaveLength(19);
    expect(withSync).toContain("sync_status");
    expect(base.every(name => withSync.includes(name))).toBe(true);
  });
});