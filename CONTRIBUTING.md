# Contributing

Thanks for your interest! Bug reports, fixes, new metrics and documentation are all welcome.

## Setup

```bash
npm ci                 # Node 22.5+
npm run typecheck
npm test               # workerd suite + Node suite
```

The tests do not need a Zepp account. If you want to check against your own account, `npm run test:live` runs a read-only probe that uses the environment variables from the README. Never paste its output, tokens or health data into issues.

## Guidelines

- Keep every tool **read-only**. Upstream calls must go through the endpoint allow-list in `src/zepp/endpoints.ts`. Do not add code paths that take arbitrary URLs.
- Use the shared normalizers and their typed output. Do not return unvalidated upstream JSON.
- Add or update tests for any behavior you change. Fixtures must be synthetic or scrubbed: no real tokens, user IDs, coordinates or health values.
- `tsc --noEmit` and both test suites must pass. CI runs them on Node 22.
- If you change tools, environment variables or endpoints, update `README.md` and `CHANGELOG.md` too.
- Keep commits focused and explain *why* in the message.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Fill in the PR template.
3. The maintainer reviews PRs and triages issues, usually within a few days.

By contributing, you agree that your contributions are licensed under AGPL-3.0-or-later, and you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
