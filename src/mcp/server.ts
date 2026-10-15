import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { InputError, ZeppError } from "../errors";
import { fromError, ok } from "../response";
import type { Services } from "../services";
import { parseDateRange } from "../time";
import { MAX_SERIES_LIMIT, REVIEWED_METRIC_IDS, SERIES_METRIC_IDS } from "../zepp/events";
import { WORKOUT_SAMPLE_FIELDS } from "../zepp/workout-detail";
import { buildZeppRequest } from "../zepp/endpoints";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const rangeShape = { start_date: date, end_date: date } as const;
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

/** Largest tool response returned as is (characters of JSON). Bigger ones ask the caller to narrow the request. */
export const MAX_RESPONSE_CHARS = 1_000_000;

function result(value: unknown, timezone = "UTC") {
  const text = JSON.stringify(value);
  if (text.length > MAX_RESPONSE_CHARS) {
    const tooLarge = fromError(new InputError(`The result is too large to return (${Math.round(text.length / 1024)} KB, limit ${Math.round(MAX_RESPONSE_CHARS / 1024)} KB). Use a shorter date range.`), timezone);
    return { content: [{ type: "text" as const, text: JSON.stringify(tooLarge) }] };
  }
  return { content: [{ type: "text" as const, text }] };
}
function range(services: Services, startDate: string, endDate: string) { return parseDateRange(startDate, endDate, services.config.USER_TIMEZONE); }
/** Server-side log line for an unexpected error: error name and a short message with configured secrets removed, never a stack. */
function logUnexpected(services: Services, error: unknown): void {
  if (error instanceof ZeppError || error instanceof InputError) return;
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [services.config.ZEPP_APP_TOKEN, services.config.MCP_SECRET]) if (secret) message = message.split(secret).join("[redacted]");
  console.error(`[zepp] unexpected tool error: ${error instanceof Error ? error.name : "non-error"}: ${message.slice(0, 200)}`);
}

async function safe(services: Services, fn: () => Promise<unknown>) {
  const timezone = services.config.USER_TIMEZONE;
  try { return result(await fn(), timezone); }
  catch (error) { logUnexpected(services, error); return result(fromError(error, timezone), timezone); }
}

export interface ZeppMcpExtras {
  /** Provided by the Node server only (needs the local SQLite store). When absent, `sync_status` is not registered. */
  syncStatus?: () => unknown;
}

export function createZeppMcpServer(services: Services, extras: ZeppMcpExtras = {}): McpServer {
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
    description: "Get normalized sleep sessions overlapping an inclusive local-date range. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getSleep(range(services, start_date, end_date))));

  server.registerTool("get_heart_rate", {
    description: "Get normalized heart-rate summaries for an inclusive date range. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getHeartRate(range(services, start_date, end_date))));

  server.registerTool("get_recovery", {
    description: "Get available HRV, readiness, stress, SpO2 and respiratory-rate recovery metrics for an inclusive date range. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getRecovery(range(services, start_date, end_date))));

  server.registerTool("get_training_status", {
    description: "Get available training load, VO2max and lactate-threshold status for an inclusive date range. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.", inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getTrainingStatus(range(services, start_date, end_date))));

  server.registerTool("list_workouts", {
    description: "List Zepp workouts in an inclusive date range. Activity type filtering is local and never changes the upstream URL. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.",
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

  server.registerTool("get_strength_sets", {
    description: "Get set-by-set details for one strength workout ID returned by list_workouts: exercise name, reps, weight (null for bodyweight), duration and average heart rate per set, plus per-exercise rollups (sets, total reps, volume in kg, max weight) and totals. Exercise names come from a small hand-maintained table; unknown exercise IDs are reported as unknown_<id>.",
    inputSchema: z.object({ workout_id: z.string().min(1).max(180) }), annotations
  }, async ({ workout_id }) => safe(services, () => services.getStrengthSets(workout_id)));

  server.registerTool("get_metric_series", {
    description: "Get a normalized scalar time series for a reviewed metric. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.",
    inputSchema: z.object({ metric: z.enum(SERIES_METRIC_IDS), ...rangeShape, limit: z.number().int().min(1).max(MAX_SERIES_LIMIT).default(1000) }), annotations
  }, async ({ metric, start_date, end_date, limit }) => safe(services, () => services.getMetricSeries(metric, range(services, start_date, end_date), limit)));

  server.registerTool("get_raw_metric", {
    description: "Get a sanitized raw Zepp event payload for one reviewed allow-listed metric. Arbitrary URLs, paths, headers and query strings are not accepted. Limited to 31 days per call (raw payloads are not merged); use get_metric_series or get_recovery for longer ranges.",
    inputSchema: z.object({ metric: z.enum(REVIEWED_METRIC_IDS), ...rangeShape }), annotations
  }, async ({ metric, start_date, end_date }) => safe(services, () => services.getRawMetric(metric, range(services, start_date, end_date))));

  server.registerTool("get_weight", {
    description: "Get weigh-in records (weight in kg, plus height, BMI and Zepp body-style code when reported) for an inclusive local-date range, from the Zepp weight endpoint. Only fields Zepp actually returns are included; body-composition readings (fat, water, muscle, ...) appear only if a scale reports them and are not guessed. Returns no_data when there are no weigh-ins. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.",
    inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getWeight(range(services, start_date, end_date))));

  server.registerTool("get_blood_pressure", {
    description: "Get blood pressure readings (systolic/diastolic mmHg, pulse when present) for an inclusive local-date range, from the Zepp blood pressure endpoint and event stream. Returns no_data when the account has no readings (the case for a watch without blood pressure measurement and no manual entries). Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.",
    inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getBloodPressure(range(services, start_date, end_date))));

  server.registerTool("get_hybrid_charge", {
    description: "Get Hybrid Charge (the watch's body-battery-like Charge score, 0-100, with mental and physical components) for an inclusive local-date range: per-day first/last/min/max/average of the total score and average mental/physical values, plus Zepp's Charge insight events (values passed through unchanged; their meaning is not documented). Set include_samples to also get the minute-level samples, deterministically downsampled to max_points. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.",
    inputSchema: z.object({ ...rangeShape, include_samples: z.boolean().default(false), max_points: z.number().int().min(2).max(2000).default(288) }), annotations
  }, async ({ start_date, end_date, include_samples, max_points }) => safe(services, () => services.getHybridCharge(range(services, start_date, end_date), { includeSamples: include_samples, maxPoints: max_points })));

  server.registerTool("get_emotion_events", {
    description: "Get emotion and spot-stress events for an inclusive local-date range: spot stress readings (single_stress, score 0-100) and Emotion stream events when the account has them. Each event has a time, source (spot_stress or emotion) and value. Returns no_data when there are none. Ranges up to 366 days are supported; longer-than-31-day ranges are fetched in several upstream requests and merged, so they take a few seconds.",
    inputSchema: z.object(rangeShape), annotations
  }, async ({ start_date, end_date }) => safe(services, () => services.getEmotionEvents(range(services, start_date, end_date))));

  server.registerTool("list_event_types", {
    description: "Discovery: list the Zepp event streams and data endpoints this server knows (hybrid charge, emotion, blood pressure, HRV, stress, SpO2, PAI, weight, ...) and whether each has data for this account in the last N days (default 90), with the latest event time and the tool that decodes it. Makes one small request per stream, so it takes a few seconds; results are cached for 10 minutes.",
    inputSchema: z.object({ days: z.number().int().min(1).max(365).default(90) }), annotations
  }, async ({ days }) => safe(services, () => services.listEventTypes(days)));

  if (extras.syncStatus) {    const syncStatus = extras.syncStatus;
    server.registerTool("sync_status", {
      description: "Report the state of the local Zepp data store that is filled by the daily sync: last sync time and result (ok/error), row counts and date coverage per table (daily summaries, sleep, workouts, strength sets, weight, blood pressure, hybrid charge samples and insights, emotion/stress events, event stream availability), recent runs and next scheduled run. Read-only; it does not contact Zepp or start a sync.",
      inputSchema: z.object({}), annotations: { ...annotations, openWorldHint: false }
    }, async () => safe(services, async () => ok(syncStatus(), services.config.USER_TIMEZONE)));
  }
  return server;
}
