// Two cheap read-only probes the dashboard's Training page uses. Neither starts a sync or writes anything.
//  - latestEffectiveUpdateTime: when the phone last uploaded the watch's data ({ effectiveTime, lastSyncTime }, epoch seconds)
//  - training/calendar: workouts scheduled in the Zepp app (read only). Item fields follow the app's own model
//    (title, scheduledStartAt, scheduledEndAt, status); the account this was built against has no scheduled items,
//    so the item layout itself is unverified.
import { ZeppError } from "../errors";
import type { ServiceContext } from "../services";
import { buildZeppRequest } from "./endpoints";
import { numericValue, objectValue, parseTimestampMs } from "./normalize";

export interface WatchSync { last_sync_at: string; effective_at: string | null }
export interface PlannedWorkout { title: string; start_at: string; end_at: string | null; status: number | null }

export async function fetchWatchLastSync(ctx: ServiceContext): Promise<WatchSync | null> {
  const raw = objectValue(await ctx.zepp.get(buildZeppRequest("watchUpdateTime", { userId: ctx.config.ZEPP_USER_ID })));
  if (!raw) throw new ZeppError("unrecognized_payload", "Unrecognized update time payload");
  const last = numericValue(raw.lastSyncTime);
  if (last === undefined || last <= 0) return null; // 0 = nothing synced yet
  const effective = numericValue(raw.effectiveTime);
  return { last_sync_at: new Date(last * 1000).toISOString(), effective_at: effective !== undefined && effective > 0 ? new Date(effective * 1000).toISOString() : null };
}

export function normalizeCalendar(raw: unknown, nowMs: number): PlannedWorkout[] {
  const root = objectValue(raw);
  const data = objectValue(root?.data);
  const items = data && Array.isArray(data.items) ? data.items : undefined;
  if (!items) throw new ZeppError("unrecognized_payload", "Unrecognized training calendar payload");
  const out: PlannedWorkout[] = [];
  for (const item of items) {
    const o = objectValue(item); if (!o) continue;
    const start = parseTimestampMs(o.scheduledStartAt);
    if (start === undefined) continue;
    const end = parseTimestampMs(o.scheduledEndAt);
    if ((end ?? start) < nowMs - 86_400_000) continue; // past entries are not "planned"
    const title = typeof o.title === "string" ? o.title.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) : "";
    out.push({ title: title || "Planned workout", start_at: new Date(start).toISOString(), end_at: end !== undefined ? new Date(end).toISOString() : null, status: numericValue(o.status) ?? null });
  }
  return out.sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 60);
}

export async function fetchPlannedWorkouts(ctx: ServiceContext, nowMs: number = Date.now()): Promise<PlannedWorkout[]> {
  const raw = await ctx.zepp.get(buildZeppRequest("trainingCalendar", { userId: ctx.config.ZEPP_USER_ID, startTime: nowMs - 86_400_000, endTime: nowMs + 60 * 86_400_000, limit: 100 }));
  return normalizeCalendar(raw, nowMs);
}
