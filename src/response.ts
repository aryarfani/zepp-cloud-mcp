import type { PublicStatus } from "./errors";
import { ZeppError } from "./errors";

export interface EnvelopeMeta {
  source: "zepp_cloud";
  source_scope?: "device" | "user_fused" | "unknown";
  fetched_at: string;
  timezone: string;
  partial: boolean;
  warnings: string[];
}

export interface Envelope<T> { status: PublicStatus; data: T | null; meta: EnvelopeMeta }

function baseMeta(timezone: string): EnvelopeMeta {
  return { source: "zepp_cloud", fetched_at: new Date().toISOString(), timezone, partial: false, warnings: [] };
}

export function ok<T>(data: T, timezone: string, extra: Partial<EnvelopeMeta> = {}): Envelope<T> {
  return { status: "ok", data, meta: { ...baseMeta(timezone), ...extra } };
}

export function noData(timezone: string, warnings: string[] = []): Envelope<never> {
  return { status: "no_data", data: null, meta: { ...baseMeta(timezone), warnings } };
}

const SAFE_WARNING: Partial<Record<ZeppError["kind"], string>> = {
  upstream_error: "Zepp Cloud request failed.",
  unsupported: "The requested Zepp operation or metric is not supported by this server.",
  indeterminate: "Zepp returned insufficient evidence to determine whether this metric is available.",
  unrecognized_payload: "Zepp returned a response shape this server does not recognize."
};

export function fromError(error: unknown, timezone: string): Envelope<never> {
  if (error instanceof ZeppError) {
    const warnings: string[] = [];
    if (error.kind === "auth_expired") warnings.push("ZEPP_APP_TOKEN must be replaced in Cloudflare Worker secrets.");
    else if (error.kind === "upstream_rate_limited") warnings.push(error.retryAfter ? `Zepp requested retry after ${error.retryAfter}.` : "Zepp rate limited the request.");
    else warnings.push(SAFE_WARNING[error.kind] ?? "Zepp request could not be completed safely.");
    return { status: error.kind, data: null, meta: { ...baseMeta(timezone), warnings } };
  }
  return { status: "upstream_error", data: null, meta: { ...baseMeta(timezone), warnings: ["Unexpected internal error while querying Zepp."] } };
}
