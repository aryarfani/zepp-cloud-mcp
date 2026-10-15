import type { AppConfig } from "./config";
import { InputError } from "./errors";
import type { Envelope } from "./response";
import type { DateRange } from "./time";
import { defaultSleep, mergeByKey, pacingPause, RAW_METRIC_MAX_DAYS, runWindows, WINDOW_DAYS, type WindowPacing } from "./zepp/windows";
import { getDailySummary } from "./zepp/activity";
import { ZeppClient } from "./zepp/client";
import { getMetricSeries, getRawMetric, MAX_SERIES_LIMIT, type ReviewedMetric, type SeriesMetric } from "./zepp/events";
import { getBloodPressure, type BloodPressureReading } from "./zepp/blood-pressure";
import { getHybridCharge, type ChargeResult } from "./zepp/charge";
import { getEmotionEvents, type EmotionEvent } from "./zepp/emotion";
import { listEventTypes, type EventManifest } from "./zepp/event-manifest";
import { getHeartRate } from "./zepp/heart-rate";
import { getRecovery } from "./zepp/recovery";
import { getSleep } from "./zepp/sleep";
import { getWeight, type WeightRecord } from "./zepp/weight";
import { getTrainingStatus } from "./zepp/training";
import { getWorkoutRoute, getWorkoutSamples, type WorkoutRouteResult, type WorkoutSampleField, type WorkoutSamplesResult } from "./zepp/workout-detail";
import { getStrengthSets, type StrengthSetsResult } from "./zepp/strength";
import { getWorkout, listWorkouts, type WorkoutDetail, type WorkoutSummary } from "./zepp/workouts";
import type { DailySummary, HeartRateDay, MetricPoint, RecoveryDay, SleepNight, TrainingStatusDay } from "./zepp/types";

export interface ServiceContext {
  config: AppConfig;
  zepp: ZeppClient;
}

export interface Services extends ServiceContext {
  getHeartRate(range: DateRange): Promise<Envelope<HeartRateDay[]>>;
  getDailySummary(date: string): Promise<Envelope<DailySummary>>;
  getSleep(range: DateRange): Promise<Envelope<SleepNight[]>>;
  getRecovery(range: DateRange): Promise<Envelope<RecoveryDay[]>>;
  getTrainingStatus(range: DateRange): Promise<Envelope<TrainingStatusDay[]>>;
  getRawMetric(metric: ReviewedMetric, range: DateRange): Promise<Envelope<unknown>>;
  getMetricSeries(metric: SeriesMetric, range: DateRange, limit?: number): Promise<Envelope<MetricPoint[]>>;
  listWorkouts(range: DateRange, activityType?: string, limit?: number): Promise<Envelope<WorkoutSummary[]>>;
  getWorkout(workoutId: string): Promise<Envelope<WorkoutDetail>>;
  getWorkoutSamples(workoutId: string, fields: readonly WorkoutSampleField[], maxPoints?: number): Promise<Envelope<WorkoutSamplesResult>>;
  getWorkoutRoute(workoutId: string, maxPoints?: number): Promise<Envelope<WorkoutRouteResult>>;
  getStrengthSets(workoutId: string): Promise<Envelope<StrengthSetsResult>>;
  getWeight(range: DateRange): Promise<Envelope<WeightRecord[]>>;
  getBloodPressure(range: DateRange): Promise<Envelope<BloodPressureReading[]>>;
  getHybridCharge(range: DateRange, options?: { includeSamples?: boolean; maxPoints?: number }): Promise<Envelope<ChargeResult>>;
  getEmotionEvents(range: DateRange): Promise<Envelope<EmotionEvent[]>>;
  listEventTypes(days?: number): Promise<Envelope<EventManifest>>;
}

export interface ServiceOptions {
  /** Pause between the upstream windows of one long-range call (default 250 ms). */
  windowDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_WORKOUT_LIMIT = 200;

/**
 * Range tools accept up to MAX_RANGE_DAYS (366) days. A range longer than one upstream window is split into windows
 * (sizes in WINDOW_DAYS), fetched sequentially with a short pause, then merged in date order with duplicates removed.
 */
export function createServices(config: AppConfig, fetchImpl: typeof fetch = fetch, options: ServiceOptions = {}): Services {
  const ctx: ServiceContext = { config, zepp: new ZeppClient(config, fetchImpl) };
  const pacing: WindowPacing = { delayMs: options.windowDelayMs ?? 250, sleep: options.sleep ?? defaultSleep };
  const pause = pacingPause(pacing);
  const byDate = <T extends { date: string }>(parts: T[][], combine?: (a: T, b: T) => T) => mergeByKey(parts, row => row.date, (a, b) => a.date.localeCompare(b.date), combine);
  return {
    ...ctx,
    getHeartRate: range => runWindows(range, WINDOW_DAYS.heartRate, pacing, w => getHeartRate(ctx, w), parts => byDate(parts)),
    getDailySummary: date => getDailySummary(ctx, date),
    getSleep: range => runWindows(range, WINDOW_DAYS.band, pacing, w => getSleep(ctx, w),
      parts => mergeByKey(parts, row => row.started_at, (a, b) => a.started_at.localeCompare(b.started_at))),
    getRecovery: range => runWindows(range, WINDOW_DAYS.events, pacing, w => getRecovery(ctx, w), parts => byDate(parts, (a, b) => ({ ...a, ...b }))),
    getTrainingStatus: range => runWindows(range, WINDOW_DAYS.watch, pacing, w => getTrainingStatus(ctx, w), parts => byDate(parts, (a, b) => ({ ...a, ...b }))),
    getRawMetric: (metric, range) => {
      if (range.days > RAW_METRIC_MAX_DAYS) {
        throw new InputError(`get_raw_metric returns unprocessed payloads and is limited to ${RAW_METRIC_MAX_DAYS} days per call (requested ${range.days}); use get_metric_series or get_recovery for longer ranges.`);
      }
      return getRawMetric(ctx, metric, range);
    },
    getMetricSeries: (metric, range, limit) => {
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > MAX_SERIES_LIMIT)) {
        throw new InputError(`limit must be an integer from 1 to ${MAX_SERIES_LIMIT}`);
      }
      // The limit keeps the most recent points of the merged series, so it is applied after merging, not per window.
      const newest = <T,>(rows: T[]) => (limit === undefined ? rows : rows.slice(-limit));
      return runWindows(range, WINDOW_DAYS.events, pacing, w => getMetricSeries(ctx, metric, w),
        parts => newest(mergeByKey(parts, row => row.time, (a, b) => a.time.localeCompare(b.time))))
        .then(envelope => (envelope.data ? { ...envelope, data: newest(envelope.data) } : envelope));
    },
    listWorkouts: (range, activityType, limit = 50) => {
      const cap = Math.max(1, Math.min(MAX_WORKOUT_LIMIT, Math.floor(limit)));
      // Newest window first, and stop once the limit is reached, so the most recent workouts win.
      return runWindows(range, WINDOW_DAYS.workouts, pacing, w => listWorkouts(ctx, w, activityType, cap),
        parts => mergeByKey(parts, row => row.workout_id, (a, b) => b.started_at.localeCompare(a.started_at)).slice(0, cap),
        { newestFirst: true, enough: gathered => gathered.length >= cap });
    },
    getWorkout: workoutId => getWorkout(ctx, workoutId),
    getWorkoutSamples: (workoutId, fields, maxPoints) => getWorkoutSamples(ctx, workoutId, fields, maxPoints),
    getWorkoutRoute: (workoutId, maxPoints) => getWorkoutRoute(ctx, workoutId, maxPoints),
    getStrengthSets: workoutId => getStrengthSets(ctx, workoutId),
    getWeight: range => getWeight(ctx, range),
    getBloodPressure: range => getBloodPressure(ctx, range, pause),
    getHybridCharge: (range, opts) => getHybridCharge(ctx, range, { ...opts, pause }),
    getEmotionEvents: range => getEmotionEvents(ctx, range),
    listEventTypes: days => listEventTypes(ctx, days)
  };
}