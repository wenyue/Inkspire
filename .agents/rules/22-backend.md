# Backend

Strength: `Mandatory`

## Scope

Applies to `server/`, API routes, generation jobs, storage, image pipeline, and runtime config loading.

## Stack

- The server is CommonJS Node.js with Express.
- Tests use the built-in Node test runner and `supertest`.
- Image handling uses `sharp` and `pngjs`; generated artifacts are stored as WebP for app usage.

## Runtime Contracts

- Keep API routes rooted under `/api`.
- Keep health reporting on `/api/health` aligned with storage, config, Codex command, data directory,
  and WebP availability checks.
- Persist runtime data under the configured data directory. Store record files below `records/` and
  production orders below `orders/`.
- Preserve atomic JSON writes in storage paths.
- Keep record ids restricted to safe ids before reading or writing filesystem paths.
- Keep generation concurrency serialized through `createJobManager`; busy generation returns the
  existing busy semantics instead of starting a competing job.
- Preserve deterministic E2E behavior unless the task explicitly needs real Codex generation.

## Codex Image Generation

- Build generation prompts through `server/src/prompts.js` and route image execution through
  `server/src/codexRunner.js`.
- Real generation should validate PNG output before WebP conversion.
- Preserve diagnostics for image-generation failures, including safety-block and fallback details.

## Verification

- For server route, storage, job, prompt, config, or image pipeline changes, run
  `npm test --workspace server`.
- If real Codex image generation is affected, run `npm run verify:real` or state why it was skipped.
