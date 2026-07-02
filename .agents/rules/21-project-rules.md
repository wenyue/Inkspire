# Project Rules

Strength: `Default`

Scope: Inkspire-specific API contracts, domain conventions, generated-file boundaries, and
frontend/backend behavior.

## Client

- The client is React 18 with Vite and TypeScript.
- TypeScript is strict and no-emit. Keep API and domain boundaries explicit.
- Vitest runs in `jsdom` and loads `client/vitest.setup.ts`.
- Use `lucide-react` for iconography when an icon exists.
- The first screen should be the usable Inkspire creation experience, not a marketing landing page.
- Preserve the locale set: `zh-Hans`, `zh-Hant`, and `en`.
- Keep product configuration data-driven through `config/questions.json`, `config/experts.json`,
  `config/app.json`, prompt config, and i18n JSON files.
- Client API calls should use existing helpers in `client/src/api.ts` and keep server field names
  compatible with current JSON payloads.
- For question-flow behavior, keep the source of truth in `client/src/domain.ts` and config JSON
  rather than duplicating flow logic inside components.

## Server

- Keep API routes rooted under `/api`.
- Keep health reporting on `/api/health` aligned with storage, config, Codex command, data
  directory, and WebP availability checks.
- Persist runtime data under the configured data directory.
- Store record files below `records/`, uploads below `uploads/`, and production orders below
  `orders/`.
- Keep record ids restricted to safe ids before reading or writing filesystem paths.
- Preserve user ownership checks for records, source photos, generated assets, and production
  orders.
- Keep generation concurrency serialized through `createJobManager`; busy generation returns the
  existing busy semantics instead of starting a competing job.
- Preserve deterministic E2E behavior unless the task explicitly needs real Codex generation.

## Image Generation

- Build generation prompts through `server/src/prompts.js`.
- Route image execution and JSON estimation through `server/src/codexRunner.js`.
- Real generation should validate PNG output before WebP conversion.
- Store generated artifacts as WebP for app usage.
- Preserve diagnostics for image-generation failures, including safety-block and fallback details.

## Data Boundaries

- `config/` files are shared product data, not client-only or server-only state.
- Keep persisted record/order JSON compatible with the SQLite-backed storage in
  `server/src/storage.js`.
- Do not rename external JSON field names casually; client and server payloads intentionally use
  the current snake_case fields.
