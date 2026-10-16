import type { ServiceContext } from "../services";
import type { StoreStats, SyncRunRow, SyncTrigger, ZeppStore } from "../store/store";
import type { SyncConfig } from "./config";
import type { SyncProgress } from "./progress";
import { runSync, type SyncResult } from "./sync";

export interface SyncStatus {
  enabled: boolean;
  running: boolean;
  schedule: { local_hour: number; timezone: string; next_run_at: string | null };
  settings: { backfill_days: number; recent_days: number; overlap_days: number; request_delay_ms: number };
  /** Present only while a run is in progress: the ordered steps, the current one and the window start (no credentials, no upstream data). */
  progress: SyncProgress | null;
  last_run: (Omit<SyncRunRow, "finished_at"> & { finished_at: string | null; duration_s: number | null }) | null;
  last_success_at: string | null;
  recent_runs: Array<Pick<SyncRunRow, "id" | "trigger" | "started_at" | "ok" | "status" | "error_kind">>;
  tables: Omit<StoreStats, "schema_version" | "db_bytes">;
  db: { file: string; schema_version: number; size_bytes: number | null };
}

export interface SyncService {
  readonly config: SyncConfig;
  isRunning(): boolean;
  /** Runs one sync unless one is already running in this process (then returns undefined). */
  run(trigger: SyncTrigger, override?: { days?: number }): Promise<SyncResult | undefined>;
  setNextRun(at: Date | null): void;
  status(): SyncStatus;
}

export function createSyncService(deps: {
  ctx: ServiceContext;
  store: ZeppStore;
  config: SyncConfig;
  log?: (message: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): SyncService {
  const { ctx, store, config } = deps;
  let running = false;
  let nextRun: Date | null = null;
  let progress: SyncProgress | null = null;

  const seconds = (r: SyncRunRow) => (r.finished_at ? Math.max(0, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000)) : null);

  return {
    config,
    isRunning: () => running,
    async run(trigger, override) {
      if (running) return undefined;
      running = true;
      try {
        return await runSync(ctx, store, {
          backfillDays: config.backfillDays, recentDays: config.recentDays, overlapDays: config.overlapDays, requestDelayMs: config.requestDelayMs,
          onProgress: p => { progress = p; },
          ...(deps.log ? { log: deps.log } : {}), ...(deps.now ? { now: deps.now } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {})
        }, trigger, override);
      } finally {
        running = false;
        progress = null;
      }
    },
    setNextRun(at) { nextRun = at; },
    status() {
      const stats = store.stats();
      const last = store.lastRun();
      return {
        enabled: config.enabled,
        running,
        progress: running ? progress : null,
        schedule: { local_hour: config.hour, timezone: ctx.config.USER_TIMEZONE, next_run_at: nextRun ? nextRun.toISOString() : null },
        settings: { backfill_days: config.backfillDays, recent_days: config.recentDays, overlap_days: config.overlapDays, request_delay_ms: config.requestDelayMs },
        last_run: last ? { ...last, duration_s: seconds(last) } : null,
        last_success_at: store.lastSuccessfulRun()?.finished_at ?? null,
        recent_runs: store.recentRuns(5).map(r => ({ id: r.id, trigger: r.trigger, started_at: r.started_at, ok: r.ok, status: r.status, error_kind: r.error_kind })),
        tables: {
          daily_summary: stats.daily_summary, sleep: stats.sleep, workouts: stats.workouts, strength_sets: stats.strength_sets,
          weight_records: stats.weight_records, blood_pressure: stats.blood_pressure, charge_samples: stats.charge_samples,
          charge_insights: stats.charge_insights, emotion_events: stats.emotion_events, recovery_days: stats.recovery_days, event_streams: stats.event_streams, sync_runs: stats.sync_runs
        },
        db: { file: config.dbPath, schema_version: stats.schema_version, size_bytes: stats.db_bytes }
      };
    }
  };
}