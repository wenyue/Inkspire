# User-Scoped Generation Jobs Design

## Goal

Inkspire should keep generation state on the server so a user can switch tabs, refresh the browser, close the page, and return later without losing the "generating" state. The server must distinguish browser users with a cookie, show which one or two works are being generated for the current user, and prevent a single user from starting more than two active generation tasks.

## Current Behavior

The current frontend stores generation state in `Studio` component state through `isGenerating`. `App` unmounts `Studio` when the user switches to Library or Artisans, so the local generating state is reset when the user returns.

The current backend does not distinguish users. Records are stored in a global `data/library.json` and `data/records/<id>/record.json`, and endpoints read records by id without ownership checks. The job manager also uses one global lock, which allows only one generation task at a time and does not model per-user active tasks.

## User Identity

The backend will assign each browser a stable `inkspire_user` cookie.

- If a request has no valid cookie, middleware creates a random user id and sets the cookie.
- The cookie is `HttpOnly` and `SameSite=Lax`.
- Local development should not require `Secure`; production can enable it when served over HTTPS.
- `req.userId` becomes the owner id used by storage and job APIs.

This is not an account system. Clearing browser cookies creates a new local user.

## Record Ownership

New records, uploads, jobs, and production orders will store `user_id`.

Storage reads must enforce ownership:

- `GET /api/library` returns only records for the current cookie user.
- `GET /api/records/:id` returns the record only when `record.user_id === req.userId`.
- `GET /api/records/:id/images/:kind` checks record ownership before sending a file.
- Fusion, favorite updates, production estimates, and production orders also verify ownership before mutating or reading record state.

Legacy records without `user_id` remain visible in this local app for compatibility. When a legacy record is saved again, storage should backfill `user_id` to the current user.

## Job Model

Jobs are server-owned and include enough metadata for restoration and UI display.

Each job has:

- `id`
- `user_id`
- `recordId`
- `stage`: `artwork` or `fusion_render`
- `status`: `queued`, `running`, `succeeded`, or `failed`
- `type`
- `title`
- `created_at`
- `started_at`
- `completed_at`
- `error`
- `diagnostics`

The record is created before the generation runner starts. While work is active, the record status is `queued` or `running`; after the runner finishes, the record becomes `succeeded` or `failed`.

## Concurrency Rules

Inkspire will support up to six Codex image-generation tasks at the same time, with a per-user cap of two active tasks.

Active tasks are jobs with status `queued` or `running`.

- Global running limit: at most `6` jobs may be in `running`.
- Per-user active limit: at most `2` active jobs may exist for one `user_id`.
- If the current user already has two active jobs, create requests return HTTP `429` with code `user_generation_limit_reached`.
- If the user has capacity but six jobs are already running globally, the new job is accepted as `queued` and starts when a running slot opens.

The queue can be in memory for this local app. Records remain persisted, so the UI can still show active record state after refresh. If the server process restarts, previously `queued` or `running` jobs should be marked `failed` or `interrupted` on startup rather than shown as still generating.

## API Shape

`POST /api/generations`

- Checks the current user's active task count.
- Creates a record owned by the current user.
- Creates a job owned by the current user.
- Starts immediately when a global slot is available; otherwise leaves the job queued.
- Returns `201` with `{ job, record }` without waiting for image generation to finish.
- Returns `429` with `{ code: "user_generation_limit_reached", activeJobs }` when the user already has two active jobs.

`POST /api/records/:id/fusion`

- Requires the record to belong to the current user.
- Counts against the same per-user limit of two active generation tasks.
- Returns immediately with `{ job, record }`.

`GET /api/jobs/:id`

- Returns only jobs owned by the current user.

`GET /api/me/jobs?status=active`

- Returns current user's active jobs.
- Each item includes display metadata: `id`, `recordId`, `stage`, `status`, `type`, `title`, `created_at`, and `started_at`.

## Frontend Flow

The frontend should treat the server as the source of truth for generation state.

- On app startup, tab changes back to Studio, and after each create request, fetch active jobs for the current user.
- Poll active jobs and their records until all active jobs finish.
- Show one or two active jobs in the Studio surface so the user knows exactly what is still being generated.
- Restore active state after page refresh or browser reopen as long as the cookie remains.
- When a job succeeds, fetch the finished record, update the current result, and update Library.
- When a job fails, show the failed record state and keep the existing retry/continue flow.

The generate button should no longer rely only on component-local `isGenerating`.

## User-Facing Copy

When generation is active, the status text should say:

`墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。`

Traditional Chinese:

`墨色正在鋪開，可能需要花費 2-3 分鐘，請耐心等待。`

English:

`Ink is unfolding. This may take 2-3 minutes. Please wait.`

When the user has already reached two active tasks:

`已有 2 个作品正在生成，请等待完成后再继续。`

Traditional Chinese:

`已有 2 個作品正在生成，請等待完成後再繼續。`

English:

`Two artworks are already being generated. Please wait for one to finish before continuing.`

Queued jobs should use copy that makes the delay clear without implying failure:

`正在排队，墨色即将铺开。`

## Error Handling

- User limit reached returns a structured `429` error and does not create a new record.
- Job polling 404 means the job no longer belongs to the current user or no longer exists; the frontend should refresh active jobs.
- Failed jobs keep a failed record so the user can see the failure and continue from the existing result state.
- Server startup should clean up stale active jobs from previous processes so users are not trapped in a permanent generating state.

## Testing

Backend tests should cover:

- Cookie assignment when no `inkspire_user` cookie exists.
- Library filtering by user.
- Record and image access denied across users.
- `POST /api/generations` returns immediately with `queued` or `running` job state.
- Per-user active limit blocks the third active generation with `429`.
- Global concurrency starts at most six jobs at a time and queues the seventh.
- Completed jobs free both global and per-user capacity.
- Startup cleanup marks stale active jobs as no longer running.

Frontend tests should cover:

- Generation status copy includes the 2-3 minute patience message.
- Switching to another tab and back keeps the active generation state.
- Refresh/remount restores active jobs from `/api/me/jobs?status=active`.
- One active job and two active jobs render distinct titles/statuses.
- Two active jobs disable generation and show the limit message.
- Job completion updates the result and Library.

## Out of Scope

- Login, accounts, or cross-device identity.
- Persistent queue recovery after a server restart.
- Cancelling a running Codex job.
- Sharing records between cookie users.
