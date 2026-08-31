export type PublicStatus =
  | "ok"
  | "no_data"
  | "partial"
  | "auth_expired"
  | "upstream_rate_limited"
  | "upstream_error"
  | "unsupported"
  | "indeterminate"
  | "unrecognized_payload";

export class ZeppError extends Error {
  readonly kind: Exclude<PublicStatus, "ok" | "no_data" | "partial">;
  readonly status?: number;
  readonly retryAfter?: string;
  readonly diagnostics?: Record<string, unknown>;

  constructor(
    kind: Exclude<PublicStatus, "ok" | "no_data" | "partial">,
    message: string,
    status?: number,
    retryAfter?: string,
    diagnostics?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ZeppError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
    if (diagnostics !== undefined) this.diagnostics = diagnostics;
  }
}
