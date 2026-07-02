# Project Tools

Strength: `Mandatory`

Scope: Repository-wide commands, runtime services, configuration, generated assets, verification,
and agent settings.

## Project Shape

- This repository is an npm workspace with `client` and `server` workspaces.
- Use Node.js 20 or newer.
- Use root scripts for cross-workspace workflows:
  - `npm run dev` starts the server and Vite client together.
  - `npm test` runs available workspace tests.
  - `npm run test:client` and `npm run test:server` run workspace test aliases.
  - `npm run e2e` runs Playwright from the repository root.
  - `npm run verify:real` runs the real Codex image-generation verification script.
- The client package is an ES module Vite app. The server package is CommonJS Node.js.

## Runtime

- The Vite dev server proxies `/api` to `http://127.0.0.1:3001` by default.
- The server defaults to port `3001`; `PORT` overrides it.
- The server data directory defaults to `data/`; `INKSPIRE_DATA_DIR` overrides it.
- E2E mode uses `INKSPIRE_E2E=1` and deterministic image generation unless
  `INKSPIRE_REAL_CODEX=1` is set.
- `npm run e2e` uses `scripts/run-e2e.cjs` and `scripts/e2e-dev-server.cjs`: Vite stays on
  `5173`, the API uses `PORT=3101`, and `INKSPIRE_API_TARGET` points the client proxy to that API.
- Real image generation depends on the configured Codex command in `config/app.json`.

## Configuration

- Keep root-level product configuration in `config/`.
- The client imports config JSON directly for fallback data.
- The server reads the same config files through `server/src/config.js`.
- Do not hardcode machine-specific absolute paths in tracked config, rules, generated assets, or
  runtime files.
- No `.skillshare/config.yaml` is currently present. Skip skillshare update/sync steps unless that
  config is intentionally added later.

## Verification

- For docs-only rule/config changes, run wrapper and stale-path scans. Skip language build/test
  commands unless executable code, generated files, or runtime scripts changed.
- For frontend logic or component changes, run `npm test --workspace client`.
- For server route, storage, job, prompt, config, or image pipeline changes, run
  `npm test --workspace server`.
- For changes that affect responsive layout, navigation, upload, generation, library, or production
  ordering flows, also run `npm run e2e` when feasible.
- If real Codex image generation is affected, run `npm run verify:real` or state why it was
  skipped.

## Change Discipline

- Preserve the workspace split: browser UI belongs in `client/`, API/runtime behavior belongs in
  `server/`, shared product data belongs in `config/`.
- Do not edit generated preview assets unless the task is explicitly about assets or previews.
- Keep plans and design notes in Chinese when writing prose files for this project.
