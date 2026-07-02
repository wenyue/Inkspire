# Project Structure

Strength: `Advisory`

Scope: Top-level module boundaries, dependency direction, shared locations, and ownership.

## Top-Level Layout

- `client/`: React/Vite UI, client-side domain helpers, styles, and client tests.
- `server/`: Express app, storage, image pipeline, Codex runner, prompts, runtime config loading,
  and server tests.
- `config/`: Shared product configuration consumed by both client and server.
- `scripts/`: Repository-level verification and local orchestration scripts.
- `e2e/`: Playwright end-to-end tests.
- `docs/`: Project documentation and plans.
- `data/` and `.e2e-data/`: Runtime data locations, not source-owned product config.

## Dependency Direction

- Client code may read shared config JSON but should not import server modules.
- Server code may read shared config JSON but should not import client modules.
- Shared product facts belong in `config/`; UI-only behavior belongs in `client/`; API/runtime
  behavior belongs in `server/`.
- Keep domain flow logic in `client/src/domain.ts` when it affects question progression or result
  layout decisions.
- Keep server persistence, path validation, ownership, and migration behavior in
  `server/src/storage.js` or the nearest server owner.

## Ownership

- Add UI components under `client/src/components/` when they are user-facing view pieces.
- Add reusable client API behavior to `client/src/api.ts` instead of duplicating fetch contracts in
  components.
- Add generation prompt behavior to `server/src/prompts.js` and execution behavior to
  `server/src/codexRunner.js`.
- Add image file conversion/archive behavior to `server/src/imagePipeline.js`.
- Keep Playwright stack orchestration in `scripts/run-e2e.cjs` and `scripts/e2e-dev-server.cjs`.
