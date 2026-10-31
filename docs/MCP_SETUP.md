# MCP client setup

## Node deployment: local workout corrections

The Node deployment at `https://zepp.arfani.my.id/mcp` supports OAuth and the configured static bearer token. Authenticated clients can read workout summaries and strength sets from the local SQLite database and can create, update and delete individual sets. These changes affect the local MCP and dashboard only; they do not modify the Zepp app or Zepp Cloud. Treat access to this endpoint as write access to personal workout data.

1. Use `list_workouts` to obtain a `workout_id`, then `get_strength_sets` to obtain each stable set `id`.
2. Use `create_strength_set` with `workout_id`, `exercise`, `reps` and `weight_kg`; use `null` weight for bodyweight. Use `update_strength_set` with `workout_id`, `set_id` and the fields to change. Use `delete_strength_set` with `workout_id` and `set_id` to delete a set locally. A weight of zero is distinct from bodyweight.
3. Reads may start a Zepp sync if the last successful sync is older than `MCP_WORKOUT_MAX_AGE_HOURS` (default 24, range greater than 0 through 720). Missing historical coverage and stale strength detail are fetched as needed. A read waits at most 25 seconds; the refresh may continue in the background. Inspect `status`, `meta.partial` and `meta.warnings` before treating results as complete. Each refresh is limited to 40 history requests and uses `SYNC_REQUEST_DELAY_MS` between requests. Saturated or otherwise incomplete history is reported, not marked covered.
4. Local edits are kept separately from source sets. Each returned set has `origin` (`zepp` or `manual`) and a `corrected` flag. Source matching uses a hash of the full Zepp set row without its position; duplicate or changed rows are treated as ambiguous. Existing sets imported before this feature do not have a source fingerprint until refreshed. When a source row cannot be matched unambiguously, `get_strength_sets` returns its saved original and correction in `conflicts`; it does not silently attach the correction to another set. Review and reapply the change to the correct current set, then call `discard_strength_conflict` with `workout_id` and `conflict_id` to remove that unmatched correction. Discarding is permanent.

Exercise names without a verified catalog ID are shown as custom and do not contribute an invented muscle estimate. Current OAuth and bearer credentials authorize the new write operations; reconnect or refresh the MCP client if its tool list is cached. The Node server requires its local store for workout tools and reports an error if the store is unavailable. Workout samples, GPS routes and other health-data MCP tools retain their previous upstream behavior.

The Node store migrates to schema version 5 on startup. Before deploying, take a consistent backup of the database including its WAL state (for example, stop the service before archiving `data/`), as well as the application and configuration. An older build refuses a v5 database; rollback requires a compatible database restore. Such a restore can lose corrections and synced data written after the backup, so preserve the newer database separately before restoring.

Both deployments expose a Streamable HTTP MCP endpoint at `/mcp`:

- **Node server:** `https://<your-host>/mcp`. It accepts the static bearer `MCP_SECRET`. When `OAUTH_OWNER_PASSWORD` is set (16 characters or more), it also accepts OAuth 2.1 access tokens: dynamic client registration, PKCE S256, refresh tokens.
- **Cloudflare Worker:** `https://<worker>.workers.dev/mcp`, with the static bearer only.

```http
Authorization: Bearer <MCP_SECRET>
```

Never configure the Zepp `apptoken` as the MCP client credential. It stays on the server.

## Tools

The Node server registers the following read tools plus four local write tools. The Worker registers the read tools except `sync_status`, because it needs the local database:

`zepp_status`, `get_daily_summary`, `get_sleep`, `get_heart_rate`, `get_recovery`, `get_training_status`, `list_workouts`, `get_workout`, `get_workout_samples`, `get_workout_route`, `get_strength_sets`, `get_metric_series`, `get_raw_metric`, `get_weight`, `get_blood_pressure`, `get_hybrid_charge`, `get_emotion_events`, `list_event_types`, `sync_status` (Node only).

Node-only write tools: `create_strength_set`, `update_strength_set`, `delete_strength_set`, and `discard_strength_conflict`.

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
