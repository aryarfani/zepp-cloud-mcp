# Deploy to Cloudflare Workers

## 1. Prerequisites

- Node.js 22+
- npm
- Cloudflare account
- Zepp `apptoken`, user ID, and regional API host

Install dependencies and authenticate Wrangler:

```bash
npm install
npx wrangler login
```

## 2. Configure non-secret values

Edit `wrangler.jsonc` and replace the dummy user ID. Keep the region host as a bare HTTPS origin with no path, query, port, credentials, or fragment.

```json
{
  "vars": {
    "ZEPP_USER_ID": "YOUR_ZEPP_USER_ID",
    "ZEPP_REGION_HOST": "https://api-mifit-us3.zepp.com",
    "USER_TIMEZONE": "Asia/Jakarta"
  }
}
```

The Worker validates the host against Zepp/Huami `api-mifit*` origins before attaching credentials.

## 3. Add secrets

Generate a separate high-entropy MCP bearer secret and store both secrets using Wrangler:

```bash
npx wrangler secret put ZEPP_APP_TOKEN
npx wrangler secret put MCP_SECRET
```

Do not put either secret in `wrangler.jsonc`, `.dev.vars.example`, source code, GitHub Actions YAML, issues, or logs.

## 4. Verify before deploy

```bash
npm run types
npm run typecheck
npm test
npx wrangler deploy --dry-run --outdir dist
```

To perform the optional read-only Zepp probe locally, provide the same values as environment variables:

```bash
MCP_SECRET=local-probe-secret \
ZEPP_APP_TOKEN='YOUR_TOKEN' \
ZEPP_USER_ID='YOUR_USER_ID' \
ZEPP_REGION_HOST='https://api-mifit-us3.zepp.com' \
USER_TIMEZONE='Asia/Jakarta' \
npm run test:live
```

The probe checks a small recent heart-rate request, today's band-data request, and an HRV event request. It reports response shapes, not health values.

## 5. Deploy

```bash
npx wrangler deploy
```

Wrangler prints the Worker URL. The relevant endpoints are:

```text
GET  /          basic service/version info
GET  /health    local Worker health only; does not contact Zepp
POST /mcp       Streamable HTTP MCP endpoint; bearer auth required
```

Example MCP URL:

```text
https://zepp-cloud-mcp.<account-subdomain>.workers.dev/mcp
```

## 6. Rotate credentials

Rotate the MCP bearer secret independently:

```bash
npx wrangler secret put MCP_SECRET
```

When Zepp authentication expires, rotate only the app token:

```bash
npx wrangler secret put ZEPP_APP_TOKEN
```

The design intentionally does not store Zepp email/password or attempt automatic login/token renewal.

## Storage behavior

No D1, KV, or R2 binding is required. Fitness history is fetched from Zepp on demand. The Worker Cache API may keep successful validated responses briefly; it is not a durable health-data archive.
