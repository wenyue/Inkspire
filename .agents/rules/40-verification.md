# Verification

Strength: `Mandatory`

## Scope

Applies to test selection and completion reporting for code, config, docs, and asset changes.

## Test Selection

- Use the smallest command that covers the changed behavior, then broaden when a change crosses
  package boundaries or user-visible flows.
- Root command:
  - `npm test`
- Frontend:
  - `npm test --workspace client`
  - `npm run test:client`
- Backend:
  - `npm test --workspace server`
  - `npm run test:server`
- End-to-end:
  - `npm run e2e`
- Real Codex generation:
  - `npm run verify:real`

## Reporting

- Before saying work is complete, report the commands that ran and whether they passed.
- For docs-only rule/config changes, run wrapper and stale-path scans. Skip language build/test
  commands unless executable code, generated files, or runtime scripts changed.
- If a relevant check is skipped because it is slow, requires real Codex generation, or is outside
  the requested scope, say that directly.
