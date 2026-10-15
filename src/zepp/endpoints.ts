import { ZeppError } from "../errors";

export interface ZeppRequest {
  path: string;
  query: Record<string, string>;
}

export type ZeppEndpointName =
  | "heartRate"
  | "bandData"
  | "sportHistory"
  | "sportDetail"
  | "watchStatistic"
  | "v2Events"
  | "userEvents"
  | "userEventsDateString"
  | "weightRecords"
  | "bloodPressure";

/** Largest `days` window the blood pressure endpoint accepted in live checks (14 ok, 30 rejected). */
export const BLOOD_PRESSURE_MAX_DAYS = 14;

type ArgValue = string | number | boolean | undefined;

function pick(args: Record<string, ArgValue>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap(key => {
    const value = args[key];
    return value === undefined ? [] : [[key, String(value)]];
  }));
}

function validatedTrackId(value: string): string {
  if (!/^\d{1,32}$/.test(value)) throw new ZeppError("unsupported", "Invalid track id");
  return value;
}

function validatedSource(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) throw new ZeppError("unsupported", "Invalid workout source");
  return value;
}

function validatedUserId(value: unknown): string {
  const text = String(value ?? "");
  if (!/^\d+$/.test(text)) throw new ZeppError("unsupported", "Invalid Zepp user id");
  return text;
}

function validatedStatistic(value: string): "SPORT_LOAD" | "VO2_MAX" {
  if (value === "SPORT_LOAD" || value === "VO2_MAX") return value;
  throw new ZeppError("unsupported", "Invalid watch statistic");
}

export function buildZeppRequest(
  name: ZeppEndpointName,
  args: Record<string, ArgValue>
): ZeppRequest {
  switch (name) {
    case "heartRate":
      return {
        path: `/users/${validatedUserId(args.userId)}/heartRate`,
        query: pick(args, ["startTime", "endTime", "limit", "type"])
      };
    case "bandData":
      return {
        path: "/v1/data/band_data.json",
        query: pick(args, ["userid", "from_date", "to_date", "query_type", "byteLength", "device_type"])
      };
    case "sportHistory":
      return {
        path: "/v1/sport/run/history.json",
        query: pick(args, ["userid", "startTrackId", "stopTrackId", "need_sub_data", "type"])
      };
    case "sportDetail":
      return {
        path: "/v1/sport/run/detail.json",
        query: {
          trackid: validatedTrackId(String(args.trackid)),
          source: validatedSource(String(args.source))
        }
      };
    case "watchStatistic":
      return {
        path: `/v2/watch/users/${validatedUserId(args.userId)}/WatchSportStatistics/${validatedStatistic(String(args.statistic))}`,
        query: pick(args, ["startDay", "endDay", "limit", "isReverse"])
      };
    case "v2Events":
      return {
        path: "/v2/users/me/events",
        query: pick(args, ["eventType", "subType", "from", "to", "limit", "reverse"])
      };
    case "userEvents":
      return {
        path: `/users/${validatedUserId(args.userId)}/events`,
        query: pick(args, ["eventType", "subType", "from", "to", "limit", "reverse", "userId"])
      };
    case "weightRecords":
      return {
        path: `/users/${validatedUserId(args.userId)}/members/-1/weightRecords`,
        query: pick(args, ["fromTime", "toTime", "limit", "isForward"])
      };
    case "bloodPressure": {
      // Verified live: `days` must be small (1 and 14 work, 30 is rejected with HTTP 400); `toDate` must be yyyy-MM-dd.
      const days = Number(args.days);
      if (!Number.isInteger(days) || days < 1 || days > BLOOD_PRESSURE_MAX_DAYS) throw new ZeppError("unsupported", `Blood pressure window must be 1 to ${BLOOD_PRESSURE_MAX_DAYS} days`);
      const toDate = String(args.toDate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new ZeppError("unsupported", "Invalid blood pressure toDate");
      return {
        path: "/users/me/bloodPressure",
        query: { days: String(days), sourceArrayStr: "com.huami.midong.associated,com.huami.midong", toDate }
      };
    }
    case "userEventsDateString":
      return {
        path: `/users/${validatedUserId(args.userId)}/events/dateString`,
        query: pick(args, ["eventType", "subType", "from", "to", "timeZone", "limit", "reverse", "userId"])
      };
  }
}
