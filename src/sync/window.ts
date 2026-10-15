import { addIsoDays } from "../time";

/** Never ask Zepp for more than this many days in one smart window (also the upstream per-request range cap). */
export const MAX_SMART_DAYS = 31;
/** Smallest smart window (reduced to SYNC_RECENT_DAYS when that is smaller). */
export const MIN_SMART_DAYS = 3;

export type SyncWindowMode = "backfill" | "overlap" | "override";

export interface SyncWindow {
  start: string;
  end: string;
  days: number;
  mode: SyncWindowMode;
  /** Local date the previous successful run covered up to (null on a first run or with an explicit override). */
  since: string | null;
  /** The gap since the last success was longer than the window cap, so older days in between are not re-fetched. */
  truncated: boolean;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Chooses the date window of a sync run (all dates are local YYYY-MM-DD in the user's timezone).
 * - explicit override days always win (a window of that many days ending today);
 * - first run (no successful run yet): the configured backfill;
 * - otherwise: from (the day the last successful run covered up to) minus the overlap days, through today,
 *   clamped to between a small floor and 31 days, so a long gap is caught up and daily runs stay small.
 * Writes are idempotent upserts, so overlapping an already stored window is safe.
 */
export function computeSyncWindow(input: {
  today: string;
  lastSuccessEnd: string | null | undefined;
  backfillDays: number;
  recentDays: number;
  overlapDays: number;
  overrideDays?: number | undefined;
}): SyncWindow {
  const { today } = input;
  const make = (days: number, mode: SyncWindowMode, since: string | null, truncated = false): SyncWindow => ({ start: addIsoDays(today, -(days - 1)), end: today, days, mode, since, truncated });
  if (input.overrideDays !== undefined) return make(Math.max(1, Math.floor(input.overrideDays)), "override", null);
  if (!input.lastSuccessEnd) return make(Math.max(1, input.backfillDays), "backfill", null);
  const since = input.lastSuccessEnd;
  const wantedStart = addIsoDays(since, -Math.max(0, input.overlapDays));
  const span = Math.max(1, dayDiff(wantedStart, today) + 1);
  const floor = Math.max(1, Math.min(MIN_SMART_DAYS, input.recentDays));
  const days = Math.min(MAX_SMART_DAYS, Math.max(floor, span));
  return make(days, "overlap", since, span > MAX_SMART_DAYS);
}
