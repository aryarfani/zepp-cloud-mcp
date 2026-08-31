import { noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import { previousIsoDate, type DateRange } from "../time";
import { fetchBandData } from "./activity";
import type { SleepNight } from "./types";

export function selectSleepForRange(sessions: SleepNight[], range: DateRange): SleepNight[] {
  return sessions.filter(session => {
    const start = Date.parse(session.started_at);
    const end = Date.parse(session.ended_at);
    return Number.isFinite(start) && Number.isFinite(end) && start <= range.toMs && end >= range.fromMs;
  });
}

export async function getSleep(ctx: ServiceContext, range: DateRange): Promise<Envelope<SleepNight[]>> {
  const fetchFrom = previousIsoDate(range.startDate);
  const normalized = await fetchBandData(ctx, fetchFrom, range.endDate, range.timezone, "sleep");
  const sessions = selectSleepForRange(normalized.sleep, range);
  return sessions.length
    ? ok(sessions, range.timezone, { warnings: normalized.diagnostics })
    : noData(range.timezone, normalized.diagnostics);
}
