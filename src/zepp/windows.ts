import { ZeppError } from "../errors";
import { fromError, noData, ok, partialResult, type Envelope } from "../response";
import { parseDateRange, splitDateRange, type DateRange, type DateWindow } from "../time";

/**
 * Upstream window sizes (inclusive local days) used when a tool call covers more days than one request should.
 * Verified against the live API (2026-10-15): band_data, v2/user/day events, heartRate, WatchSportStatistics and sport
 * history all answered 366-day requests, so these are chosen for response size and the 2000-event page limit rather
 * than to dodge an upstream error. The exceptions are real upstream limits: blood pressure (`days` <= 14) and
 * WatchSportStatistics (`limit` <= 900).
 */
export const WINDOW_DAYS = {
  band: 31,
  events: 31,
  heartRate: 31,
  watch: 31,
  workouts: 31,
  charge: 14,
  bloodPressure: 13
} as const;

/** Raw payloads are not merged: the escape-hatch tool keeps its single-window limit. */
export const RAW_METRIC_MAX_DAYS = 31;

export interface WindowPacing { delayMs: number; sleep: (ms: number) => Promise<void> }
export const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const NO_PACING: WindowPacing = { delayMs: 0, sleep: async () => {} };

export function pacingPause(pacing: WindowPacing): () => Promise<void> {
  return async () => { if (pacing.delayMs > 0) await pacing.sleep(pacing.delayMs); };
}

const STOP_STATUSES = new Set(["auth_expired", "upstream_rate_limited"]);

export interface WindowedOptions<T> {
  newestFirst?: boolean;
  /** Stop fetching further windows once the data gathered so far is enough (e.g. a workout limit was reached). */
  enough?: (gathered: T[]) => boolean;
}

/**
 * Run `fetch` over windows of `range` sequentially (with the pacing delay between windows) and merge the envelopes.
 *  - a range that fits one window is passed straight through, unchanged;
 *  - auth_expired / rate limiting stop immediately and are returned as is;
 *  - other failed windows make the result `partial` with a note naming the window, unless every window failed;
 *  - empty windows are skipped, and an all-empty result is no_data.
 */
export async function runWindows<T>(
  range: DateRange,
  windowDays: number,
  pacing: WindowPacing,
  fetch: (window: DateRange) => Promise<Envelope<T[]>>,
  merge: (parts: T[][]) => T[],
  options: WindowedOptions<T> = {}
): Promise<Envelope<T[]>> {
  const tz = range.timezone;
  const windows: DateWindow[] = splitDateRange(range.startDate, range.endDate, windowDays, options.newestFirst === true);
  if (windows.length === 1) return fetch(range);

  const parts: T[][] = [];
  const warnings: string[] = [];
  const failures: Array<{ window: DateWindow; envelope: Envelope<never> }> = [];
  let anyPartial = false;

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    if (i > 0) await pacing.sleep(pacing.delayMs);
    let envelope: Envelope<T[]>;
    try {
      envelope = await fetch(parseDateRange(w.startDate, w.endDate, tz, windowDays));
    } catch (error) {
      if (error instanceof ZeppError) envelope = fromError(error, tz) as Envelope<T[]>;
      else throw error;
    }
    if (STOP_STATUSES.has(envelope.status)) return envelope;
    if (envelope.status === "ok" || envelope.status === "partial") {
      if (envelope.data) parts.push(envelope.data);
      if (envelope.status === "partial") anyPartial = true;
    } else if (envelope.status !== "no_data") {
      failures.push({ window: w, envelope: envelope as Envelope<never> });
    }
    for (const warning of envelope.meta.warnings) if (!warnings.includes(warning)) warnings.push(warning);
    if (options.enough?.(parts.flat())) break;
  }

  if (!parts.length && failures.length) {
    return failures[0]!.envelope as Envelope<T[]>; // every window that returned anything failed: report the first failure
  }
  const merged = merge(parts);
  if (!merged.length) return noData(tz, warnings);
  for (const failure of failures) warnings.push(`${failure.window.startDate} to ${failure.window.endDate}: ${failure.envelope.status}`);
  return anyPartial || failures.length ? partialResult(merged, tz, warnings) : ok(merged, tz, { warnings });
}

/** Merge helper: keep the first row seen for each key, then sort. */
export function mergeByKey<T>(parts: T[][], key: (row: T) => string, sort: (a: T, b: T) => number, combine?: (a: T, b: T) => T): T[] {
  const byKey = new Map<string, T>();
  for (const row of parts.flat()) {
    const k = key(row);
    const existing = byKey.get(k);
    byKey.set(k, existing === undefined ? row : combine ? combine(existing, row) : existing);
  }
  return [...byKey.values()].sort(sort);
}