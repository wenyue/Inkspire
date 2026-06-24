# Frontend

Strength: `Mandatory`

## Scope

Applies to `client/`, including React components, Vite config, TypeScript domain code, styles,
and client tests.

## Stack

- The client is React 18 with Vite and TypeScript.
- TypeScript is strict and no-emit. Keep types explicit at API and domain boundaries.
- Vitest runs in `jsdom` and loads `client/vitest.setup.ts`.
- `lucide-react` is available for iconography.

## UI And Data

- The first screen should be the usable Inkspire creation experience, not a marketing landing page.
- Keep product configuration data-driven through `config/questions.json`, `config/experts.json`,
  `config/app.json`, prompt config, and i18n JSON files.
- Preserve the locale set: `zh-Hans`, `zh-Hant`, and `en`.
- Client API calls should use the existing helpers in `client/src/api.ts` and keep server field names
  compatible with current JSON payloads.
- For question-flow behavior, keep the source of truth in `client/src/domain.ts` and config JSON
  rather than duplicating flow logic inside components.

## Verification

- For frontend logic or component changes, run `npm test --workspace client`.
- For changes that affect responsive layout, navigation, upload, generation, library, or production
  ordering flows, also run `npm run e2e` when feasible.
