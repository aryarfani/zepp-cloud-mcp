# MCP client setup

Both deployments expose a Streamable HTTP MCP endpoint at `/mcp`:

- **Node server:** `https://<your-host>/mcp`. It accepts the static bearer `MCP_SECRET`. When `OAUTH_OWNER_PASSWORD` is set (16 characters or more), it also accepts OAuth 2.1 access tokens: dynamic client registration, PKCE S256, refresh tokens.
- **Cloudflare Worker:** `https://<worker>.workers.dev/mcp`, with the static bearer only.

```http
Authorization: Bearer <MCP_SECRET>
```

Never configure the Zepp `apptoken` as the MCP client credential. It stays on the server.

## Tools

The Node server registers 19 read-only tools. The Worker registers 18, because `sync_status` needs the local database:

`zepp_status`, `get_daily_summary`, `get_sleep`, `get_heart_rate`, `get_recovery`, `get_training_status`, `list_workouts`, `get_workout`, `get_workout_samples`, `get_workout_route`, `get_strength_sets`, `get_metric_series`, `get_raw_metric`, `get_weight`, `get_blood_pressure`, `get_hybrid_charge`, `get_emotion_events`, `list_event_types`, `sync_status` (Node only).

Date-range tools accept inclusive `YYYY-MM-DD` bounds and up to 366 days. Ranges longer than 31 days are fetched in several upstream requests and merged. `get_raw_metric` is limited to 31 days.

`list_workouts` returns opaque workout IDs. Pass those IDs unchanged to `get_workout`, `get_workout_samples`, or `get_workout_route`; do not construct track IDs manually.

Detailed sample and route tools accept `max_points` and report `original_count`, `returned_count`, and `downsampled` when a series is reduced.

`get_raw_metric` only accepts reviewed metric IDs. It cannot fetch an arbitrary upstream URL.

## ChatGPT

Use the Node server with OAuth enabled:

1. In ChatGPT, create a custom connector (developer mode) pointing at `https://<your-host>/mcp`.
2. Choose OAuth.
3. ChatGPT registers itself and opens the owner login page. Approve with the owner password.

Availability depends on your ChatGPT plan.

## Claude

Add a custom connector with the URL `https://<your-host>/mcp`. Claude uses OAuth in the same way.

## Cursor

Add the server to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "zepp": { "url": "https://<your-host>/mcp", "headers": { "Authorization": "Bearer <MCP_SECRET>" } } } }
```

## Troubleshooting

- HTTP 401 from `/mcp`: MCP bearer secret is missing/wrong.
- MCP response `auth_expired`: rotate `ZEPP_APP_TOKEN` in Worker secrets.
- `upstream_rate_limited`: respect the returned retry guidance; do not repeatedly hammer Zepp.
- `no_data`: the request succeeded but no normalized records were returned for that window.
- `indeterminate`: an empty event response was not enough evidence to declare the capability unsupported.
- `unrecognized_payload`: Zepp changed or returned a shape the reviewed normalizer does not understand.
