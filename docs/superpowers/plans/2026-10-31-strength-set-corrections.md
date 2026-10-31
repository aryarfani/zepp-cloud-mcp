# Strength-set corrections implementation plan

**Goal:** Provide SQLite-backed workout reads and persistent local set corrections through MCP.

**Architecture:** Preserve synced source sets separately from corrections and resolve them into one effective view. Share that view between dashboard and MCP, with explicit sync freshness, coverage, and conflict reporting.

**Tech stack:** TypeScript, Node SQLite, MCP SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-strength-set-corrections-design.md`

## Tasks

1. Add migration and store tests for stable source identities, locally created sets, correction overlays, deletion tombstones, and ambiguous source refreshes. Implement transactional CRUD and effective-set reads; preserve corrections during source replacement and name re-derivation.
2. Test and update dashboard workout details, exercise aggregation, muscle estimates and workout counts to use effective sets and corrected names, without inventing exercise IDs.
3. Test and implement a Node-only MCP store adapter for workout listing, workout detail and strength-set reads, preserving existing response contracts while adding set identifiers, freshness and coverage. Add validated create, update and delete tools with correct write annotations. Keep Worker behavior available without SQLite.
4. Test and implement single-flight stale sync with a configurable 24-hour default, bounded waiting, failure warnings, targeted missing history and detail refresh, and honest incomplete-coverage reporting. Ensure every refresh reconciles source identity without silently misapplying corrections.
5. Run targeted Node and Worker tests, full test suites and typecheck. Inspect the resulting diff and document verified limitations before any deployment. Deploy only in accordance with the applicable separate deployment restrictions.
