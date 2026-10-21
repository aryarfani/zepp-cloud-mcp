# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Open-source project files: AGPL-3.0 `LICENSE`, `THIRD_PARTY_NOTICES.md`, contributing guide, security policy, code of conduct, issue and PR templates, and a CI workflow (Node 22, typecheck and both test suites).
- README rewrite with screenshots, configuration reference, deploy guides and tools table.
- `npm start` script for the Node server.

### Changed
- `tsconfig.json` loads the `cloudflare:test` types and skips library type checks, so `tsc --noEmit` is clean.

## [0.1.0] - 2026-10-21

The first public version.

### Added
- **MCP tools.** 19 read-only tools: 18 on the Workers build, plus `sync_status` on Node.
  - Daily summary, sleep, heart rate, recovery, training status.
  - Workouts, samples, routes, strength sets.
  - Metric series, raw metrics, weight, blood pressure, Hybrid Charge, emotion events, event discovery.
- **Long ranges.** Date ranges up to 366 days, merged from 31-day upstream windows.
- **Node server.**
  - OAuth 2.1 with dynamic client registration, PKCE S256, refresh tokens and revocation.
  - Daily SQLite sync with a smart window and backfill.
- **Dashboard.** Overview, Sleep, Recovery, Activity, Hybrid Charge, Workouts, Training, Exercises, Weight and Sync pages, with muscle map, OpenStreetMap routes, GPX/TCX export and Z icons.
- **Stateless Cloudflare Workers deployment.**

[Unreleased]: https://github.com/aryarfani/zepp-cloud-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aryarfani/zepp-cloud-mcp/releases/tag/v0.1.0
