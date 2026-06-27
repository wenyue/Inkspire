# Project Tooling

Strength: `Mandatory`

## Scope

Applies to repository-wide commands, configuration, runtime data, generated assets, and docs.

## Project Shape

- This repository is an npm workspace with `client` and `server` workspaces.
- Use root scripts for cross-workspace workflows:
  - `npm run dev` starts the server and Vite client together.
  - `npm test` runs available workspace tests.
  - `npm run test:client` and `npm run test:server` run the workspace test aliases.
  - `npm run e2e` runs Playwright from the repository root.
  - `npm run verify:real` runs the real Codex image-generation verification script.
- Keep root-level configuration in `config/`. The client imports config JSON directly for fallback data,
  and the server reads the same files through `server/src/config.js`.

## Runtime

- The Vite dev server proxies `/api` to `http://127.0.0.1:3001`.
- The server defaults to port `3001`, with `PORT` as the override.
- The server data directory defaults to `data/`, with `INKSPIRE_DATA_DIR` as the override.
- E2E mode uses `INKSPIRE_E2E=1` and deterministic image generation unless
  `INKSPIRE_REAL_CODEX=1` is set.
- `npm run e2e` manages the E2E dev stack through `scripts/run-e2e.cjs`: Vite stays on `5173`,
  the API uses `PORT=3101`, and `INKSPIRE_API_TARGET` points the client proxy to that API.
- Real image generation depends on the configured Codex command in `config/app.json`.

## Change Discipline

- Preserve the workspace split: browser UI belongs in `client/`, API/runtime behavior belongs in
  `server/`, shared product data belongs in `config/`.
- Do not hardcode machine-specific absolute paths in tracked config or generated rules.
- Do not edit generated preview assets unless the task is explicitly about assets or previews.
- Keep docs under `docs/superpowers/` in Chinese when writing plans or design notes.
