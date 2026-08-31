import { describe, expect, it } from "vitest";
import fixture from "./fixtures/heart-rate.json";
import { parseConfig } from "../src/config";
import type { ServiceContext } from "../src/services";
import { parseDateRange } from "../src/time";
import type { ZeppClient } from "../src/zepp/client";
import type { ZeppRequest } from "../src/zepp/endpoints";
import { getHeartRate, normalizeHeartRate } from "../src/zepp/heart-rate";

const config = parseConfig({
  MCP_SECRET: "mcp-secret",
  ZEPP_APP_TOKEN: "zepp-secret",
  ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
  USER_TIMEZONE: "Asia/Jakarta"
});

describe("heart-rate normalization", () => {
  it("keeps missing HR absent instead of zero", () => {
    const result = normalizeHeartRate(fixture, "Asia/Jakarta");
    expect(result[0]?.avg_bpm).toBe(61);
    expect(result[1]?.avg_bpm).toBeUndefined();
    expect(result[1]?.sample_count).toBe(0);
  });

  it("keeps device provenance", () => {
    expect(normalizeHeartRate(fixture, "Asia/Jakarta")[0]?.source_scope).toBe("device");
  });

  it("uses epoch-second Zepp HR query parameters", async () => {
    let request: ZeppRequest | undefined;
    const ctx: ServiceContext = {
      config,
      zepp: { get: async (next: ZeppRequest) => { request = next; return fixture; } } as unknown as ZeppClient
    };
    const range = parseDateRange("2026-08-30", "2026-08-31", config.USER_TIMEZONE);
    const result = await getHeartRate(ctx, range);
    expect(result.status).toBe("ok");
    expect(request?.query).toMatchObject({
      startTime: String(range.fromSec),
      endTime: String(range.toSec),
      limit: "1000",
      type: "2"
    });
  });
});
