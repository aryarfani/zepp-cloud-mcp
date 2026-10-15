import { ZeppError } from "../errors";
import type { ServiceContext } from "../services";
import { parseDateRange, previousIsoDate } from "../time";
import { fetchBandData } from "../zepp/activity";
import { localDateFromMs } from "../zepp/normalize";
import { selectSleepForRange } from "../zepp/sleep";
import { parseStrengthLap } from "../zepp/strength";
import { fetchWorkoutHistoryWithRaw, fetchWorkoutRaw } from "../zepp/workouts";
import type { SyncRunCounts, SyncTrigger, ZeppStore } from "../store/store";

export interface SyncOptions {
  backfillDays: number;
  recentDays: number;
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
  counts: SyncRunCounts;
  duration_ms: number;
  error?: { kind: string; message: string };
}

const STRENGTH_ZEPP_TYPE = 52;
const FATAL_KINDS = new Set(["auth_expired", "upstream_rate_limited"]);
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function addIsoDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

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

  const firstRun = !store.lastSuccessfulRun();
  const days = Math.max(1, override.days ?? (firstRun ? options.backfillDays : options.recentDays));
  const end = localDateFromMs(startedMs, tz);
  const start = addIsoDays(end, -(days - 1));
  const runId = store.startRun(trigger, start, end, new Date(startedMs).toISOString());
  const counts: SyncRunCounts = { daily: 0, sleep: 0, workouts: 0, strength_sets: 0, warnings: 0 };
  let upstreamCalls = 0;
  const pause = async () => { if (upstreamCalls > 0 && options.requestDelayMs > 0) await sleep(options.requestDelayMs); upstreamCalls++; };
  log(`sync ${trigger} #${runId}: ${start}..${end} (${days} days${firstRun ? ", backfill" : ""})`);

  let failure: { kind: string; message: string } | undefined;
  try {
    // Newest window first, so the most useful data lands first if a long backfill is cut short.
    for (let windowEnd = end; windowEnd >= start; windowEnd = addIsoDays(windowEnd, -chunkDays)) {
      const windowStart = addIsoDays(windowEnd, -(chunkDays - 1)) < start ? start : addIsoDays(windowEnd, -(chunkDays - 1));
      const range = parseDateRange(windowStart, windowEnd, tz);

      await pause();
      // One band_data request carries both daily summaries and sleep; sleep needs the previous day to catch overnight sessions.
      const band = await fetchBandData(ctx, previousIsoDate(windowStart), windowEnd, tz, "sync-band");
      const stamp = new Date(now()).toISOString();
      counts.daily += store.upsertDaily(band.daily.filter(d => d.date >= windowStart && d.date <= windowEnd), stamp);
      counts.sleep += store.upsertSleep(selectSleepForRange(band.sleep, range), stamp);

      await pause();
      const history = await fetchWorkoutHistoryWithRaw(ctx, range, 200);
      for (const { summary, raw } of history) {
        store.upsertWorkout(summary, localDateFromMs(Date.parse(summary.started_at), tz), raw, new Date(now()).toISOString());
        counts.workouts++;
        if (summary.zepp_type !== STRENGTH_ZEPP_TYPE || store.isStrengthChecked(summary.workout_id)) continue;
        await pause();
        try {
          const detail = await fetchWorkoutRaw(ctx, summary.workout_id);
          const parsed = parseStrengthLap(detail.lap);
          counts.strength_sets += store.replaceStrengthSets(summary.workout_id, parsed.sets);
          if (parsed.malformed) counts.warnings++;
        } catch (e) {
          // A single unreadable workout detail must not abort the run; it stays unchecked and is retried next sync.
          if (e instanceof ZeppError && !FATAL_KINDS.has(e.kind)) { counts.warnings++; log(`strength detail skipped (${e.kind})`); continue; }
          throw e;
        }
      }
    }
  } catch (e) {
    failure = describeError(e);
    log(`sync #${runId} failed: ${failure.kind}`);
  }

  const finishedMs = now();
  const ok = failure === undefined;
  const status = failure ? failure.kind : counts.warnings > 0 ? "ok_with_warnings" : "ok";
  store.finishRun(runId, { ok, status, counts, ...(failure ? { error_kind: failure.kind, error_message: failure.message } : {}) }, new Date(finishedMs).toISOString());
  log(`sync #${runId} ${status}: daily ${counts.daily}, sleep ${counts.sleep}, workouts ${counts.workouts}, strength sets ${counts.strength_sets}, ${finishedMs - startedMs} ms`);
  return {
    run_id: runId, trigger, ok, status, range: { start, end }, counts, duration_ms: finishedMs - startedMs,
    ...(failure ? { error: failure } : {})
  };
}