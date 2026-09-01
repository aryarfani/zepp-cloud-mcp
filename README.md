# Zepp Cloud MCP

Read-only MCP server for Amazfit / Zepp fitness data, designed for Cloudflare Workers.

It talks directly to the unofficial Zepp/Huami cloud API, normalizes the useful health and workout streams, and exposes a bounded MCP interface for ChatGPT or other MCP clients.

> This project is unofficial and is not affiliated with Zepp Health, Huami, or Amazfit. The upstream API is private/undocumented and can change without notice.

## Architecture

```text
Amazfit watch
    -> Zepp mobile app
    -> Zepp Cloud
    -> Cloudflare Worker
    -> Streamable HTTP MCP (/mcp)
    -> ChatGPT / MCP client
```

There is no desktop ZeppBridge process and no persistent health-data database in Cloudflare.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `zepp_status` | Verify Worker -> Zepp authentication/reachability without returning measurements |
| `get_daily_summary` | Steps, distance, calories, resting HR and available daily metrics |
| `get_sleep` | Normalized sleep sessions and stages |
| `get_heart_rate` | Heart-rate summaries over a date range |
| `get_recovery` | HRV, readiness, stress, SpO2 and respiratory-rate data when available |
| `get_training_status` | Training load, VO2max and lactate-threshold data when available |
| `list_workouts` | Find workouts by date and optional normalized activity type |
| `get_workout` | Get one workout's normalized summary and available detail streams |
| `get_workout_samples` | Explicit HR/pace/cadence/power/GCT/vertical/equivalent-pace/elevation series |
| `get_workout_route` | GPS/elevation route with bounded downsampling |
| `get_metric_series` | Generic normalized series for reviewed metrics |
| `get_raw_metric` | Sanitized raw payload for a reviewed allow-listed metric |

All tools are read-only. `get_raw_metric` does **not** accept arbitrary URLs, paths, headers, or query strings.

## Security model

- `ZEPP_APP_TOKEN` is a Cloudflare Worker secret.
- `MCP_SECRET` is a separate Worker secret used as `Authorization: Bearer ...` on `/mcp`.
- Zepp email/password are never stored.
- Zepp tokens are never returned in MCP responses.
- Upstream redirects are followed only when they stay on the configured HTTPS Zepp origin.
- Public errors do not echo arbitrary upstream response text.
- No D1, KV, R2, or permanent copy of fitness history is required.
- Cloudflare Cache API is used only for short-lived response caching.
- Date ranges are limited to 31 inclusive days per call.
- Workout samples/routes are bounded and disclose when downsampling occurred.

## Quick start

Requirements: Node.js 22+, npm, and a Cloudflare account.

```bash
npm install
```

Edit the non-secret values in `wrangler.jsonc`:

```json
{
  "ZEPP_USER_ID": "YOUR_ZEPP_USER_ID",
  "ZEPP_REGION_HOST": "https://api-mifit-us3.zepp.com",
  "USER_TIMEZONE": "Asia/Jakarta"
}
```

The user ID committed in this repository is deliberately a dummy value.

Set secrets:

```bash
npx wrangler secret put ZEPP_APP_TOKEN
npx wrangler secret put MCP_SECRET
```

Verify locally:

```bash
npm run types
npm run typecheck
npm test
```

Optional live Zepp credential probe (read-only):

```bash
MCP_SECRET=local-probe-secret \
ZEPP_APP_TOKEN='YOUR_TOKEN' \
ZEPP_USER_ID='YOUR_USER_ID' \
ZEPP_REGION_HOST='https://api-mifit-us3.zepp.com' \
USER_TIMEZONE='Asia/Jakarta' \
npm run test:live
```

The live probe checks recent heart rate, band data, and the HRV event API, and prints only authentication/status and response shape information rather than your measurements.

Deploy:

```bash
npx wrangler deploy
```

Your MCP endpoint will be:

```text
https://<worker>.workers.dev/mcp
```

Every MCP request must include:

```http
Authorization: Bearer <MCP_SECRET>
```

See [docs/DEPLOY.md](docs/DEPLOY.md) and [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for the full setup.

## Zepp token rotation

The app token is intentionally treated as an externally acquired credential. If `zepp_status` starts returning `auth_expired`, rotate only the Worker secret:

```bash
npx wrangler secret put ZEPP_APP_TOKEN
```

No code change or Zepp password is required.

## Supported / deliberately unsupported data

The server includes the reviewed ZeppBridge mappings for daily activity, sleep, HR, HRV/RMSSD, readiness, stress, SpO2, respiratory rate, PAI, training load, VO2max, lactate threshold and workout details where Zepp supplies them.

Weight and blood-pressure retrieval are deliberately not exposed. Missing data remains missing; it is not converted to zero or fabricated. Empty Zepp event responses are not automatically treated as proof that a capability is unsupported.

Workout detail follows the verified Zepp semantics used by ZeppBridge, including power, ground-contact time, vertical oscillation, vertical ratio, GPS/elevation and Zepp's equivalent pace. Equivalent pace is kept separate from ordinary pace rather than derived from speed.

## Documentation

- [Cloudflare deployment](docs/DEPLOY.md)
- [MCP client setup](docs/MCP_SETUP.md)
- [Zepp authentication](docs/ZEPP_AUTH.md)
- [Unofficial API behavior and normalization notes](docs/API_NOTES.md)

## Development

```bash
npm run typecheck
npm test
npx wrangler deploy --dry-run --outdir dist
```

GitHub Actions runs install -> Worker type generation -> strict TypeScript -> tests -> Wrangler dry run on `main` and pull requests.

## Credits

The Zepp endpoint mappings and a number of normalization/decoder semantics are informed by [ZeppBridge](https://github.com/lingcang728/ZeppBridge). This project builds a Worker-native, direct-cloud MCP surface rather than using ZeppBridge's desktop SQLite MCP architecture.
