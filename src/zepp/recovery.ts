import { ZeppError } from "../errors";
import { fromError, noData, ok, type Envelope } from "../response";
import type { ServiceContext } from "../services";
import type { DateRange } from "../time";
import { fetchReviewedMetric, type NormalizedEventPoint, type ReviewedMetric } from "./events";
import { localDateFromMs } from "./normalize";
import type { RecoveryDay, SourceScope } from "./types";

const RECOVERY_METRICS = ["hrv", "hrv_rmssd", "readiness", "respiratory_rate", "blood_oxygen", "all_day_stress"] as const satisfies readonly ReviewedMetric[];

function mergeScope(scopes: SourceScope[]): SourceScope {
  const unique = new Set(scopes);
  if (unique.size === 1) return scopes[0] ?? "unknown";
  if (unique.has("user_fused")) return "user_fused";
  if (unique.has("device")) return "device";
  return "unknown";
}

function partialEnvelope<T>(data: T, timezone: string, warnings: string[]): Envelope<T> {
  return {
    status: "partial",
    data,
    meta: {
      source: "zepp_cloud",
      fetched_at: new Date().toISOString(),
      timezone,
      partial: true,
      warnings
    }
  };
}

export async function getRecovery(ctx: ServiceContext, range: DateRange): Promise<Envelope<RecoveryDay[]>> {
  const settled = await Promise.allSettled(RECOVERY_METRICS.map(metric => fetchReviewedMetric(ctx, metric, range)));
  const authFailure = settled.find(result => result.status === "rejected" && result.reason instanceof ZeppError && result.reason.kind === "auth_expired");
  if (authFailure?.status === "rejected") return fromError(authFailure.reason, range.timezone);

  const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  const successes = settled.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchReviewedMetric>>> => result.status === "fulfilled");
  if (!successes.length && failures.length) return fromError(failures[0]!.reason, range.timezone);

  const byDate = new Map<string, { points: NormalizedEventPoint[] }>();
  for (const success of successes) {
    for (const event of success.value.points) {
      const date = localDateFromMs(Date.parse(event.time), range.timezone);
      const current = byDate.get(date) ?? { points: [] };
      current.points.push(event);
      byDate.set(date, current);
    }
  }

  const rows = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, { points }]) => {
    const row: RecoveryDay = { date, source_scope: mergeScope(points.map(item => item.source_scope)) };
    const latest = (metric: string) => points.filter(item => item.metric === metric).sort((a, b) => a.time.localeCompare(b.time)).at(-1)?.value;
    const hrv = latest("hrv"); if (hrv !== undefined) row.hrv_sdnn_ms = hrv;
    const rmssd = latest("hrv_rmssd"); if (rmssd !== undefined) row.hrv_rmssd_ms = rmssd;
    const readiness = latest("readiness"); if (readiness !== undefined) row.readiness_score = readiness;
    const respiratory = latest("respiratory_rate"); if (respiratory !== undefined) row.respiratory_rate_bpm = respiratory;
    const stress = latest("stress"); if (stress !== undefined) row.stress_avg = stress;
    const spo2 = points.filter(item => item.metric === "spo2").map(item => item.value);
    if (spo2.length) row.spo2_avg_pct = Math.round((spo2.reduce((sum, value) => sum + value, 0) / spo2.length) * 10) / 10;
    return row;
  });

  if (failures.length) {
    const warnings = failures.map(failure => failure.reason instanceof Error ? failure.reason.message : "Zepp recovery stream failed");
    return partialEnvelope(rows, range.timezone, warnings);
  }
  return rows.length ? ok(rows, range.timezone) : noData(range.timezone);
}
