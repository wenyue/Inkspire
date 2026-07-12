# Project Structure

Strength: `Advisory`

Scope: Top-level ownership, dependency direction, and placement guidance for the client, server,
shared configuration, automation, tests, and documentation.

## Generation Contract

`setup-project-agents` refreshes this project-owned rule from current Inkspire evidence whenever it
runs. Preserve the generator-contract sections and update the concrete structure below from the
repository tree, workspace boundaries, imports, source-module responsibilities, shared
configuration, generated assets, scripts, tests, and documentation ownership.

Keep commands in `20-project-tools.md` and API or domain behavior in `21-project-rules.md`.

## What Belongs Here

- Top-level directories and the responsibilities they own.
- Client, server, configuration, automation, test, asset, and documentation boundaries.
- Allowed and forbidden dependency directions.
- Placement guidance supported by existing modules and scripts.
- Real dependency-enforcement mechanisms when the repository defines them.

## What Does Not Belong Here

- Tool, runtime, build, test, or verification commands; use `20-project-tools.md`.
- API contracts, payload fields, persistence behavior, or domain vocabulary; use
  `21-project-rules.md`.
- General architecture advice not demonstrated by the current repository.
- Worktree workflow procedures or project-specific implementation plans.

## Suggested Generated Content

- Top-level directory and workspace ownership.
- Feature and module boundaries.
- Allowed and forbidden dependency directions.
- Shared locations for configuration, generated assets, test scenarios, scripts, and documents.
- Placement guidance for UI, API, persistence, jobs, prompts, runners, and automation.

## Current Inkspire Ownership

- `client/`: browser application, including UI, client API adapters, and client domain code.
- `server/`: Express service, including API handling, runtime configuration, storage, jobs,
  prompts, image processing, and the Codex runner.
- `config/`: product configuration shared by server loaders and client fallbacks.
- `scripts/`: repository automation plus generated-asset build and validation ownership.
- `e2e/`: Playwright user journeys; its deterministic stack is managed by root scripts.
- `docs/superpowers/`: design and implementation documents, not runtime dependencies.
- `client/public/classic-artworks/`: script-generated classic-artwork assets.

## Current Dependency Direction

- Client UI depends on client API and domain boundaries, never on server internals.
- Client API code handles network transport and does not implement server business behavior.
- Server API code adapts HTTP requests and delegates to runtime, storage, jobs, prompts, image
  processing, or runner modules.
- Storage does not depend on UI or HTTP representations.
- Jobs may coordinate storage, prompts, image processing, and runners while preserving concurrency
  and ownership boundaries.
- Prompt modules construct generation input; they do not own HTTP lifecycle or persistence.
- The Codex runner owns external command execution; it does not own UI representation or database
  schema decisions.
- Both applications read shared product data from `config/`; do not create competing client-only
  and server-only sources for the same configuration.
- Automation scripts may own generated outputs, but runtime modules must not depend on script
  implementations.

## Current Placement Guidance

- Put browser interaction and presentation in `client/`.
- Put HTTP adaptation in the server API surface.
- Put database, upload, record-file, and safe-path behavior in server storage ownership.
- Put long-running generation, queues, concurrency, and state coordination in server jobs or
  runtime ownership.
- Put prompt construction in server prompt modules.
- Put Codex process invocation and result adaptation in the server runner boundary.
- Put cross-application product data in `config/`, not exclusively in either application.
- Put repeatable repository maintenance and generated-asset workflows in `scripts/`.
- Put end-to-end user journeys in `e2e/`; do not hide test-only behavior inside production modules.
