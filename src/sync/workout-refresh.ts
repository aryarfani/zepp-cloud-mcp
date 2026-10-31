import type { RefreshRequest } from "../mcp/local-workouts";
import type { ZeppStore } from "../store/store";
import { addIsoDays, parseDateRange, splitDateRange, type DateRange } from "../time";
import { localDateFromMs, parseTimestampMs } from "../zepp/normalize";
import { parseStrengthLap } from "../zepp/strength";
import { decodeWorkoutId, type WorkoutHistoryItem } from "../zepp/workouts";

/** The underlying task continues after a caller times out; concurrent calls share it. */
export function createWorkoutRefresher(deps: {
  store: ZeppStore;
  timezone: string;
  sync?: { isRunning(): boolean; run(trigger: "manual"): Promise<{ ok: boolean } | undefined> };
  history: (range: DateRange) => Promise<{ items: WorkoutHistoryItem[]; complete: boolean }>;
  detail: (id: string) => Promise<Record<string, unknown>>;
  freshnessMs?: number;
  waitMs?: number;
  requestDelayMs?: number;
  now?: () => number;
}) {
  const { store, timezone } = deps;
  const now = deps.now ?? Date.now;
  const freshnessMs = deps.freshnessMs ?? 24 * 60 * 60 * 1000;
  const waitMs = deps.waitMs ?? 25_000;
  let syncPromise: Promise<string[]> | undefined;
  const pending = new Map<string, Promise<string[]>>();
  let tail: Promise<void> = Promise.resolve();
  let lastRequestAt = 0;
  const cutoff = () => new Date(now() - freshnessMs).toISOString();

  async function throttle(): Promise<void> {
    const delay = Math.max(0, (deps.requestDelayMs ?? 0) - (Date.now() - lastRequestAt));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
  }

  async function ensureSync(): Promise<string[]> {
    const last = store.lastSuccessfulRun()?.finished_at;
    if (last && last >= cutoff() && !deps.sync?.isRunning()) return [];
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      if (!deps.sync) return ["Local data is stale; automatic sync is unavailable."];
      try {
        if (deps.sync.isRunning()) {
          while (deps.sync.isRunning()) await new Promise(resolve => setTimeout(resolve, 250));
          const latest = store.lastRun();
          return latest?.ok ? [] : ["The running sync failed; local data may be stale."];
        }
        const result = await deps.sync.run("manual");
        if (!result) {
          while (deps.sync.isRunning()) await new Promise(resolve => setTimeout(resolve, 250));
          const latest = store.lastRun();
          return latest?.ok ? [] : ["The running sync failed; local data may be stale."];
        }
        return result.ok ? [] : ["Automatic sync failed; local data may be stale."];
      } catch { return ["Automatic sync failed; local data may be stale."]; }
    })();
    try { return await syncPromise; } finally { syncPromise = undefined; }
  }

  async function historyWindow(start: string, end: string, warnings: string[], budget: { remaining: number; warned: boolean }): Promise<void> {
    if (store.workoutCoverage(start, end, cutoff())) return;
    if (budget.remaining <= 0) {
      if (!budget.warned) { warnings.push("Workout history coverage is incomplete: the refresh request limit was reached."); budget.warned = true; }
      return;
    }
    budget.remaining--;
    try {
      await throttle();
      const { items, complete } = await deps.history(parseDateRange(start, end, timezone));
      for (const { summary, raw } of items) {
        store.upsertWorkout(summary, localDateFromMs(Date.parse(summary.started_at), timezone), raw, new Date(now()).toISOString());
      }
      // The upstream helper caps results at 200. Split saturated windows; a saturated single day remains uncertain.
      if (!complete) {
        if (start === end) { warnings.push(`Workout history coverage for ${start} is incomplete (upstream limit).`); return; }
        const days = Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
        const mid = addIsoDays(start, Math.floor(days / 2) - 1);
        await historyWindow(start, mid, warnings, budget);
        await historyWindow(addIsoDays(mid, 1), end, warnings, budget);
      } else store.recordWorkoutCoverage(start, end, new Date(now()).toISOString());
    } catch { warnings.push(`Workout history coverage for ${start} to ${end} could not be refreshed.`); }
  }

  async function doRefresh(request: RefreshRequest): Promise<string[]> {
    const warnings = await ensureSync();
    const budget = { remaining: 40, warned: false };
    if ("start" in request) {
      for (const window of splitDateRange(request.start, request.end, 14, true)) await historyWindow(window.startDate, window.endDate, warnings, budget);
      if (!store.workoutCoverage(request.start, request.end, cutoff()) && !warnings.some(w => w.includes("coverage"))) warnings.push("Workout history coverage is incomplete.");
      return warnings;
    }
    const { workoutId } = request;
    let workout = store.localWorkout(workoutId);
    if (!workout) {
      try {
        const { trackid } = decodeWorkoutId(workoutId);
        const stamp = parseTimestampMs(trackid);
        if (stamp === undefined || !Number.isFinite(new Date(stamp).getTime())) throw new Error("Workout track ID is not a usable timestamp");
        const date = localDateFromMs(stamp, timezone);
        await historyWindow(date, date, warnings, budget);
        workout = store.localWorkout(workoutId);
        if (!workout) warnings.push("Workout was not found on the date inferred from its ID; its actual start date may differ.");
      } catch { warnings.push("Workout identifier does not contain a usable date for targeted refresh."); }
    }
    if (request.detail && workout?.summary.zepp_type === 52) {
      const last = store.strengthDetailRefreshedAt(workoutId);
      if (!last || last < cutoff()) {
        try {
          await throttle();
          const revision = store.strengthSourceRevision(workoutId);
          const raw = await deps.detail(workoutId);
          const parsed = parseStrengthLap(raw.lap);
          if (typeof raw.lap !== "string") warnings.push("Zepp did not return recognizable strength detail; existing local sets were kept.");
          else if (parsed.malformed) warnings.push(`${parsed.malformed} malformed strength set row(s); existing local sets were kept.`);
          // An incomplete or empty response must not erase source rows or detach corrections.
          else if (!parsed.sets.length) warnings.push("Zepp returned no recognizable strength sets; existing local sets were kept and the next read will retry.");
          else {
            const replaced = store.replaceStrengthSetsIfUnchanged(workoutId, parsed.sets, parsed.sourceKeys, revision);
            if (replaced === null) warnings.push("Strength source data changed during refresh; newer local sets were kept.");
            else store.markStrengthDetailRefreshed(workoutId, new Date(now()).toISOString());
          }
        } catch { warnings.push("Strength details could not be refreshed; local sets may be stale."); }
      }
    }
    return warnings;
  }

  return async function refresh(request: RefreshRequest): Promise<string[]> {
    const key = JSON.stringify(request);
    let task = pending.get(key);
    if (!task) {
      if (pending.size >= 20) return ["Workout refresh queue is full; local data may be stale or incomplete."];
      task = tail.then(() => doRefresh(request)).catch(() => ["Workout refresh failed; local data may be incomplete."]);
      tail = task.then(() => undefined);
      pending.set(key, task);
      void task.finally(() => pending.delete(key));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([task, new Promise<string[]>(resolve => { timer = setTimeout(() => resolve(["Workout sync is still running; local data may be stale or incomplete."]), waitMs); })]);
    } finally { if (timer) clearTimeout(timer); }
  };
}
