import { ZeppError } from "../errors";
import type { SourceScope } from "./types";

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function positiveNumber(value: unknown): number | undefined {
  const n = finiteNumber(value);
  return n !== undefined && n > 0 ? n : undefined;
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function firstValue(object: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (object[key] !== undefined && object[key] !== null) return object[key];
  return undefined;
}

export function parseTimestampMs(value: unknown): number | undefined {
  const number = numericValue(value);
  if (number !== undefined) {
    if (number <= 0) return undefined;
    return number >= 100_000_000_000 ? Math.round(number) : Math.round(number * 1000);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function localDateFromMs(epochMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function sourceScope(object: Record<string, unknown>): SourceScope {
  const explicit = firstValue(object, ["source_scope", "sourceScope"]);
  if (explicit === "device" || explicit === "user_fused" || explicit === "unknown") return explicit;
  const source = String(firstValue(object, ["source", "dataSource", "origin"]) ?? "").toLowerCase();
  if (source.includes("fused") || source.includes("user")) return "user_fused";
  if (source.includes("device") || source.includes("watch") || source.includes("band")) return "device";
  if (firstValue(object, ["deviceId", "device_id", "device", "mac", "macAddress"]) !== undefined) return "device";
  return "unknown";
}

export interface ExtractedItems {
  items: unknown[];
  recognized: boolean;
}

const CONTAINER_KEYS = ["items", "records", "results", "list"] as const;

export function extractItems(raw: unknown): ExtractedItems {
  if (Array.isArray(raw)) return { items: raw, recognized: true };
  const root = objectValue(raw);
  if (!root) return { items: [], recognized: false };
  for (const key of CONTAINER_KEYS) {
    if (Array.isArray(root[key])) return { items: root[key] as unknown[], recognized: true };
  }
  const data = objectValue(root.data);
  if (data) {
    for (const key of CONTAINER_KEYS) {
      if (Array.isArray(data[key])) return { items: data[key] as unknown[], recognized: true };
    }
  }
  if (Array.isArray(root.data)) return { items: root.data, recognized: true };
  return { items: [], recognized: false };
}

export function topLevelKeys(raw: unknown): string[] {
  return Object.keys(objectValue(raw) ?? {}).slice(0, 32).sort();
}

export function requireRecognizedItems(raw: unknown, stream: string): unknown[] {
  const extracted = extractItems(raw);
  if (extracted.recognized) return extracted.items;
  const root = objectValue(raw);
  if (root && Object.keys(root).length === 0) return [];
  throw new ZeppError(
    "unrecognized_payload",
    `${stream} response shape was not recognized`,
    undefined,
    undefined,
    { topLevelKeys: topLevelKeys(raw) }
  );
}
