import type { SyncService } from "./service";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** First instant strictly after `fromMs` at which the wall clock in `timezone` reads `hour`:00. */
export function nextRunAfter(fromMs: number, hour: number, timezone: string): Date {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  let t = Math.floor(fromMs / MINUTE) * MINUTE + MINUTE;
  for (let i = 0; i < 2 * 24 * 60 + 5; i++, t += MINUTE) {
    const parts = fmt.formatToParts(new Date(t));
    const h = Number(parts.find(p => p.type === "hour")?.value);
    const m = Number(parts.find(p => p.type === "minute")?.value);
    if (h === hour && m === 0) return new Date(t);
  }
  return new Date(fromMs + DAY);
}

export interface SchedulerDeps {
  service: SyncService;
  lastSuccessAt: () => string | null;
  timezone: string;
  now?: () => number;
  /** Delay before the startup catch-up run, so the HTTP server is up first. */
  startupDelayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: (message: string) => void;
}

export interface Scheduler { stop(): void }

/**
 * Daily sync inside the server process. On start it runs a catch-up sync when the last successful run is older than
 * 24 h (or there is none); afterwards it runs at SYNC_HOUR local time every day.
 */
export function startSyncScheduler(deps: SchedulerDeps): Scheduler {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => { const h = setTimeout(fn, ms); h.unref?.(); return h; });
  const clearTimer = deps.clearTimer ?? (h => clearTimeout(h as NodeJS.Timeout));
  const log = deps.log ?? (() => {});
  const { service } = deps;
  let timer: unknown;
  let stopped = false;

  const guarded = async (trigger: "startup" | "scheduled") => {
    try { await service.run(trigger); } catch (e) { log(`sync crashed: ${e instanceof Error ? e.name : "error"}`); }
  };

  const scheduleNext = () => {
    if (stopped) return;
    const at = nextRunAfter(now(), service.config.hour, deps.timezone);
    service.setNextRun(at);
    timer = setTimer(async () => {
      await guarded("scheduled");
      scheduleNext();
    }, Math.max(1000, at.getTime() - now()));
  };

  if (!service.config.enabled) { log("daily sync disabled (SYNC_ENABLED=false)"); return { stop() {} }; }

  const last = deps.lastSuccessAt();
  const stale = !last || now() - Date.parse(last) > DAY;
  if (stale) {
    log(last ? "last successful sync is older than 24h; catching up" : "no successful sync yet; starting backfill");
    timer = setTimer(async () => { await guarded("startup"); scheduleNext(); }, deps.startupDelayMs ?? 5000);
  } else {
    scheduleNext();
  }
  return { stop() { stopped = true; if (timer !== undefined) clearTimer(timer); } };
}