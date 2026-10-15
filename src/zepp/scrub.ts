const IDENTITY_KEYS = /^(userid|user_id|deviceid|device_id|devicesn|device_sn|devicemac|device_mac|mac|macaddress|appname|apptoken|token|authorization|cookie|access_token|refresh_token)$/i;

/** Copy of a Zepp payload without account/device identifiers or credential-like keys (used before storing raw JSON). */
export function scrubIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubIdentity);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (IDENTITY_KEYS.test(key)) continue;
      output[key] = scrubIdentity(child);
    }
    return output;
  }
  return value;
}

/** Scalar fields of an object, minus identifiers; handy for exposing unknown-but-harmless event fields. */
export function scalarFields(object: Record<string, unknown>, skip: readonly string[] = []): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, child] of Object.entries(object)) {
    if (IDENTITY_KEYS.test(key) || skip.includes(key)) continue;
    if (typeof child === "string" || typeof child === "boolean" || (typeof child === "number" && Number.isFinite(child))) output[key] = child;
  }
  return output;
}