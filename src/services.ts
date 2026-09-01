import type { AppConfig } from "./config";
import type { Envelope } from "./response";
import type { DateRange } from "./time";
import { getDailySummary } from "./zepp/activity";
import { ZeppClient } from "./zepp/client";
import { getMetricSeries, getRawMetric, type ReviewedMetric, type SeriesMetric } from "./zepp/events";
import { getHeartRate } from "./zepp/heart-rate";
import { getRecovery } from "./zepp/recovery";
import { getSleep } from "./zepp/sleep";
import { getTrainingStatus } from "./zepp/training";
import { getWorkoutRoute, getWorkoutSamples, type WorkoutRouteResult, type WorkoutSampleField, type WorkoutSamplesResult } from "./zepp/workout-detail";
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
}

export function createServices(config: AppConfig, fetchImpl: typeof fetch = fetch): Services {
  const ctx: ServiceContext = { config, zepp: new ZeppClient(config, fetchImpl) };
  return {
    ...ctx,
    getHeartRate: range => getHeartRate(ctx, range),
    getDailySummary: date => getDailySummary(ctx, date),
    getSleep: range => getSleep(ctx, range),
    getRecovery: range => getRecovery(ctx, range),
    getTrainingStatus: range => getTrainingStatus(ctx, range),
    getRawMetric: (metric, range) => getRawMetric(ctx, metric, range),
    getMetricSeries: (metric, range, limit) => getMetricSeries(ctx, metric, range, limit),
    listWorkouts: (range, activityType, limit) => listWorkouts(ctx, range, activityType, limit),
    getWorkout: workoutId => getWorkout(ctx, workoutId),
    getWorkoutSamples: (workoutId, fields, maxPoints) => getWorkoutSamples(ctx, workoutId, fields, maxPoints),
    getWorkoutRoute: (workoutId, maxPoints) => getWorkoutRoute(ctx, workoutId, maxPoints)
  };
}
