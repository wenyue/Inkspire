# Project Tools

Strength: `Mandatory`

Scope: Repository-wide tooling facts, runtime services, generated assets, verification
requirements, and the environment-setup handoff.

## Generation Contract

`setup-project-agents` refreshes this project-owned rule from current Inkspire evidence whenever it
runs. Preserve the generator-contract sections and update the concrete project facts below from
package manifests, the root lockfile, scripts, runtime configuration, generated-file ownership,
and available CI or MCP configuration.

Record stable facts and constraints here. Keep the executable preparation sequence for an
already-created worktree in `.agents/skills/worktree-environment-setup/SKILL.md`.

## What Belongs Here

- Package manager, language and runtime versions, workspace layout, and authoritative lockfiles.
- Development, test, build, type-check, generation, validation, and verification commands.
- Runtime services, ports, environment variables, data directories, and health checks.
- CI or MCP configuration that exists and must be preserved.
- Generated assets, their owners, and restrictions on direct editing or regeneration.
- The handoff to the target-owned environment setup skill.

## What Does Not Belong Here

- General code style or domain behavior; use base rules or `21-project-rules.md`.
- Directory ownership and dependency direction; use `22-project-structure.md`.
- Worktree selection, creation, integration, or cleanup procedures.
- The executable environment preparation sequence itself.
- Commands or services not proven by current repository evidence.

## Suggested Generated Content

- Concrete setup, install, test, build, type-check, generation, and verification commands.
- Runtime ports, health checks, environment variables, data roots, and credentials when required.
- Existing CI and MCP entries, or an explicit note when the repository defines neither.
- Generated files, their regeneration owners, and files that must not be edited by hand.
- The project skill that prepares an already-created linked worktree.

## Current Inkspire Toolchain

- Inkspire requires Node.js `>=20` and uses npm workspaces with the root `package-lock.json`.
- The workspaces are `client` and `server`; install dependencies from the repository root with
  `npm ci` so the root lockfile remains authoritative.
- The repository does not define a linter, formatter, CI workflow, or MCP server configuration.
  Do not invent or substitute those checks.

## Current Root Scripts

- `npm run dev`: start the client and server development stack.
- `npm start`: start the server application.
- `npm test`: run the available workspace tests.
- `npm run test:server`: run the server test suite.
- `npm run test:client`: run the client test suite.
- `npm run e2e`: run the Playwright end-to-end suite with its managed deterministic stack.
- `npm run verify:real`: verify the generation flow with the real Codex runtime.
- `npm run validate:classic-artworks`: validate the classic-artwork manifest and static assets.

## Current Client Tooling

- The client uses React 18, Vite, strict TypeScript, and Vitest with jsdom.
- Client scripts provide `dev`, `build`, `typecheck`, and `test`.
- `npm run build --workspace client` runs the workspace type check before the Vite build.
- The Vite `/api` proxy uses `INKSPIRE_API_TARGET` when set and otherwise targets
  `http://127.0.0.1:3001`.

## Current Server And Runtime

- The server is a CommonJS Express application tested with `node:test` and Supertest.
- Runtime dependencies include `better-sqlite3`, `sharp`, `pngjs`, and `multer`.
- `PORT` defaults to `3001`; `INKSPIRE_DATA_DIR` defaults to `data`.
- HTTP APIs use the `/api` prefix, and readiness is exposed by `/api/health`.
- `npm run dev` starts both workspaces; ordinary development requires the server and Vite
  processes to remain available on their configured ports.

## Current Generation And E2E Tooling

- `npm run e2e` owns startup and shutdown of a deterministic `INKSPIRE_E2E=1` test stack.
- The E2E launcher searches for available API and web ports beginning near `3101` and `5173`;
  do not assume those exact ports are free.
- Real generation is enabled only when `INKSPIRE_REAL_CODEX=1`.
- `npm run verify:real` requires the configured Codex command to be executable and writes
  verification data under a timestamped `.real-data-*` directory.
- `config/app.json` configures the `codex` command, model `gpt-5.6-terra`, and a generated-images root
  that defaults under `CODEX_HOME` when not explicitly set.
- Generated images are converted to WebP.

## Current Generated Assets

- `scripts/build-classic-artworks.mjs` owns `config/classic-artworks.json` and
  `client/public/classic-artworks/`.
- Validate those assets with `npm run validate:classic-artworks`.
- The build script downloads public Metropolitan Museum of Art resources; it is not an ordinary
  worktree-environment step.
- Do not hand-edit, automatically rebuild, or download these assets during normal setup.

## Current Verification And Environment Handoff

- Use `npm run typecheck --workspace client` for client type checking.
- Select the existing client, server, E2E, classic-artwork, or real-generation command according
  to the changed surface.
- Do not present a nonexistent lint, formatter, CI, or MCP check as project verification.
- Use `.agents/skills/worktree-environment-setup/SKILL.md` only to prepare an already-created
  linked worktree. Baseline verification belongs to the workflow that created the worktree.
