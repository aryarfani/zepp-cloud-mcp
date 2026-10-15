import { describe, expect, it } from "vitest";
import { MAX_SERIES_LIMIT, SERIES_METRIC_IDS, getMetricSeries } from "../src/zepp/events";
import type { ServiceContext } from "../src/services";
import type { DateRange } from "../src/time";

// An empty context proves the limit is rejected before any upstream call is attempted.
const ctx = {} as unknown as ServiceContext;
const range = {} as unknown as DateRange;
const metric = SERIES_METRIC_IDS[0]!;

describe("get_metric_series limit", () => {
  it("uses one shared maximum of 2000", () => {
    expect(MAX_SERIES_LIMIT).toBe(2000);
  });

  it.each([0, -1, 1.5, MAX_SERIES_LIMIT + 1, 5000, Number.NaN])("rejects limit %s before fetching", async limit => {
    await expect(getMetricSeries(ctx, metric, range, limit)).rejects.toMatchObject({
      name: "InputError",
      message: "limit must be an integer from 1 to 2000"
    });
  });
});