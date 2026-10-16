import { ZeppError } from "../errors";
import type { ServiceContext } from "../services";
import { addIsoDays, parseDateRange, previousIsoDate, splitDateRange } from "../time";
import { fetchBandData } from "../zepp/activity";
import { fetchBloodPressureEntries } from "../zepp/blood-pressure";
import { fetchChargeInsights, fetchChargeSamples } from "../zepp/charge";
import { fetchEmotionEntries } from "../zepp/emotion";
import { fetchRecoveryDays } from "../zepp/recovery-days";
import { probeStreams } from "../zepp/event-manifest";
import { localDateFromMs } from "../zepp/normalize";
import { selectSleepForRange } from "../zepp/sleep";
import { parseStrengthLap } from "../zepp/strength";
import { fetchWeightEntries } from "../zepp/weight";
import { fetchWorkoutHistoryWithRaw, fetchWorkoutRaw } from "../zepp/workouts";
import { EMPTY_COUNTS, type SyncRunCounts, type SyncTrigger, type ZeppStore } from "../store/store";
import { fetchAndStoreAnalysis } from "./details";
import { enabledSteps, type SyncProgress, type SyncStepId } from "./progress";
import { computeSyncWindow, type SyncWindowMode } from "./window";

export interface SyncOptions {
  backfillDays: number;
  recentDays: number;
  /** Days re-fetched before the last successful run's end date (default 2): late-arriving data and a partial last day get corrected. */
  overlapDays?: number;
  /** Test/ops hook: steps to leave out of the run (and out of the reported progress). Not configurable from the environment. */
  skipSteps?: ReadonlySet<string>;
  /** Called whenever the run moves to another step, with the ordered step list. Must not throw; errors are swallowed. */
  onProgress?: (progress: SyncProgress) => void;
  /** Pause between consecutive Zepp requests. */
  requestDelayMs: number;
  /** Days per upstream request window (Zepp ranges are capped at 31 days). */
  chunkDays?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface SyncResult {
  run_id: number;
  trigger: SyncTrigger;
  ok: boolean;
  status: string;
  range: { start: string; end: string };
  /** How the window was chosen: first-run backfill, last success minus overlap, or an explicit days override. */
  window: { mode: SyncWindowMode; days: number; since: string | null; truncated: boolean };
  counts: SyncRunCounts;
  duration_ms: number;
  error?: { kind: string; message: string };
}

const STRENGTH_ZEPP_TYPE = 52;
/** Non-strength workouts get a stored analysis (series, splits, route) for this many days back, newest first, at most this many per run. */
const DETAIL_BACKFILL_DAYS = 90;
const MAX_DETAILS_PER_RUN = 30;
const FATAL_KINDS = new Set(["auth_expired", "upstream_rate_limited"]);
/** How far back the event stream availability probe looks. */
const MANIFEST_WINDOW_DAYS = 90;
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function describeError(error: unknown): { kind: string; message: string } {
  if (error instanceof ZeppError) {
    const message = error.kind === "auth_expired"
      ? "Zepp rejected the stored ZEPP_APP_TOKEN (expired or invalid); replace it in the server configuration."
      : error.kind === "upstream_rate_limited"
        ? (error.retryAfter ? `Zepp rate limited the sync; retry after ${error.retryAfter}.` : "Zepp rate limited the sync.")
        : error.message;
    return { kind: error.kind, message: message.slice(0, 300) };
  }
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unexpected error";
  return { kind: "internal_error", message: message.slice(0, 300) };
}

/**
 * Sync Zepp data into the local store. Sequential, with a pause between upstream requests. Writes are idempotent
 * upserts, so re-running any window is safe. A failure is recorded in sync_runs (data written so far is kept); this
 * function never throws for upstream or auth problems.
 */
export async function runSync(
  ctx: ServiceContext,
  store: ZeppStore,
  options: SyncOptions,
  trigger: SyncTrigger,
  override: { days?: number } = {}
): Promise<SyncResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? (() => {});
  const tz = ctx.config.USER_TIMEZONE;
  const chunkDays = Math.max(1, Math.min(31, options.chunkDays ?? 14));
  const startedMs = now();

  const lastSuccess = store.lastSuccessfulRun();
  const overlapDays = options.overlapDays ?? 2;
  const win = computeSyncWindow({
    today: localDateFromMs(startedMs, tz), lastSuccessEnd: lastSuccess?.range_end, backfillDays: options.backfillDays,
    recentDays: options.recentDays, overlapDays, overrideDays: override.days
  });
  const { start, end, days } = win;
  const firstRun = win.mode === "backfill";
  const steps = enabledSteps(options);
  const stepOn = (id: SyncStepId) => steps.some(x => x.id === id);
  let chunk: SyncProgress["chunk"];
  const report = (id: SyncStepId) => {
    const current = steps.findIndex(x => x.id === id);
    if (current < 0 || !options.onProgress) return;
    try {
      options.onProgress({ steps, current, window_start: start, window_end: end, mode: win.mode, since: win.since, overlap_days: overlapDays, ...(chunk ? { chunk } : {}) });
    } catch { /* progress is informational only */ }
  };
  const runId = store.startRun(trigger, start, end, new Date(startedMs).toISOString());
  const counts: SyncRunCounts = { ...EMPTY_COUNTS };
  let upstreamCalls = 0;
  const pause = async () => { if (upstreamCalls > 0 && options.requestDelayMs > 0) await sleep(options.requestDelayMs); upstreamCalls++; };
  /** Optional data types: an unreadable response is a warning (the rest of the sync continues); auth and rate limits still stop the run. */
  const optionalStep = async (label: string, step: () => Promise<void>) => {
    try { await step(); }
    catch (e) {
      if (e instanceof ZeppError && !FATAL_KINDS.has(e.kind)) { counts.warnings++; log(`${label} skipped (${e.kind})`); return; }
      throw e;
    }
  };
  log(`sync ${trigger} #${runId}: ${start}..${end} (${days} days, ${win.mode}${win.truncated ? ", gap longer than the window cap" : ""})`);

  let failure: { kind: string; message: string } | undefined;
  try {
    // Newest window first, so the most useful data lands first if a long backfill is cut short.
    const windows = splitDateRange(start, end, chunkDays, true);
    let windowNo = 0;
    for (const { startDate: windowStart, endDate: windowEnd } of windows) {
      windowNo++;
      chunk = windows.length > 1 ? { index: windowNo, total: windows.length } : undefined;
      const range = parseDateRange(windowStart, windowEnd, tz);

      if (stepOn("daily_sleep")) {
        report("daily_sleep");
        await pause();
        // One band_data request carries both daily summaries and sleep; sleep needs the previous day to catch overnight sessions.
        const band = await fetchBandData(ctx, previousIsoDate(windowStart), windowEnd, tz, "sync-band");
        const stamp = new Date(now()).toISOString();
        counts.daily += store.upsertDaily(band.daily.filter(d => d.date >= windowStart && d.date <= windowEnd), stamp);
        counts.sleep += store.upsertSleep(selectSleepForRange(band.sleep, range), stamp);
      }

      if (stepOn("workouts") || stepOn("strength")) {
        if (stepOn("workouts")) report("workouts");
        await pause();
        const history = await fetchWorkoutHistoryWithRaw(ctx, range, 200);
        const pendingStrength: string[] = [];
        for (const { summary, raw } of history) {
          store.upsertWorkout(summary, localDateFromMs(Date.parse(summary.started_at), tz), raw, new Date(now()).toISOString());
          counts.workouts++;
          if (summary.zepp_type === STRENGTH_ZEPP_TYPE && !store.isStrengthChecked(summary.workout_id)) pendingStrength.push(summary.workout_id);
        }
        if (stepOn("strength")) {
          report("strength");
          for (const workoutId of pendingStrength) {
            await pause();
            try {
              const detail = await fetchWorkoutRaw(ctx, workoutId);
              const parsed = parseStrengthLap(detail.lap);
              counts.strength_sets += store.replaceStrengthSets(workoutId, parsed.sets);
              if (parsed.malformed) counts.warnings++;
            } catch (e) {
              // A single unreadable workout detail must not abort the run; it stays unchecked and is retried next sync.
              if (e instanceof ZeppError && !FATAL_KINDS.has(e.kind)) { counts.warnings++; log(`strength detail skipped (${e.kind})`); continue; }
              throw e;
            }
          }
        }
      }

      if (stepOn("charge")) {
        report("charge");
        await optionalStep("hybrid charge", async () => {
          await pause();
          const samples = await fetchChargeSamples(ctx, range);
          await pause();
          const insights = await fetchChargeInsights(ctx, range);
          counts.charge_samples += store.upsertChargeSamples(samples);
          counts.charge_insights += store.upsertChargeInsights(insights);
        });
      }
      if (stepOn("emotion")) {
        report("emotion");
        await optionalStep("emotion events", async () => {
          const { entries, skipped } = await fetchEmotionEntries(ctx, range, pause);
          counts.emotion_events += store.upsertEmotion(entries, new Date(now()).toISOString());
          if (skipped) counts.warnings++;
        });
      }
      if (stepOn("blood_pressure")) {
        report("blood_pressure");
        await optionalStep("blood pressure", async () => {
          const { entries, skipped } = await fetchBloodPressureEntries(ctx, range, pause);
          counts.blood_pressure += store.upsertBloodPressure(entries, new Date(now()).toISOString());
          if (skipped) counts.warnings++;
        });
      }
      if (stepOn("recovery")) {
        report("recovery");
        await optionalStep("recovery", async () => {
          const rows = await fetchRecoveryDays(ctx, range, pause);
          counts.recovery_days += store.upsertRecoveryDays(rows, new Date(now()).toISOString());
        });
      }
    }
    chunk = undefined;

    // Workout detail (pace/heart-rate series, splits, route) for runs, walks, rides and the like; a few per run so a backfill never hammers Zepp.
    if (stepOn("routes")) report("routes");
    if (stepOn("routes")) await optionalStep("workout details", async () => {
      const missing = store.missingAnalysisIds(addIsoDays(end, -(DETAIL_BACKFILL_DAYS - 1)), MAX_DETAILS_PER_RUN);
      let stored = 0;
      for (const workoutId of missing) {
        await pause();
        try {
          await fetchAndStoreAnalysis(ctx, store, workoutId, new Date(now()).toISOString());
          stored++;
        } catch (e) {
          if (e instanceof ZeppError && !FATAL_KINDS.has(e.kind)) {
            // Zepp sometimes returns an unreadable detail for one workout; remember that so it is not retried (and warned about) every day.
            if (e.kind === "unrecognized_payload") store.saveWorkoutAnalysis(workoutId, null, new Date(now()).toISOString());
            counts.warnings++; log(`workout detail skipped (${e.kind})`); continue;
          }
          throw e;
        }
      }
      if (missing.length) log(`workout details: ${stored}/${missing.length} stored`);
    });

    // Weigh-ins are sparse: one request (up to 300 records) for the whole run window.
    const fullRange = parseDateRange(start, end, tz, 366);
    if (stepOn("weight")) report("weight");
    if (stepOn("weight")) await optionalStep("weight", async () => {
      await pause();
      const { entries, skipped } = await fetchWeightEntries(ctx, fullRange.fromSec, fullRange.toSec);
      counts.weight += store.upsertWeight(entries, new Date(now()).toISOString());
      if (skipped) counts.warnings++;
    });
    // Which event streams exist / have data (discovery); one tiny request per stream.
    if (stepOn("streams")) report("streams");
    if (stepOn("streams")) await optionalStep("event streams", async () => {
      const manifest = await probeStreams(ctx, MANIFEST_WINDOW_DAYS, now(), pause);
      counts.event_streams += store.upsertEventStreams(manifest.streams, manifest.window_days, manifest.checked_at);
    });
  } catch (e) {
    failure = describeError(e);
    log(`sync #${runId} failed: ${failure.kind}`);
  }

  const finishedMs = now();
  const ok = failure === undefined;
  const status = failure ? failure.kind : counts.warnings > 0 ? "ok_with_warnings" : "ok";
  store.finishRun(runId, { ok, status, counts, ...(failure ? { error_kind: failure.kind, error_message: failure.message } : {}) }, new Date(finishedMs).toISOString());
  log(`sync #${runId} ${status}: daily ${counts.daily}, sleep ${counts.sleep}, workouts ${counts.workouts}, strength sets ${counts.strength_sets}, weight ${counts.weight}, bp ${counts.blood_pressure}, charge ${counts.charge_samples}/${counts.charge_insights}, emotion ${counts.emotion_events}, recovery ${counts.recovery_days}, streams ${counts.event_streams}, warnings ${counts.warnings}, ${finishedMs - startedMs} ms`);
  return {
    run_id: runId, trigger, ok, status, range: { start, end }, window: { mode: win.mode, days, since: win.since, truncated: win.truncated }, counts, duration_ms: finishedMs - startedMs,
    ...(failure ? { error: failure } : {})
  };
}
export { addIsoDays };
