# MCP client setup

The Worker exposes a stateless Streamable HTTP MCP endpoint at:

```text
https://<worker>.workers.dev/mcp
```

Authentication is a static bearer secret that is independent of the Zepp app token:

```http
Authorization: Bearer <MCP_SECRET>
```

Never configure the Zepp `apptoken` as the MCP client credential. It stays only in Cloudflare Worker secrets.

## Generic MCP configuration

Use the Worker `/mcp` URL, Streamable HTTP transport, and an `Authorization` header containing the MCP secret.

The exact UI/config syntax depends on the MCP client. The server is stateless; clients do not need a local ZeppBridge process or SQLite file.

## Tools

The server registers these 12 read-only tools:

- `zepp_status`
- `get_daily_summary`
- `get_sleep`
- `get_heart_rate`
- `get_recovery`
- `get_training_status`
- `list_workouts`
- `get_workout`
- `get_workout_samples`
- `get_workout_route`
- `get_metric_series`
- `get_raw_metric`

Date-range tools accept inclusive `YYYY-MM-DD` bounds and reject ranges longer than 31 days.

`list_workouts` returns opaque workout IDs. Pass those IDs unchanged to `get_workout`, `get_workout_samples`, or `get_workout_route`; do not construct track IDs manually.

Detailed sample and route tools accept `max_points` and report `original_count`, `returned_count`, and `downsampled` when a series is reduced.

`get_raw_metric` only accepts reviewed metric IDs. It cannot fetch an arbitrary upstream URL.

## ChatGPT

If your ChatGPT plan/workspace supports custom remote MCP apps/connectors, configure the Worker `/mcp` endpoint as a Streamable HTTP MCP server and add the bearer header above. Product availability can change; consult current ChatGPT documentation for your account/workspace if the custom MCP option is not shown.

## Troubleshooting

- HTTP 401 from `/mcp`: MCP bearer secret is missing/wrong.
- MCP response `auth_expired`: rotate `ZEPP_APP_TOKEN` in Worker secrets.
- `upstream_rate_limited`: respect the returned retry guidance; do not repeatedly hammer Zepp.
- `no_data`: the request succeeded but no normalized records were returned for that window.
- `indeterminate`: an empty event response was not enough evidence to declare the capability unsupported.
- `unrecognized_payload`: Zepp changed or returned a shape the reviewed normalizer does not understand.
