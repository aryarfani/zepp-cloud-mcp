import { InputError } from "./errors";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Largest date range (inclusive days) one tool call may cover. Longer ranges are split into upstream windows. */
export const MAX_RANGE_DAYS = 366;

export interface DateRange {
  startDate: string;
  endDate: string;
  days: number;
  timezone: string;
  startIso: string;
  endIso: string;
  fromMs: number;
  toMs: number;
  fromSec: number;
  toSec: number;
}

interface DateParts { year: number; month: number; day: number }

function parseDate(date: string): DateParts {
  if (!ISO_DATE.test(date)) throw new InputError(`Date must use YYYY-MM-DD (got "${String(date).slice(0, 24)}")`);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) throw new InputError(`Invalid calendar date: ${date}`);
  return { year, month, day };
}

function assertTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new InputError(`Invalid timezone: ${String(timezone).slice(0, 40)}`);
  }
}

function offsetMsAt(epochMs: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(epochMs))
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  ) as Record<string, number>;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

function offsetText(offsetMs: number): string {
  const totalMinutes = Math.round(offsetMs / 60_000);
  const sign = totalMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(totalMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function localBoundary(date: string, timezone: string, end: boolean): { ms: number; iso: string } {
  const { year, month, day } = parseDate(date);
  const hour = end ? 23 : 0;
  const minute = end ? 59 : 0;
  const second = end ? 59 : 0;
  const millisecond = end ? 999 : 0;
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let offset = offsetMsAt(wallClockUtc, timezone);
  let epoch = wallClockUtc - offset;
  const correctedOffset = offsetMsAt(epoch, timezone);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    epoch = wallClockUtc - offset;
  }
  const local = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}`;
  return { ms: epoch, iso: `${local}${offsetText(offset)}` };
}

/** `maxDays` is the inclusive-day cap per call (default MAX_RANGE_DAYS = 366). Upstream window sizes are handled by splitDateRange. */
export function parseDateRange(startDate: string, endDate: string, timezone: string, maxDays = MAX_RANGE_DAYS): DateRange {
  assertTimeZone(timezone);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const startDay = Date.UTC(start.year, start.month - 1, start.day);
  const endDay = Date.UTC(end.year, end.month - 1, end.day);
  if (startDay > endDay) throw new InputError(`start_date (${startDate}) must be on or before end_date (${endDate})`);
  const days = Math.floor((endDay - startDay) / 86_400_000) + 1;
  if (days > maxDays) throw new InputError(`Date range is ${days} days (${startDate} to ${endDate}); the maximum is ${maxDays} days per call. Use a shorter range or split the request.`);
  const from = localBoundary(startDate, timezone, false);
  const to = localBoundary(endDate, timezone, true);
  return {
    startDate,
    endDate,
    days,
    timezone,
    startIso: from.iso,
    endIso: to.iso,
    fromMs: from.ms,
    toMs: to.ms,
    fromSec: Math.floor(from.ms / 1000),
    toSec: Math.floor(to.ms / 1000)
  };
}

export function previousIsoDate(date: string): string {
  const { year, month, day } = parseDate(date);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
}

export function addIsoDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export interface DateWindow { startDate: string; endDate: string }

/**
 * Split an inclusive local-date range into consecutive windows of at most `windowDays` days. Windows are aligned to the
 * END of the range (so a repeated "last N days" query produces the same windows), and returned oldest-first unless
 * `newestFirst` is set (the sync fetches the newest window first).
 */
export function splitDateRange(startDate: string, endDate: string, windowDays: number, newestFirst = false): DateWindow[] {
  const size = Math.max(1, Math.floor(windowDays));
  parseDate(startDate); parseDate(endDate);
  if (startDate > endDate) throw new InputError(`start_date (${startDate}) must be on or before end_date (${endDate})`);
  const windows: DateWindow[] = [];
  for (let windowEnd = endDate; windowEnd >= startDate; windowEnd = addIsoDays(windowEnd, -size)) {
    const first = addIsoDays(windowEnd, -(size - 1));
    windows.push({ startDate: first < startDate ? startDate : first, endDate: windowEnd });
  }
  return newestFirst ? windows : windows.reverse();
}
