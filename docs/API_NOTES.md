# Zepp API and normalization notes

The upstream API used here is unofficial/private. Endpoint and field behavior is based primarily on the reviewed ZeppBridge implementation and its decoder/normalizer notes.

## Transport

The client sends Zepp's `apptoken` plus the Huami/Zepp mobile-app style headers used by ZeppBridge. Requests are GET-only, time out after 35 seconds, and have a three-attempt budget for transient network/5xx failures. Automatic cross-origin redirects are not allowed.

## Endpoint families

These endpoint families are deliberately kept distinct:

```text
/users/{id}/heartRate
/v1/data/band_data.json
/v1/sport/run/history.json
/v1/sport/run/detail.json
/v2/watch/users/{id}/WatchSportStatistics/{statistic}
/v2/users/me/events
/users/{id}/events
/users/{id}/events/dateString
```

The three event endpoints are not interchangeable. Reviewed metric mappings choose the appropriate family internally.

## Workout history and detail

Zepp's `/v1/sport/run/history.json` feed is treated as an account workout-history feed; the path name is not used as proof that every item is a run. Numeric sport types are mapped only when known; unknown codes remain explicit rather than being silently labeled as running.

Workout detail uses `/v1/sport/run/detail.json` for the validated `trackid + source` pair returned by history.

Public MCP workout IDs encode that pair opaquely and validate both components before any request is built.

## Verified detailed running fields

The detail decoder preserves the following ZeppBridge-verified meanings:

- `power_meter`: running power in watts;
- `runPosture` field 1: ground-contact time in milliseconds; `65535` means not measured;
- `runPosture` field 2: vertical oscillation in millimetres; `65535` means not measured;
- `runPosture` field 3: vertical ratio in tenths of a percent; `255` means not measured;
- `equivPace`: Zepp equivalent/grade-adjusted pace in seconds per kilometre.

Equivalent pace is not calculated from speed. It remains an independent field.

## GPS and elevation

`longitude_latitude` is a coordinate-delta stream with a factor of `100000000`. Coordinates are accumulated before conversion to decimal degrees.

Altitude is represented in centimetres. Large negative values are used by Zepp as no-fix sentinels and are not limited to one exact constant. The decoder therefore accepts only a generous plausible range of -1000 m through 10000 m rather than equality-checking one sentinel value.

## Missing data

Missing, invalid, or sentinel measurements remain absent. They are not changed to zero or interpolated merely to fill a response.

An empty event response is not automatically treated as proof that a watch/account does not support that metric; some Zepp event endpoints return HTTP 200 with empty results even for invalid event names. The public status model therefore distinguishes `no_data`, `unsupported`, and `indeterminate`.

## Raw metric escape hatch

`get_raw_metric` exposes only a reviewed allow-list and sanitizes credential-like keys recursively. It cannot act as an authenticated HTTP proxy.

Reviewed raw metrics currently cover HRV SDNN/RMSSD, readiness, respiratory rate, skin temperature, lactate threshold, daily health, blood oxygen, all-day stress, PAI, ODI and OSA event streams.

Weight and blood pressure are deliberately excluded.

## Data limits and caching

Date ranges are capped at 31 inclusive days. Detailed workout responses are bounded with deterministic downsampling when necessary, while preserving first/last points and reporting original/returned counts.

Current/recovery data uses short cache lifetimes; completed historical/workout data can be cached slightly longer. The Cache API is an optimization, not a durable health-data store.
