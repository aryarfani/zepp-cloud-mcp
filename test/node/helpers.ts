import type { AppConfig } from "../../src/config";
import type { ServiceContext } from "../../src/services";
import { ZeppError } from "../../src/errors";
import { encodeWorkoutId } from "../../src/zepp/workouts";
import fixture from "../fixtures/band-data.json";

export const config: AppConfig = {
  MCP_SECRET: "test-mcp", ZEPP_APP_TOKEN: "test-token", ZEPP_USER_ID: "1234567890",
  ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com", USER_TIMEZONE: "Asia/Jakarta", regionLabel: "us3"
};

// Fixed "now": 2026-08-31 10:00 Jakarta (the band-data fixture covers 2026-08-30 and 2026-08-31).
export const NOW = Date.parse("2026-08-31T03:00:00Z");

// [set, duration_s, avg_hr, weight_kg, reps, action_type]
export const SETS: Array<[number, number, number, number, number, number]> = [
  [0, 31, 98, -1, 10, 64], [1, 49, 106, 12, 12, 6], [2, 41, 125, 17.5, 12, 6], [3, 34, 127, 20, 10, 6]
];
export function lapRow(s: [number, number, number, number, number, number]): string {
  const c: Array<string | number> = Array.from({ length: 62 }, () => -1);
  c[0] = s[0]; c[1] = s[1]; c[2] = 0; c[3] = "s00000000000"; c[4] = s[2];
  c[21] = s[3].toFixed(1); c[22] = s[4]; c[28] = s[5]; c[43] = s[1] * 1000 + 123;
  return c.join(",");
}
export const LAP = SETS.map(lapRow).join(";");

const STRENGTH_TRACK = String(Math.floor(Date.parse("2026-08-31T01:00:00Z") / 1000)); // 08:00 Jakarta
const RUN_TRACK = String(Math.floor(Date.parse("2026-08-30T23:00:00Z") / 1000));      // 06:00 Jakarta on 08-31
export const STRENGTH_ID = encodeWorkoutId(STRENGTH_TRACK, "run.device");
export const RUN_ID = encodeWorkoutId(RUN_TRACK, "run.device");

export const HISTORY = {
  code: 1,
  data: {
    next: -1,
    summary: [
      { trackid: STRENGTH_TRACK, source: "run.device", type: 52, end_time: String(Number(STRENGTH_TRACK) + 3600), dis: "0.0", calorie: "300.0", avg_heart_rate: "120.0", max_heart_rate: 150, city: "Somewhere" },
      { trackid: RUN_TRACK, source: "run.device", type: 1, end_time: String(Number(RUN_TRACK) + 1800), dis: "5000.0", calorie: "400.0", avg_heart_rate: "150.0", max_heart_rate: 170 }
    ]
  }
};

const dayStartMs = Date.parse("2026-08-31T00:00:00Z"); // Charge events are stamped at the start of a UTC day

export const WEIGHT = { items: [{ userId: "1234567890", memberId: "-1", deviceSource: -1, appName: "com.huami.midong", generatedTime: Math.floor(Date.parse("2026-08-30T03:00:00Z") / 1000), weightType: 1, summary: { weight: 64.5, height: 166, age: 26, bmi: 23.406881, bodyStyle: 0, deviceType: 1, timeZone: "Asia/Jakarta", deviceSn: "SECRET-SN", source: 1 }, createTime: 1788051867 }] };
export const CHARGE_REAL = { items: [{ userId: "1234567890", eventType: "Charge", subType: "real_data", timestamp: dayStartMs, value: { startTime: dayStartMs, deviceId: "D", deviceSN: "SECRET-SN", samples: [
  { s: 0, total: 36, mental: 6.8, physical: 66, status: 0, jsonExtra: "{}" }, { s: 60000, total: 38, mental: 7.2, physical: 66.2, status: 0 }, { s: 120000, total: 40, mental: 7.6, physical: 66.4, status: 0 }
] } }] };
export const CHARGE_INSIGHT = { items: [{ eventType: "Charge", subType: "insight_data", timestamp: dayStartMs, value: { startTime: dayStartMs + 1_800_000, samples: [{ s: 0, u: 12186382, type: 3, insight: 29, insightId: 1, diff: 0, slope: 0, thres: 0, trackId: 0, jsonExtra: "{}" }] } }] };
export const SINGLE_STRESS = { items: [{ userId: "1234567890", eventType: "single_stress", subType: "single_stress", timestamp: Date.parse("2026-08-31T01:00:00Z"), deviceSn: "SECRET-SN", value: "44" }] };
const EMPTY_EVENTS = { items: [] };

export interface MockZepp {

  ctx: ServiceContext;
  calls: Array<{ path: string; query: Record<string, string | number | boolean> }>;
}

/** A ServiceContext whose Zepp client serves the fixtures above. `failPath` makes matching requests throw `failWith`. */
export function mockCtx(opts: { failPath?: string; failWith?: ZeppError; history?: unknown; detail?: unknown; weight?: unknown; bloodPressure?: unknown; chargeReal?: unknown } = {}): MockZepp {
  const calls: MockZepp["calls"] = [];
  const zepp = {
    async get(request: { path: string; query: Record<string, string | number | boolean> }) {
      calls.push({ path: request.path, query: request.query });
      if (opts.failPath && request.path.includes(opts.failPath)) throw opts.failWith ?? new ZeppError("auth_expired", "Zepp authentication expired", 401);
      if (request.path === "/v1/data/band_data.json") return fixture;
      if (request.path === "/v1/sport/run/history.json") return opts.history ?? HISTORY;
      if (request.path === "/v1/sport/run/detail.json") return opts.detail ?? { data: { trackid: String(request.query.trackid), lap: LAP, time: "0" } };
      if (request.path.endsWith("/members/-1/weightRecords")) return opts.weight ?? WEIGHT;
      if (request.path === "/users/me/bloodPressure") return opts.bloodPressure ?? [];
      const eventType = String(request.query.eventType ?? "");
      if (request.path === "/v2/users/me/events") {
        if (eventType === "Charge" && request.query.subType === "real_data") return opts.chargeReal ?? CHARGE_REAL;
        if (eventType === "Charge" && request.query.subType === "insight_data") return CHARGE_INSIGHT;
        return EMPTY_EVENTS;
      }
      if (request.path === "/users/1234567890/events") return eventType === "single_stress" ? SINGLE_STRESS : EMPTY_EVENTS;
      if (request.path === "/users/1234567890/events/dateString") return EMPTY_EVENTS;
      throw new Error("unexpected path " + request.path);
    }
  };
  return { ctx: { config, zepp: zepp as any }, calls };
}