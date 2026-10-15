export interface SyncConfig {
  enabled: boolean;
  /** Local hour (0-23, in USER_TIMEZONE) of the daily sync. */
  hour: number;
  backfillDays: number;
  recentDays: number;
  requestDelayMs: number;
  dbPath: string;
}

export const SYNC_DEFAULTS = { enabled: true, hour: 4, backfillDays: 90, recentDays: 7, requestDelayMs: 400, dbPath: "data/zepp.db" } as const;
export const MAX_BACKFILL_DAYS = 730;

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

/** Reads SYNC_ENABLED, SYNC_HOUR, SYNC_BACKFILL_DAYS, SYNC_RECENT_DAYS, SYNC_REQUEST_DELAY_MS and ZEPP_DB_PATH. Invalid values fall back to defaults. */
export function parseSyncConfig(env: Record<string, string | undefined>): SyncConfig {
  return {
    enabled: bool(env.SYNC_ENABLED, SYNC_DEFAULTS.enabled),
    hour: int(env.SYNC_HOUR, SYNC_DEFAULTS.hour, 0, 23),
    backfillDays: int(env.SYNC_BACKFILL_DAYS, SYNC_DEFAULTS.backfillDays, 1, MAX_BACKFILL_DAYS),
    recentDays: int(env.SYNC_RECENT_DAYS, SYNC_DEFAULTS.recentDays, 1, 60),
    requestDelayMs: int(env.SYNC_REQUEST_DELAY_MS, SYNC_DEFAULTS.requestDelayMs, 0, 10_000),
    dbPath: env.ZEPP_DB_PATH?.trim() || SYNC_DEFAULTS.dbPath
  };
}