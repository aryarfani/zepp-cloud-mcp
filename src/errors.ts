export type PublicStatus =
  | "ok"
  | "no_data"
  | "partial"
  | "auth_expired"
  | "upstream_rate_limited"
  | "upstream_error"
  | "unsupported"
  | "indeterminate"
  | "unrecognized_payload"
  | "invalid_request";

export class ZeppError extends Error {
  readonly kind: Exclude<PublicStatus, "ok" | "no_data" | "partial" | "invalid_request">;
  readonly status?: number;
  readonly retryAfter?: string;
  readonly diagnostics?: Record<string, unknown>;

  constructor(
    kind: Exclude<PublicStatus, "ok" | "no_data" | "partial" | "invalid_request">,
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

/**
 * A caller mistake (bad date, range too long, bad limit). The message is written by this server, never copied from an
 * upstream response, so it is returned to the MCP client as is.
 */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
