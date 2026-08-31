import { describe, expect, it } from "vitest";
import fixture from "./fixtures/band-data.json";
import { parseConfig } from "../src/config";
import type { ServiceContext } from "../src/services";
import { parseDateRange } from "../src/time";
import { normalizeBandData } from "../src/zepp/activity";
import type { ZeppClient } from "../src/zepp/client";
import type { ZeppRequest } from "../src/zepp/endpoints";
import { getSleep, selectSleepForRange } from "../src/zepp/sleep";

const config = parseConfig({
  MCP_SECRET: "mcp-secret",
  ZEPP_APP_TOKEN: "zepp-secret",
  ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com",
  USER_TIMEZONE: "Asia/Jakarta"
});

describe("sleep normalization", () => {
  it("preserves verified stage modes and actual start-date sleep_date", () => {
    const night = normalizeBandData(fixture).sleep.find(session => session.sleep_date === "2026-08-30");
    expect(night?.stages.map(s => s.stage)).toEqual(["deep", "light", "rem", "awake"]);
    expect(night?.sleep_date).toBe("2026-08-30");
  });

  it("selects an overnight session by overlap with requested local day", () => {
    const range = parseDateRange("2026-08-31", "2026-08-31", "Asia/Jakarta");
    const sessions = selectSleepForRange(normalizeBandData(fixture).sleep, range);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sleep_date).toBe("2026-08-30");
  });

  it("fetches the previous band day for midnight-boundary sleep", async () => {
    let request: ZeppRequest | undefined;
    const ctx: ServiceContext = {
      config,
      zepp: { get: async (next: ZeppRequest) => { request = next; return fixture; } } as unknown as ZeppClient
    };
    const range = parseDateRange("2026-08-31", "2026-08-31", config.USER_TIMEZONE);
    await getSleep(ctx, range);
    expect(request?.query).toMatchObject({
      from_date: "2026-08-30",
      to_date: "2026-08-31",
      query_type: "detail",
      byteLength: "8",
      device_type: "0"
    });
  });
});
