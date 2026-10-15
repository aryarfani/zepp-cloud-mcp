// Lazy fetch for the dashboard: when a workout is opened and has no stored analysis yet, fetch its detail from Zepp once, store it, and return it.
// This is the only upstream Zepp call the dashboard can trigger. It is server side only, authenticated by the dashboard session,
// de-duplicated per workout, rate limited globally, and failures are remembered briefly so a broken workout is not retried on every click.
import { ZeppError } from "../errors";
import type { ServiceContext } from "../services";
import { fetchAndStoreAnalysis } from "../sync/details";
import type { ZeppStore } from "../store/store";

export type AnalysisLoadResult = { status: "ok"; analysis: unknown } | { status: "unavailable"; reason: string };

export interface AnalysisLoaderOptions {
  ctx: ServiceContext;
  store: ZeppStore;
  now?: () => number;
  /** Upstream fetches allowed per window (default 12 per 10 minutes). */
  maxPerWindow?: number;
  windowMs?: number;
  /** How long a failed workout is not retried (default 5 minutes). */
  failureTtlMs?: number;
  log?: (message: string) => void;
}

export function createAnalysisLoader(opts: AnalysisLoaderOptions): (workoutId: string) => Promise<AnalysisLoadResult> {
  const now = opts.now ?? Date.now;
  const maxPerWindow = opts.maxPerWindow ?? 12;
  const windowMs = opts.windowMs ?? 600_000;
  const failureTtlMs = opts.failureTtlMs ?? 300_000;
  const inflight = new Map<string, Promise<AnalysisLoadResult>>();
  const failures = new Map<string, { at: number; reason: string }>();
  let hits: number[] = [];

  async function run(workoutId: string): Promise<AnalysisLoadResult> {
    const t = now();
    hits = hits.filter(h => t - h < windowMs);
    if (hits.length >= maxPerWindow) return { status: "unavailable", reason: "rate_limited" };
    hits.push(t);
    try {
      const analysis = await fetchAndStoreAnalysis(opts.ctx, opts.store, workoutId, new Date(t).toISOString());
      return analysis ? { status: "ok", analysis } : { status: "unavailable", reason: "no_detail" };
    } catch (e) {
      const kind = e instanceof ZeppError ? e.kind : "error";
      opts.log?.(`workout analysis fetch failed (${kind})`);
      const reason = kind === "upstream_rate_limited" ? "rate_limited" : "upstream_error";
      failures.set(workoutId, { at: t, reason });
      if (failures.size > 200) failures.clear();
      return { status: "unavailable", reason };
    }
  }

  return async function load(workoutId: string): Promise<AnalysisLoadResult> {
    const failed = failures.get(workoutId);
    if (failed && now() - failed.at < failureTtlMs) return { status: "unavailable", reason: failed.reason };
    const existing = inflight.get(workoutId);
    if (existing) return existing;
    const promise = run(workoutId).finally(() => inflight.delete(workoutId));
    inflight.set(workoutId, promise);
    return promise;
  };
}