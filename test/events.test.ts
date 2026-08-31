import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config";
import { parseDateRange } from "../src/time";
import type { ServiceContext } from "../src/services";
import type { ZeppClient } from "../src/zepp/client";
import { classifyCapabilityProbe, getRawMetric, reviewedMetricRequest, sanitizeRawPayload } from "../src/zepp/events";

const config = parseConfig({
  MCP_SECRET: "mcp-secret",
  ZEPP_APP_TOKEN: "zepp-secret",
  ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
  USER_TIMEZONE: "Asia/Jakarta"
});
const range = parseDateRange("2026-08-30", "2026-08-31", config.USER_TIMEZONE);

describe("reviewed Zepp event mappings", () => {
  it("maps hrv to v2 events", () => {
    expect(reviewedMetricRequest("hrv", range, config).path).toBe("/v2/users/me/events");
  });

  it("maps all_day_stress to user events with no subType", () => {
    const req = reviewedMetricRequest("all_day_stress", range, config);
    expect(req.path).toBe(`/users/${config.ZEPP_USER_ID}/events`);
    expect(req.query).not.toHaveProperty("subType");
    expect(req.query.userId).toBe(config.ZEPP_USER_ID);
  });

  it("maps nightly_odi to dateString events", () => {
    const req = reviewedMetricRequest("nightly_odi", range, config);
    expect(req.path).toBe(`/users/${config.ZEPP_USER_ID}/events/dateString`);
    expect(req.query.timeZone).toBe("Asia/Jakarta");
  });

  it("recursively removes credential-shaped keys from raw metric output", () => {
    const raw = sanitizeRawPayload({ token: "x", nested: { appToken: "y", apptoken: "z", value: 42 } });
    expect(raw).toEqual({ nested: { value: 42 } });
    expect(JSON.stringify(raw)).not.toContain('"token"');
  });

  it("returns no_data for a known metric with a valid empty event timeline", async () => {
    const ctx: ServiceContext = {
      config,
      zepp: { get: async () => ({ items: [] }) } as unknown as ZeppClient
    };
    expect((await getRawMetric(ctx, "hrv", range)).status).toBe("no_data");
  });

  it("does not label unverified empty capability probes unsupported", () => {
    expect(classifyCapabilityProbe({ positiveControl: [], negativeControl: [] })).toBe("indeterminate");
  });
});
