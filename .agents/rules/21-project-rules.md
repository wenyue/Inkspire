# Project Rules

Strength: `Default`

Scope: Shared product configuration, API and domain boundaries, persistence, job lifecycle, and
generated-content conventions.

## Generation Contract

`setup-project-agents` refreshes this project-owned rule from current Inkspire evidence whenever it
runs. Preserve the generator-contract sections and update the concrete project conventions below
from source modules, API behavior, framework configuration, generated-file ownership, persistence,
state lifecycle, concurrency, and domain terminology.

Keep commands in `20-project-tools.md` and top-level ownership or dependency direction in
`22-project-structure.md`.

## What Belongs Here

- Public API and route boundaries, payload compatibility, and ownership checks.
- Framework conventions already enforced by the project.
- Shared configuration, generated-file ownership, and localization conventions.
- Persistence, migration, lifecycle, concurrency, and failure-handling contracts.
- Domain-specific security and path-safety requirements.

## What Does Not Belong Here

- Tool, runtime, build, test, or verification commands; use `20-project-tools.md`.
- Top-level directory maps or dependency direction; use `22-project-structure.md`.
- General code style already covered by base rules.
- Conventions not supported by current repository evidence.

## Suggested Generated Content

- API namespaces, ownership boundaries, payload compatibility, and health contracts.
- Framework and module-system conventions.
- Shared product configuration and localization requirements.
- Persistence, migration, lifecycle, concurrency, and diagnostic behavior.
- Generated-content ownership and regeneration restrictions.

## Current Shared Product Configuration

- `config/` is the shared product-data source for server loaders and client fallbacks.
- When shared configuration changes, keep client and server interpretations of fields, defaults,
  and compatibility behavior aligned.
- Supported locales are `zh-Hans`, `zh-Hant`, `en`, and `ja`; user-visible product data must keep
  all four variants aligned.

## Current API And Domain

- Keep HTTP endpoints under `/api`, with readiness exposed by `/api/health`.
- The UI must not own server persistence, job scheduling, prompt construction, or Codex execution.
- The client API layer owns transport boundaries, the client domain layer owns domain expression,
  and UI components own interaction and presentation.
- Server API handlers delegate to the appropriate runtime, storage, jobs, prompts, image, or Codex
  runner owner.
- Preserve user ownership checks for records, jobs, uploads, generated images, and production
  orders.
- Validate IDs before using them in persisted paths; never concatenate an untrusted ID into a
  filesystem path.

## Current Persistence

- Runtime SQLite is stored as `inkspire.db` under the selected data directory and owns records and
  production orders; uploaded and generated files live under the same data root.
- `INKSPIRE_DATA_DIR` changes the data root. Do not assume runtime data lives at a fixed absolute
  path or inside the repository.
- Preserve the one-time legacy JSON import unless a task explicitly includes migration or removal.
- Keep references among database records, uploads, generated record files, and production orders
  consistent.
- Restrict file reads and writes to the selected data root or configured generation root and reject
  path traversal.

## Current Jobs And Lifecycle

- Preserve the existing queue concurrency limits, per-user and per-origin-tab ownership, and job
  and record status lifecycles.
- UI retries, process restart, and failure recovery must not bypass concurrency or ownership
  checks.
- Keep startup, shutdown, and test-stack management with their existing lifecycle owners.
- Keep deterministic E2E execution explicitly separate from real Codex execution.
- Real-generation failures must retain diagnostic information and must not silently fall back to
  simulated generation.

## Current Framework Conventions

- Keep the client on React 18, Vite, and strict TypeScript unless a task explicitly changes that
  platform boundary.
- Keep the server on CommonJS unless a task explicitly includes a module-system migration.
- Put tests inside their owning `client`, `server`, or `e2e` boundary and verify observable
  behavior.
- Continue to use the existing server image pipeline and WebP output convention.

## Current Generated Content

- The classic-artwork manifest and static directory are script-owned generated outputs.
- To change generated-asset requirements, change the owning build or validation logic first and
  rebuild only as part of an explicit asset task.
- Ordinary feature work, test fixes, and environment setup must not refresh remote artwork assets
  as a side effect.
