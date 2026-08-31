import { parseConfig } from "../src/config";
import { ZeppError } from "../src/errors";
import { createServices } from "../src/services";
import { buildZeppRequest } from "../src/zepp/endpoints";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function describeShape(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === "object") {
    return `object keys=[${Object.keys(value as object).slice(0, 20).join(",")}]`;
  }
  return typeof value;
}

const config = parseConfig({
  MCP_SECRET: requireEnv("MCP_SECRET"),
  ZEPP_APP_TOKEN: requireEnv("ZEPP_APP_TOKEN"),
  ZEPP_USER_ID: requireEnv("ZEPP_USER_ID"),
  ZEPP_REGION_HOST: requireEnv("ZEPP_REGION_HOST"),
  USER_TIMEZONE: requireEnv("USER_TIMEZONE")
});
const services = createServices(config);
const now = Date.now();
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: config.USER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(now));

try {
  const hr = await services.zepp.get(buildZeppRequest("heartRate", {
    userId: config.ZEPP_USER_ID,
    startTime: Math.floor(now / 1000) - 24 * 60 * 60,
    endTime: Math.floor(now / 1000),
    limit: 10,
    type: 2
  }));
  const band = await services.zepp.get(buildZeppRequest("bandData", {
    userid: config.ZEPP_USER_ID,
    from_date: today,
    to_date: today,
    query_type: "detail",
    byteLength: 8,
    device_type: 0
  }));
  const hrv = await services.zepp.get(buildZeppRequest("v2Events", {
    eventType: "hrv_sdnn",
    subType: "real_data",
    from: now - 7 * 24 * 60 * 60 * 1000,
    to: now,
    limit: 10,
    reverse: 1
  }));

  console.log("Zepp auth: valid");
  console.log(`Region host: valid (${config.regionLabel})`);
  console.log(`heartRate: HTTP 200, ${describeShape(hr)}`);
  console.log(`band_data: HTTP 200, ${describeShape(band)}`);
  console.log(`v2 events: HTTP 200, ${describeShape(hrv)}`);
} catch (error) {
  if (error instanceof ZeppError) {
    console.error(`Zepp probe failed: kind=${error.kind}${error.status ? ` status=${error.status}` : ""}`);
  } else {
    console.error("Zepp probe failed: configuration/internal error");
  }
  process.exitCode = 1;
}
