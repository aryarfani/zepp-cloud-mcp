import { describe, expect, it, vi } from "vitest";
import { createServices } from "../../src/services";
import { InputError } from "../../src/errors";
import { MAX_RANGE_DAYS, parseDateRange } from "../../src/time";
import { createZeppMcpServer } from "../../src/mcp/server";
import { CHARGE_INSIGHT, CHARGE_REAL, WEIGHT, config } from "./helpers";
import fixture from "../fixtures/band-data.json";

const range = (a: string, b: string) => parseDateRange(a, b, "Asia/Jakarta");

/** A services object whose upstream is a fake fetch serving the same fixtures for every window. */
function setup(extra: (url: URL) => unknown | undefined = () => undefined) {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: Request | string | URL) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    urls.push(url);
    const custom = extra(url);
    if (custom !== undefined) return Response.json(custom);
    if (url.pathname === "/v1/data/band_data.json") return Response.json(fixture);
    if (url.pathname === "/v2/users/me/events" && url.searchParams.get("eventType") === "Charge") {
      return Response.json(url.searchParams.get("subType") === "real_data" ? CHARGE_REAL : CHARGE_INSIGHT);
    }
    if (url.pathname.endsWith("/weightRecords")) return Response.json(WEIGHT);
    if (url.pathname === "/users/me/bloodPressure") return Response.json([]);
    return Response.json({ items: [] });
  });
  const sleep = vi.fn(async () => {});
  const services = createServices(config, fetchImpl as unknown as typeof fetch, { windowDelayMs: 250, sleep });
  return { services, urls, sleep };
}

describe("windowed range tools (service level)", () => {
  it("get_sleep over 91 days makes 3 band_data requests of at most 31 days and returns each night once", async () => {
    const { services, urls, sleep } = setup();
    const single = await setup().services.getSleep(range("2026-08-30", "2026-08-31"));
    const long = await services.getSleep(range("2026-06-02", "2026-08-31"));
    const bands = urls.filter(u => u.pathname === "/v1/data/band_data.json");
    expect(bands).toHaveLength(3);
    for (const u of bands) {
      const days = (Date.parse(u.searchParams.get("to_date")!) - Date.parse(u.searchParams.get("from_date")!)) / 86_400_000 + 1;
      expect(days).toBeLessThanOrEqual(32); // 31-day window plus the one padding day getSleep adds for overnight sessions
    }
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(long.status).toBe("ok");
    expect(long.data).toEqual(single.data);
    expect(new Set(long.data!.map(n => n.started_at)).size).toBe(long.data!.length);
  });

  it("get_hybrid_charge over 90 days uses 14-day windows with a pause between requests and one row per day", async () => {
    const { services, urls, sleep } = setup();
    const result = await services.getHybridCharge(range("2026-06-02", "2026-08-31"));
    const real = urls.filter(u => u.searchParams.get("subType") === "real_data");
    expect(real).toHaveLength(7); // 91 days / 14
    for (const u of real) expect((Number(u.searchParams.get("to")) - Number(u.searchParams.get("from"))) / 86_400_000).toBeLessThanOrEqual(15.01); // 14-day window plus the padding day for UTC-stamped events
    expect(sleep.mock.calls.length).toBeGreaterThanOrEqual(real.length - 1);
    expect(result.status).toBe("ok");
    expect(result.data!.days.map(d => d.date)).toEqual([...new Set(result.data!.days.map(d => d.date))]);
  });

  it("get_blood_pressure over 40 days never asks Zepp for more than 14 days", async () => {
    const { services, urls } = setup();
    await services.getBloodPressure(range("2026-07-22", "2026-08-31"));
    const calls = urls.filter(u => u.pathname === "/users/me/bloodPressure");
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const u of calls) expect(Number(u.searchParams.get("days"))).toBeLessThanOrEqual(14);
  });

  it("get_training_status asks Zepp for limit 900 (1000 is rejected upstream)", async () => {
    const { services, urls } = setup();
    await services.getTrainingStatus(range("2026-08-25", "2026-08-31"));
    const watch = urls.filter(u => u.pathname.includes("/WatchSportStatistics/"));
    expect(watch.length).toBe(2);
    for (const u of watch) expect(u.searchParams.get("limit")).toBe("900");
  });

  it("get_weight is partial when Zepp returns its 300 record maximum", async () => {
    const item = WEIGHT.items[0]!;
    const many = { items: Array.from({ length: 300 }, (_, i) => ({ ...item, generatedTime: item.generatedTime - i * 3600 })) };
    const { services } = setup(u => (u.pathname.endsWith("/weightRecords") ? many : undefined));
    const result = await services.getWeight(range("2026-06-02", "2026-08-31"));
    expect(result.status).toBe("partial");
    expect(result.meta.warnings.join(" ")).toMatch(/300/);
  });

  it("get_raw_metric keeps a 31-day cap with a pointer to get_metric_series", () => {
    const { services } = setup();
    expect(() => services.getRawMetric("heart_rate" as never, range("2026-06-02", "2026-08-31"))).toThrow(InputError);
    expect(() => services.getRawMetric("heart_rate" as never, range("2026-06-02", "2026-08-31"))).toThrow(/get_metric_series/);
  });

  it("get_metric_series validates limit before fetching", () => {
    const { services, urls } = setup();
    expect(() => services.getMetricSeries("heart_rate" as never, range("2026-08-25", "2026-08-31"), 0)).toThrow(InputError);
    expect(urls).toHaveLength(0);
  });
});
describe("MCP error responses", () => {
  type ToolServer = { _registeredTools: Record<string, { handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> };
  const call = async (services: ReturnType<typeof setup>["services"], name: string, args: Record<string, unknown>) => {
    const server = createZeppMcpServer(services) as unknown as ToolServer;
    return JSON.parse((await server._registeredTools[name]!.handler(args)).content[0]!.text);
  };

  it("returns invalid_request with the exact range message beyond the cap, without fetching", async () => {
    const { services, urls } = setup();
    const body = await call(services, "get_sleep", { start_date: "2025-10-14", end_date: "2026-10-15" });
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(body.status).toBe("invalid_request");
    expect(body.meta.warnings[0]).toMatch(/367 days.*maximum is 366 days per call/);
    expect(urls).toHaveLength(0);
  });

  it("returns the specific message for an invalid series limit and for bad dates", async () => {
    const { services } = setup();
    const badLimit = await call(services, "get_metric_series", { metric: "heart_rate", start_date: "2026-08-25", end_date: "2026-08-31", limit: 0 });
    expect(badLimit.meta.warnings[0]).toMatch(/limit must be an integer/);
    const badDates = await call(services, "get_heart_rate", { start_date: "2026-08-31", end_date: "2026-08-25" });
    expect(badDates.meta.warnings[0]).toMatch(/must be on or before/);
  });

  it("logs unexpected errors server-side without secrets and returns a generic, leak-free message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { services } = setup();
    const secrets = [config.ZEPP_APP_TOKEN, config.MCP_SECRET].join(" ");
    services.getSleep = async () => { throw new Error("kaboom " + secrets); };
    const body = await call(services, "get_sleep", { start_date: "2026-08-25", end_date: "2026-08-31" });
    expect(JSON.stringify(body)).not.toMatch(/kaboom|test-token|test-mcp/);
    expect(body.meta.warnings[0]).toMatch(/Unexpected internal error/);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toContain("kaboom");
    expect(line).not.toMatch(/test-token|test-mcp/);
  });

  it("replaces an oversized result with a clear invalid_request message", async () => {
    const { services } = setup();
    services.getSleep = async () => ({ status: "ok", data: [{ blob: "x".repeat(1_100_000) }] as never, meta: { source: "zepp_cloud", fetched_at: "", timezone: "UTC", partial: false, warnings: [] } });
    const body = await call(services, "get_sleep", { start_date: "2026-08-25", end_date: "2026-08-31" });
    expect(body.status).toBe("invalid_request");
    expect(body.meta.warnings[0]).toMatch(/too large.*shorter date range/);
  });
});