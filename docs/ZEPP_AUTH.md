# Zepp authentication

This project uses the same basic cloud credential model as ZeppBridge: a Zepp user ID, regional API host, and `apptoken` header.

## Required values

```text
ZEPP_USER_ID
ZEPP_REGION_HOST
ZEPP_APP_TOKEN
```

`ZEPP_USER_ID` and `ZEPP_REGION_HOST` are Worker configuration values. `ZEPP_APP_TOKEN` is a Worker secret.

The committed `wrangler.jsonc` intentionally contains a dummy user ID. Replace it only in your deployment configuration.

## Region host validation

Only bare HTTPS `api-mifit*.zepp.com` / `api-mifit*.huami.com` origins are accepted. Paths, queries, ports, embedded credentials and look-alike domains are rejected before the app token is attached.

The Zepp HTTP client disables automatic redirect credential forwarding. A redirect is followed manually only when it stays on the same approved HTTPS origin.

## Token lifecycle

The app token is treated as an externally acquired credential rather than a permanent API key. This server does not store a Zepp password and does not implement automatic login/token renewal.

When the upstream returns HTTP 401/403, MCP responses use `auth_expired`. Rotate the Worker secret:

```bash
npx wrangler secret put ZEPP_APP_TOKEN
```

## Read-only validation

`scripts/live-probe.ts` performs three small GET requests:

1. recent `/users/{id}/heartRate`;
2. today's `/v1/data/band_data.json`;
3. recent HRV data via `/v2/users/me/events`.

Run it with environment variables as documented in the README. It prints authentication/status and payload shape information, not measurement values or the app token.

## MCP authentication is separate

`MCP_SECRET` protects the public `/mcp` endpoint and must be unrelated to `ZEPP_APP_TOKEN`.

```text
MCP client --Bearer MCP_SECRET--> Worker --apptoken ZEPP_APP_TOKEN--> Zepp Cloud
```

Compromise or rotation of one credential does not require exposing the other.
