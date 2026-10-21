# Security policy

This server handles health data and credentials, so security reports get priority.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub: https://github.com/aryarfani/zepp-cloud-mcp/security/advisories/new

Please include the affected version or commit, reproduction steps and the impact. You can expect:

- an acknowledgement within 72 hours;
- a fix or mitigation plan within 14 days for confirmed issues.

## Supported versions

Only the latest release on `main` receives fixes.

## Scope

Examples of issues in scope:

- Authentication bypass on `/mcp`, `/dashboard` or the OAuth endpoints (`/authorize`, `/token`, `/register`, `/revoke`).
- Redirect-URI or PKCE flaws, CSRF, or session fixation.
- SSRF or credential leakage to hosts outside the Zepp/Huami allow-list.
- Exposure of `ZEPP_APP_TOKEN`, `MCP_SECRET` or the owner password, or of synced health data.

## Hardening tips for operators

- Run behind TLS. The Node server binds to `127.0.0.1` only.
- Use a long random `MCP_SECRET` and an `OAUTH_OWNER_PASSWORD` of at least 16 characters.
- Make `.env` and `data/` readable only by the service user.
- Rotate the Zepp app token if you suspect it has leaked.
