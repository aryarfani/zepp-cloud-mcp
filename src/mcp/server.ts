import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { fromError } from "../response";
import type { Services } from "../services";
import { parseDateRange } from "../time";
import { REVIEWED_METRIC_IDS, SERIES_METRIC_IDS } from "../zepp/events";
import { WORKOUT_SAMPLE_FIELDS } from "../zepp/workout-detail";
import { buildZeppRequest } from "../zepp/endpoints";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const rangeShape = { start_date: date, end_date: date } as const;
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function result(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) }] }; }
function range(services: Services, startDate: string, endDate: string) { return parseDateRange(startDate, endDate, services.config.USER_TIMEZONE); }
async function safe(services: Services, fn: () => Promise<unknown>) {
  try { return result(await fn()); }
  catch (error) { return result(fromError(error, services.config.USER_TIMEZONE)); }
}

export function createZeppMcpServer(services: Services): McpServer {
  const server = new McpServer({ name: "zepp-cloud-mcp", version: "0.1.0" });

  server.registerTool("zepp_status", {
    description: "Verify Zepp Cloud authentication and upstream reachability without returning health measurements.", inputSchema: z.object({}), annotations
  }, async () => safe(services, async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    await services.zepp.get(buildZeppRequest("heartRate", { userId: services.config.ZEPP_USER_ID, startTime: nowSec - 3600, endTime: nowSec, limit: 1, type: 2 }));
    return { status: "ok", data: { mcp: "ok", zepp: "authenticated", region: services.config.regionLabel }, meta: { source: "zepp_cloud", fetched_at: new Date().toISOString(), timezone: services.config.USER_TIMEZONE, partial: false, warnings: [] } };
  }));

  server.registerTool("get_daily_summary", {
    description: "Get one day's normalized steps, distance, calories, resting heart rate, and other available daily summary fields.", inputSchema: z.object({ date }), annotations
  }, async ({ date }) => safe(services, () => services.getDailySummary(date)));

  server.registerTool("get_sleep", {
    description: "Get normalized sleep sessions overlapping an inclusive local-date range.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getSleep(range(services, start_date, end_date))));

  server.registerTool("get_heart_rate", {
    description: "Get normalized heart-rate summaries for an inclusive date range.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getHeartRate(range(services, start_date, end_date))));

  server.registerTool("get_recovery", {
    description: "Get available HRV, readiness, stress, SpO2 and respiratory-rate recovery metrics for an inclusive date range.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getRecovery(range(services, start_date, end_date))));

  server.registerTool("get_training_status", {
    description: "Get available training load, VO2max and lactate-threshold status for an inclusive date range.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getTrainingStatus(range(services, start_date, end_date))));

  server.registerTool("list_workouts", {
    description: "List Zepp workouts in an inclusive date range. Activity type filtering is local and never changes the upstream URL.",
    inputSchema: z.object({ ...rangeShape, activity_type: z.string().min(1).max(80).optional(), limit: z.number().int().min(1).max(200).default(50) }), annotations
  }, async ({ start_date, end_date, activity_type, limit }) => safe(services, () => services.listWorkouts(range(services, start_date, end_date), activity_type, limit)));

  server.registerTool("get_workout", {
    description: "Get normalized summary/detail availability for one opaque workout ID returned by list_workouts.", inputSchema: z.object({ workout_id: z.string().min(1).max(180) }), annotations
  }, async ({ workout_id }) => safe(services, () => services.getWorkout(workout_id)));

  server.registerTool("get_workout_samples", {
    description: "Get explicitly requested per-workout metric samples with deterministic downsampling and original/returned point counts.",
    inputSchema: z.object({ workout_id: z.string().min(1).max(180), fields: z.array(z.enum(WORKOUT_SAMPLE_FIELDS)).min(1).max(WORKOUT_SAMPLE_FIELDS.length), max_points: z.number().int().min(2).max(5000).default(500) }), annotations
  }, async ({ workout_id, fields, max_points }) => safe(services, () => services.getWorkoutSamples(workout_id, fields, max_points)));

  server.registerTool("get_workout_route", {
    description: "Get a workout GPS/elevation route with deterministic downsampling and original/returned point counts.",
    inputSchema: z.object({ workout_id: z.string().min(1).max(180), max_points: z.number().int().min(2).max(5000).default(1000) }), annotations
  }, async ({ workout_id, max_points }) => safe(services, () => services.getWorkoutRoute(workout_id, max_points)));

  server.registerTool("get_metric_series", {
    description: "Get a normalized scalar time series for a reviewed metric.",
    inputSchema: z.object({ metric: z.enum(SERIES_METRIC_IDS), ...rangeShape, limit: z.number().int().min(1).max(5000).default(1000) }), annotations
  }, async ({ metric, start_date, end_date, limit }) => safe(services, () => services.getMetricSeries(metric, range(services, start_date, end_date), limit)));

  server.registerTool("get_raw_metric", {
    description: "Get a sanitized raw Zepp event payload for one reviewed allow-listed metric. Arbitrary URLs, paths, headers and query strings are not accepted.",
    inputSchema: z.object({ metric: z.enum(REVIEWED_METRIC_IDS), ...rangeShape }), annotations
  }, async ({ metric, start_date, end_date }) => safe(services, () => services.getRawMetric(metric, range(services, start_date, end_date))));

  return server;
}
