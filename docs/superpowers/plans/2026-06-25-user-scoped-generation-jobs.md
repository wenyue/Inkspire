# User-Scoped Generation Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Inkspire generation jobs server-owned, cookie-scoped, recoverable after tab changes and browser refreshes, with six global Codex workers and two active tasks per browser user.

**Architecture:** Add lightweight cookie identity middleware, store `user_id` on records/jobs/orders, and make job creation asynchronous through an in-memory queue with persisted record status. The frontend will fetch `/api/me/jobs?status=active`, poll active jobs, and render the current user's one or two active generations instead of relying on `Studio` local `isGenerating`.

**Tech Stack:** Express 4, Node `node:test`, file-backed JSON storage, React/Vite, Vitest, Testing Library.

---

## File Structure

- Create: `server/src/userIdentity.js`
  - Parses cookies, creates `inkspire_user`, attaches `req.userId`, and sets the cookie.
- Modify: `server/src/storage.js`
  - Adds owner-aware record/library/order helpers and startup stale-active cleanup.
- Modify: `server/src/jobs.js`
  - Replaces the single lock with a six-worker global queue and two-active-jobs per user.
- Modify: `server/src/app.js`
  - Installs identity middleware, passes `userId` to storage/jobs, adds `/api/me/jobs`, and protects record routes.
- Modify: `server/tests/storage.test.js`
  - Tests user filtering and legacy backfill behavior.
- Modify: `server/tests/jobs.test.js`
  - Tests async jobs, global concurrency, per-user limit, completion capacity release, and stale cleanup.
- Modify: `server/tests/app.test.js`
  - Tests cookie assignment, owner-protected routes, immediate job responses, active jobs API, and limit errors.
- Modify: `client/src/api.ts`
  - Adds active job types/functions and structured generation limit error handling.
- Modify: `client/src/i18n.ts`
  - Adds status, queued, and limit copy in Simplified Chinese, Traditional Chinese, and English.
- Modify: `client/src/App.tsx`
  - Owns active job polling, result updates, and active generation state across tab switches.
- Modify: `client/src/components/Studio.tsx`
  - Displays server active jobs and disables generation when user limit is reached.
- Modify: `client/src/styles.css`
  - Adds compact active-job status styling.
- Modify: `client/tests/app.test.tsx`
  - Tests status copy, tab switch recovery, remount recovery, two active jobs, limit message, and job completion.

---

### Task 1: Cookie User Identity And Owner-Aware Storage

**Files:**
- Create: `server/src/userIdentity.js`
- Modify: `server/src/storage.js`
- Test: `server/tests/storage.test.js`
- Test: `server/tests/app.test.js`

- [ ] **Step 1: Write storage ownership tests**

Append these tests to `server/tests/storage.test.js`:

```js
test("listLibrary filters records by user while keeping legacy records visible", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.saveRecord({
      id: "mine",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/mine/artwork.webp",
      favorite: true,
      status: "succeeded"
    });
    await storage.saveRecord({
      id: "theirs",
      user_id: "user-b",
      created_at: "2026-06-25T10:01:00.000Z",
      type: "painting",
      artwork_path: "records/theirs/artwork.webp",
      favorite: true,
      status: "succeeded"
    });
    await storage.saveRecord({
      id: "legacy",
      created_at: "2026-06-25T10:02:00.000Z",
      type: "calligraphy",
      artwork_path: "records/legacy/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    const records = await storage.listLibrary("user-a");

    assert.deepEqual(records.map((record) => record.id), ["legacy", "mine"]);
  });
});

test("getRecordForUser rejects records owned by another user", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.saveRecord({
      id: "private-work",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/private-work/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    await assert.rejects(
      () => storage.getRecordForUser("private-work", "user-b"),
      /not found/i
    );
    assert.equal((await storage.getRecordForUser("private-work", "user-a")).id, "private-work");
  });
});

test("saveRecord backfills legacy user_id when owner is provided", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.saveRecord({
      id: "legacy-backfill",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/legacy-backfill/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    const legacy = await storage.getRecordForUser("legacy-backfill", "user-a");
    legacy.favorite = false;
    await storage.saveRecord(legacy, "user-a");

    assert.equal((await storage.getRecord("legacy-backfill")).user_id, "user-a");
  });
});
```

- [ ] **Step 2: Run storage tests to verify they fail**

Run:

```powershell
npm --workspace @inkspire/server test -- tests/storage.test.js
```

Expected: FAIL with `storage.getRecordForUser is not a function` or `listLibrary` not filtering by user.

- [ ] **Step 3: Create cookie identity helper**

Create `server/src/userIdentity.js`:

```js
const crypto = require("node:crypto");

const COOKIE_NAME = "inkspire_user";
const SAFE_USER_ID = /^[a-z0-9-]+$/i;

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

function newUserId() {
  return `user-${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
}

function isValidUserId(value) {
  return typeof value === "string" && SAFE_USER_ID.test(value);
}

function userIdentityMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const existing = cookies[COOKIE_NAME];
  const userId = isValidUserId(existing) ? existing : newUserId();
  req.userId = userId;
  if (existing !== userId) {
    res.cookie(COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production"
    });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  userIdentityMiddleware
};
```

- [ ] **Step 4: Implement owner-aware storage**

Modify `server/src/storage.js` with these concrete changes:

```js
function canAccessRecord(record, userId) {
  return !record.user_id || record.user_id === userId;
}

function notFound(id) {
  const error = new Error(`Record not found: ${id}`);
  error.status = 404;
  return error;
}
```

Change `summarizeRecord(record)` to include `user_id`:

```js
function summarizeRecord(record) {
  const fusionPath = record.fusion_path || record.fusionPath;
  const artworkPath = record.artwork_path || record.artworkPath;

  return {
    id: record.id,
    user_id: record.user_id || "",
    created_at: record.created_at || record.createdAt || null,
    type: record.type,
    title: record.title || "",
    thumbnail_path: record.thumbnail_path || record.thumbnailPath || fusionPath || artworkPath || null,
    has_fusion:
      typeof record.has_fusion === "boolean" ? record.has_fusion : Boolean(fusionPath),
    favorite: Boolean(record.favorite),
    status: record.status || "idle"
  };
}
```

Change `saveRecord` and add `getRecordForUser`:

```js
async function saveRecord(record, userId = "") {
  validateRecordId(record && record.id);
  await ensureStore();

  const nextRecord = { ...record };
  if (userId && !nextRecord.user_id) {
    nextRecord.user_id = userId;
  }

  const recordPath = path.join(recordsDir, nextRecord.id, "record.json");
  await writeJsonAtomic(recordPath, nextRecord);

  const summary = summarizeRecord(nextRecord);
  const library = (await readLibrary()).filter((entry) => entry.id !== nextRecord.id);
  library.push(summary);
  library.sort(compareNewestFirst);
  await writeJsonAtomic(libraryPath, library);
}

async function getRecordForUser(id, userId) {
  const record = await getRecord(id);
  if (!canAccessRecord(record, userId)) {
    throw notFound(id);
  }
  return record;
}
```

Change `listLibrary`:

```js
async function listLibrary(userId = "") {
  const library = await readLibrary();
  return library
    .map(summarizeRecord)
    .filter((record) => canAccessRecord(record, userId))
    .sort(compareNewestFirst);
}
```

Change `saveProductionOrder` to accept `userId`:

```js
async function saveProductionOrder(order, userId = "") {
  validateRecordId(order && order.id);
  await ensureStore();
  const nextOrder = userId && !order.user_id ? { ...order, user_id: userId } : order;
  await writeJsonAtomic(path.join(ordersDir, `${nextOrder.id}.json`), nextOrder);
}
```

Return the new functions:

```js
return {
  dataDir,
  ensureStore,
  saveRecord,
  getRecord,
  getRecordForUser,
  listLibrary,
  saveProductionOrder,
  getProductionOrder
};
```

- [ ] **Step 5: Add cookie assignment test**

Append this test to `server/tests/app.test.js`:

```js
test("API assigns an inkspire_user cookie when missing", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/library").expect(200);

    assert.match(
      response.headers["set-cookie"].join("; "),
      /inkspire_user=user-[a-z0-9-]+; Path=\/; HttpOnly; SameSite=Lax/i
    );
  });
});
```

- [ ] **Step 6: Install middleware in the app**

Modify `server/src/app.js` imports:

```js
const { userIdentityMiddleware } = require("./userIdentity");
```

Install the middleware immediately after JSON parsing:

```js
app.use(express.json({ limit: "1mb" }));
app.use(userIdentityMiddleware);
```

- [ ] **Step 7: Run backend tests for Task 1**

Run:

```powershell
npm --workspace @inkspire/server test -- tests/storage.test.js tests/app.test.js
```

Expected: PASS for the new storage and cookie tests. Some app tests that expect synchronous generation may still pass before Task 2; if they fail because generation responses become async later, defer those failures to Task 3.

- [ ] **Step 8: Commit Task 1**

Run:

```powershell
git add server/src/userIdentity.js server/src/storage.js server/src/app.js server/tests/storage.test.js server/tests/app.test.js
git commit -m "feat: add user scoped storage identity"
```

---

### Task 2: Async Job Queue With Six Global Workers And Two Per User

**Files:**
- Modify: `server/src/jobs.js`
- Test: `server/tests/jobs.test.js`

- [ ] **Step 1: Replace the locked-busy job test with async queue tests**

In `server/tests/jobs.test.js`, remove the test named `"concurrent job creation returns a locked busy result"` and add these tests:

```js
function deferredRunner() {
  const releases = [];
  const starts = [];
  const runner = async ({ outputPngPath, record }) => {
    starts.push(record.id);
    await new Promise((resolve) => releases.push(resolve));
    await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
    await fs.writeFile(outputPngPath, pngBuffer());
    return { pngPath: outputPngPath, diagnostics: { reason: "deferred" } };
  };
  return { runner, releases, starts };
}

test("artwork creation returns immediately while runner continues in background", async () => {
  await withTempStore(async (temp) => {
    const { runner, releases } = deferredRunner();
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner
    });

    const result = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: { painting_subject: "山水" }
    });

    assert.equal(result.job.status, "running");
    assert.equal(result.record.status, "running");
    assert.equal((await storage.getRecord(result.record.id)).status, "running");

    releases[0]();
    await manager.waitForIdle();

    assert.equal((await storage.getRecord(result.record.id)).status, "succeeded");
  });
});

test("per-user limit rejects the third active generation", async () => {
  await withTempStore(async (temp) => {
    const { runner } = deferredRunner();
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner
    });

    await manager.createArtwork({ userId: "user-a", type: "painting", answers: { painting_subject: "一" } });
    await manager.createArtwork({ userId: "user-a", type: "painting", answers: { painting_subject: "二" } });
    const third = await manager.createArtwork({ userId: "user-a", type: "painting", answers: { painting_subject: "三" } });

    assert.equal(third.limitReached, true);
    assert.equal(third.code, "user_generation_limit_reached");
    assert.equal(third.activeJobs.length, 2);
  });
});

test("global concurrency runs six jobs and queues the seventh", async () => {
  await withTempStore(async (temp) => {
    const { runner, starts, releases } = deferredRunner();
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner
    });

    const results = [];
    for (let index = 0; index < 7; index += 1) {
      results.push(await manager.createArtwork({
        userId: `user-${index}`,
        type: "painting",
        answers: { painting_subject: `第 ${index} 幅` }
      }));
    }

    assert.equal(results.filter((result) => result.job.status === "running").length, 6);
    assert.equal(results[6].job.status, "queued");
    assert.equal(starts.length, 6);

    releases[0]();
    await manager.waitForJobStart(results[6].job.id);

    assert.equal(manager.getJob(results[6].job.id).status, "running");
    assert.equal(starts.length, 7);
  });
});

test("completed jobs free per-user capacity", async () => {
  await withTempStore(async (temp) => {
    const { runner, releases } = deferredRunner();
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner
    });

    await manager.createArtwork({ userId: "user-a", type: "painting", answers: { painting_subject: "一" } });
    await manager.createArtwork({ userId: "user-a", type: "painting", answers: { painting_subject: "二" } });
    releases[0]();
    await manager.waitForRunningCount("user-a", 1);

    const third = await manager.createArtwork({ userId: "user-a", type: "painting", answers: { painting_subject: "三" } });

    assert.equal(Object.hasOwn(third, "limitReached"), false);
    assert.match(third.job.status, /queued|running/);
  });
});
```

- [ ] **Step 2: Run jobs tests to verify they fail**

Run:

```powershell
npm --workspace @inkspire/server test -- tests/jobs.test.js
```

Expected: FAIL with missing `waitForIdle`, `waitForJobStart`, `waitForRunningCount`, or current synchronous status expectations.

- [ ] **Step 3: Implement queue state and helpers in `server/src/jobs.js`**

Replace the single `locked` implementation with these constants and helpers near the top of `createJobManager`:

```js
const GLOBAL_RUNNING_LIMIT = 6;
const USER_ACTIVE_LIMIT = 2;
const ACTIVE_STATUSES = new Set(["queued", "running"]);

function isActive(job) {
  return ACTIVE_STATUSES.has(job.status);
}
```

Inside `createJobManager`:

```js
const jobs = new Map();
const queue = [];
let runningCount = 0;
const waiters = [];

function notifyWaiters() {
  for (const waiter of [...waiters]) {
    if (waiter.check()) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }
}

function activeJobsForUser(userId) {
  return [...jobs.values()]
    .filter((job) => job.user_id === userId && isActive(job))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function publicJob(job) {
  return { ...job };
}

function waitUntil(check) {
  if (check()) return Promise.resolve();
  return new Promise((resolve) => waiters.push({ check, resolve }));
}
```

- [ ] **Step 4: Implement async job creation**

Change `createJob`:

```js
function createJob({ stage, recordId = "", userId = "", type = "", title = "" }) {
  const job = {
    id: newId("job"),
    user_id: userId,
    recordId,
    stage,
    type,
    title,
    status: "queued",
    created_at: new Date().toISOString(),
    started_at: "",
    completed_at: "",
    error: "",
    diagnostics: null
  };
  jobs.set(job.id, job);
  return job;
}
```

Add scheduling:

```js
function enqueue(job, run) {
  queue.push({ job, run });
  drainQueue();
}

function drainQueue() {
  while (runningCount < GLOBAL_RUNNING_LIMIT && queue.length > 0) {
    const item = queue.shift();
    runningCount += 1;
    item.job.status = "running";
    item.job.started_at = new Date().toISOString();
    notifyWaiters();
    item.run().finally(() => {
      runningCount -= 1;
      item.job.completed_at = new Date().toISOString();
      notifyWaiters();
      drainQueue();
    });
  }
}
```

- [ ] **Step 5: Change `createArtwork` to return immediately**

Update the function signature and owner handling:

```js
async function createArtwork({
  userId = "",
  type,
  answers = {},
  conversationNotes = "",
  sourcePhotoPath = "",
  recommendedArtworkSize = null
}) {
  const activeJobs = activeJobsForUser(userId);
  if (activeJobs.length >= USER_ACTIVE_LIMIT) {
    return {
      limitReached: true,
      code: "user_generation_limit_reached",
      activeJobs: activeJobs.map(publicJob)
    };
  }

  const recordId = newId("record");
  const artworkPath = relativeRecordPath(recordId, "artwork.webp");
  const pngPath = path.join(storage.dataDir, "records", recordId, "artwork.png");
  const record = {
    id: recordId,
    user_id: userId,
    created_at: new Date().toISOString(),
    type,
    title: titleFromRequest(type, answers),
    answers,
    conversation_notes: conversationNotes,
    source_photo_path: sourcePhotoPath,
    recommended_artwork_size: recommendedArtworkSize,
    artwork_path: artworkPath,
    favorite: true,
    status: "queued",
    diagnostics: null
  };
  const job = createJob({
    stage: "artwork",
    recordId,
    userId,
    type,
    title: record.title
  });

  await storage.saveRecord(record, userId);
  enqueue(job, async () => {
    record.status = "running";
    await storage.saveRecord(record, userId);
    try {
      const prompt = config.prompts?.[type]
        ? buildArtworkPrompt({ type, answers, conversationNotes, config })
        : "";
      const result = await runRunnerWithRetry({
        stage: "artwork",
        prompt,
        record,
        outputPngPath: pngPath
      });
      await convertPngToWebp(result.pngPath, path.join(storage.dataDir, artworkPath), qualityFromConfig(config));
      record.status = "succeeded";
      record.diagnostics = result.diagnostics || null;
      job.status = "succeeded";
      job.diagnostics = record.diagnostics;
    } catch (error) {
      record.status = "failed";
      record.error = error.message;
      record.diagnostics = diagnosticsFromError(error);
      job.status = "failed";
      job.error = error.message;
      job.diagnostics = record.diagnostics;
    }
    await storage.saveRecord(record, userId);
  });

  return { job: publicJob(job), record };
}
```

- [ ] **Step 6: Change `createFusion` to return immediately**

Update `createFusion` to accept `userId` and use the same active limit:

```js
async function createFusion({ userId = "", recordId, sourcePhotoPath = "" }) {
  const activeJobs = activeJobsForUser(userId);
  if (activeJobs.length >= USER_ACTIVE_LIMIT) {
    return {
      limitReached: true,
      code: "user_generation_limit_reached",
      activeJobs: activeJobs.map(publicJob)
    };
  }

  const record = storage.getRecordForUser
    ? await storage.getRecordForUser(recordId, userId)
    : await storage.getRecord(recordId);
  const job = createJob({
    stage: "fusion_render",
    recordId,
    userId,
    type: record.type,
    title: record.title || titleFromRequest(record.type, record.answers || {})
  });
  const fusionPath = relativeRecordPath(recordId, "fusion.webp");
  const pngPath = path.join(storage.dataDir, "records", recordId, "fusion.png");

  record.status = "queued";
  if (sourcePhotoPath) record.source_photo_path = sourcePhotoPath;
  await storage.saveRecord(record, userId);

  enqueue(job, async () => {
    record.status = "running";
    await storage.saveRecord(record, userId);
    try {
      const prompt = config.prompts?.fusion ? buildFusionPrompt({ record, config }) : "";
      const result = await runRunnerWithRetry({
        stage: "fusion_render",
        prompt,
        record,
        outputPngPath: pngPath
      });
      await convertPngToWebp(result.pngPath, path.join(storage.dataDir, fusionPath), qualityFromConfig(config));
      record.fusion_path = fusionPath;
      record.has_fusion = true;
      record.fusion_status = "succeeded";
      record.status = "succeeded";
      record.diagnostics = result.diagnostics || null;
      delete record.error;
      job.status = "succeeded";
      job.diagnostics = record.diagnostics;
    } catch (error) {
      record.status = record.artwork_path ? "succeeded" : "failed";
      record.fusion_status = "failed";
      record.error = error.message;
      record.diagnostics = diagnosticsFromError(error);
      job.status = "failed";
      job.error = error.message;
      job.diagnostics = record.diagnostics;
    }
    await storage.saveRecord(record, userId);
  });

  return { job: publicJob(job), record };
}
```

- [ ] **Step 7: Add job read and wait helpers**

Return these helpers from `createJobManager`:

```js
function getJob(id, userId = "") {
  const job = jobs.get(id) || null;
  if (!job || (userId && job.user_id !== userId)) {
    return null;
  }
  return publicJob(job);
}

function listActiveJobs(userId) {
  return activeJobsForUser(userId).map(publicJob);
}

function waitForIdle() {
  return waitUntil(() => runningCount === 0 && queue.length === 0);
}

function waitForJobStart(id) {
  return waitUntil(() => jobs.get(id)?.status === "running");
}

function waitForRunningCount(userId, count) {
  return waitUntil(() =>
    [...jobs.values()].filter((job) => job.user_id === userId && job.status === "running").length === count
  );
}

return {
  createArtwork,
  createFusion,
  getJob,
  listActiveJobs,
  waitForIdle,
  waitForJobStart,
  waitForRunningCount
};
```

- [ ] **Step 8: Update existing jobs tests for async completion**

For tests that currently expect `succeeded` immediately after `createArtwork` or `createFusion`, insert `await manager.waitForIdle()` after the create call and then read stored records. Example replacement:

```js
const { job, record } = await manager.createArtwork({
  userId: "user-a",
  type: "painting",
  answers: { painting_subject: "山水" },
  conversationNotes: "云气"
});
await manager.waitForIdle();
const stored = await createStorage(temp).getRecord(record.id);

assert.equal(manager.getJob(job.id).status, "succeeded");
assert.equal(stored.status, "succeeded");
assert.equal(stored.artwork_path, `records/${record.id}/artwork.webp`);
```

- [ ] **Step 9: Run jobs tests**

Run:

```powershell
npm --workspace @inkspire/server test -- tests/jobs.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```powershell
git add server/src/jobs.js server/tests/jobs.test.js
git commit -m "feat: queue user scoped generation jobs"
```

---

### Task 3: Owner-Protected App Routes And Active Jobs API

**Files:**
- Modify: `server/src/app.js`
- Modify: `server/tests/app.test.js`

- [ ] **Step 1: Add app route tests**

Append these tests to `server/tests/app.test.js`:

```js
function cookieFrom(response) {
  return response.headers["set-cookie"].find((value) => value.startsWith("inkspire_user=")).split(";")[0];
}

test("library and record routes are scoped by inkspire_user cookie", async () => {
  await withTempApp(async ({ app }) => {
    const userASeed = await request(app).get("/api/library").expect(200);
    const userACookie = cookieFrom(userASeed);
    const userBSeed = await request(app).get("/api/library").expect(200);
    const userBCookie = cookieFrom(userBSeed);

    const created = await request(app)
      .post("/api/generations")
      .set("Cookie", userACookie)
      .send({ type: "painting", answers: { painting_subject: "山水" } })
      .expect(201);

    await waitForRecordStatus(app, userACookie, created.body.record.id, "succeeded");

    assert.equal((await request(app).get("/api/library").set("Cookie", userACookie).expect(200)).body.records.length, 1);
    assert.equal((await request(app).get("/api/library").set("Cookie", userBCookie).expect(200)).body.records.length, 0);
    await request(app).get(`/api/records/${created.body.record.id}`).set("Cookie", userBCookie).expect(404);
  });
});

test("POST /api/generations returns immediately with an active job", async () => {
  await withTempApp(async ({ app }) => {
    const seed = await request(app).get("/api/library").expect(200);
    const cookie = cookieFrom(seed);

    const response = await request(app)
      .post("/api/generations")
      .set("Cookie", cookie)
      .send({ type: "painting", answers: { painting_subject: "山水" } })
      .expect(201);

    assert.match(response.body.job.id, /^job-/);
    assert.equal(response.body.job.user_id.startsWith("user-"), true);
    assert.match(response.body.job.status, /queued|running/);
    assert.equal(response.body.record.status, response.body.job.status);
  });
});

test("GET /api/me/jobs returns active jobs for the current user", async () => {
  await withTempApp(async ({ app }) => {
    const seed = await request(app).get("/api/library").expect(200);
    const cookie = cookieFrom(seed);

    const created = await request(app)
      .post("/api/generations")
      .set("Cookie", cookie)
      .send({ type: "calligraphy", answers: { text: "明月松间照" } })
      .expect(201);

    const response = await request(app)
      .get("/api/me/jobs?status=active")
      .set("Cookie", cookie)
      .expect(200);

    assert.equal(response.body.jobs.length, 1);
    assert.equal(response.body.jobs[0].id, created.body.job.id);
    assert.equal(response.body.jobs[0].title, "明月松间照");
  });
});

test("third active generation for a user returns 429 with active jobs", async () => {
  let release;
  const runner = async ({ outputPngPath }) => {
    await new Promise((resolve) => { release = resolve; });
    await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
    await fs.writeFile(outputPngPath, pngBuffer());
    return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
  };

  await withTempApp(async ({ temp, config }) => {
    const app = createApp({ projectRoot: root, dataDir: temp, config, runner });
    const seed = await request(app).get("/api/library").expect(200);
    const cookie = cookieFrom(seed);

    await request(app).post("/api/generations").set("Cookie", cookie).send({ type: "painting", answers: { painting_subject: "一" } }).expect(201);
    await request(app).post("/api/generations").set("Cookie", cookie).send({ type: "painting", answers: { painting_subject: "二" } }).expect(201);
    const blocked = await request(app).post("/api/generations").set("Cookie", cookie).send({ type: "painting", answers: { painting_subject: "三" } }).expect(429);

    assert.equal(blocked.body.code, "user_generation_limit_reached");
    assert.equal(blocked.body.activeJobs.length, 2);
    release();
  });
});
```

Add this helper above those tests:

```js
async function waitForRecordStatus(app, cookie, recordId, status) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request(app).get(`/api/records/${recordId}`).set("Cookie", cookie);
    if (response.status === 200 && response.body.status === status) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`record ${recordId} did not reach ${status}`);
}
```

- [ ] **Step 2: Run app tests to verify they fail**

Run:

```powershell
npm --workspace @inkspire/server test -- tests/app.test.js
```

Expected: FAIL on missing `/api/me/jobs`, unscoped routes, or synchronous generation expectations.

- [ ] **Step 3: Update read routes to use `req.userId`**

In `server/src/app.js`, change:

```js
app.get("/api/library", asyncHandler(async (req, res) => {
  res.json({ records: await storage.listLibrary(req.userId) });
}));

app.get("/api/records/:id", asyncHandler(async (req, res) => {
  res.json(await storage.getRecordForUser(req.params.id, req.userId));
}));

app.get("/api/records/:id/images/:kind", asyncHandler(async (req, res) => {
  const record = await storage.getRecordForUser(req.params.id, req.userId);
  const field = req.params.kind === "fusion" ? "fusion_path"
    : req.params.kind === "source" || req.params.kind === "source-photo" ? "source_photo_path"
      : "artwork_path";
  if (!record[field]) {
    res.status(404).json({ error: "image not found" });
    return;
  }
  res.sendFile(path.join(dataDir, record[field]));
}));
```

- [ ] **Step 4: Update create routes to pass user id and return 429 on user limit**

Change `POST /api/generations`:

```js
app.post("/api/generations", asyncHandler(async (req, res) => {
  const result = await jobs.createArtwork({
    userId: req.userId,
    type: req.body.type,
    answers: req.body.answers || {},
    conversationNotes: req.body.conversationNotes || req.body.conversation_notes || "",
    sourcePhotoPath: req.body.source_photo_path || "",
    recommendedArtworkSize: req.body.recommended_artwork_size || null
  });
  if (result.limitReached) {
    res.status(429).json({
      code: result.code,
      activeJobs: result.activeJobs
    });
    return;
  }
  res.status(201).json(result);
}));
```

Change fusion and regenerate routes:

```js
app.post("/api/records/:id/fusion", asyncHandler(async (req, res) => {
  await storage.getRecordForUser(req.params.id, req.userId);
  const result = await jobs.createFusion({
    userId: req.userId,
    recordId: req.params.id,
    sourcePhotoPath: req.body.source_photo_path || req.body.sourcePhotoPath || ""
  });
  if (result.limitReached) {
    res.status(429).json({ code: result.code, activeJobs: result.activeJobs });
    return;
  }
  res.status(201).json(result);
}));

app.post("/api/records/:id/regenerate", asyncHandler(async (req, res) => {
  const current = await storage.getRecordForUser(req.params.id, req.userId);
  const result = await jobs.createArtwork({
    userId: req.userId,
    type: current.type,
    answers: req.body.answers || current.answers || {},
    conversationNotes: req.body.conversationNotes || current.conversation_notes || ""
  });
  if (result.limitReached) {
    res.status(429).json({ code: result.code, activeJobs: result.activeJobs });
    return;
  }
  res.status(201).json(result);
}));
```

- [ ] **Step 5: Add active jobs API and protect job lookup**

Add routes:

```js
app.get("/api/me/jobs", (req, res) => {
  const status = req.query.status || "";
  const jobsForUser = status === "active" ? jobs.listActiveJobs(req.userId) : jobs.listActiveJobs(req.userId);
  res.json({ jobs: jobsForUser });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.getJob(req.params.id, req.userId);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  res.json(job);
});
```

- [ ] **Step 6: Protect mutation and production routes**

Change these routes to read via `getRecordForUser`:

```js
app.post("/api/records/:id/favorite", asyncHandler(async (req, res) => {
  const record = await storage.getRecordForUser(req.params.id, req.userId);
  record.favorite = Boolean(req.body.favorite);
  await storage.saveRecord(record, req.userId);
  res.json(record);
}));

app.post("/api/records/:id/production-estimate", asyncHandler(async (req, res) => {
  await storage.getRecordForUser(req.params.id, req.userId);
  const expert = config.experts.find((entry) => entry.id === req.body.expertId) || config.experts[0];
  const size = productionSize(req.body.size);
  const multiplier = PRODUCTION_SIZE_MULTIPLIERS[size];
  const estimates = {};
  for (const service of expert.services || []) {
    estimates[service.id] = {
      amount: Math.round(service.priceEstimate.base * multiplier),
      currency: service.priceEstimate.currency,
      rule: service.priceEstimate.rule
    };
  }
  res.json({ expert_id: expert.id, size, estimates });
}));
```

In production order creation, read the record with `getRecordForUser` and save with owner:

```js
const record = await storage.getRecordForUser(req.params.id, req.userId);
```

```js
await storage.saveProductionOrder(order, req.userId);
```

- [ ] **Step 7: Update existing app tests for async generation**

In tests that currently expect `response.body.job.status === "succeeded"` immediately, replace with polling:

```js
assert.match(response.body.job.status, /queued|running/);
const finished = await waitForRecordStatus(app, cookieFrom(response), response.body.record.id, "succeeded");
assert.equal(finished.type, "painting");
```

For tests that create a record and then need an image or production action, store the cookie from the first response and set it on subsequent requests:

```js
const cookie = cookieFrom(created);
await waitForRecordStatus(app, cookie, created.body.record.id, "succeeded");
await request(app)
  .post(`/api/records/${created.body.record.id}/production-estimate`)
  .set("Cookie", cookie)
  .send({ expertId: "wu_jiayin" })
  .expect(200);
```

- [ ] **Step 8: Run app tests**

Run:

```powershell
npm --workspace @inkspire/server test -- tests/app.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

Run:

```powershell
git add server/src/app.js server/tests/app.test.js
git commit -m "feat: expose active user generation jobs"
```

---

### Task 4: Client API And Localization

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/i18n.ts`
- Test: `client/tests/i18n.test.ts`

- [ ] **Step 1: Add i18n tests**

Append to `client/tests/i18n.test.ts`:

```ts
it("localizes active generation job messages", () => {
  const zh = createTranslator("zh-Hans", fallbackConfig.i18n);
  const zhHant = createTranslator("zh-Hant", fallbackConfig.i18n);
  const en = createTranslator("en", fallbackConfig.i18n);

  expect(zh("studio.generatingPatience")).toBe("墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。");
  expect(zhHant("studio.generatingPatience")).toBe("墨色正在鋪開，可能需要花費 2-3 分鐘，請耐心等待。");
  expect(en("studio.generatingPatience")).toBe("Ink is unfolding. This may take 2-3 minutes. Please wait.");
  expect(zh("studio.generationLimit")).toBe("已有 2 个作品正在生成，请等待完成后再继续。");
  expect(en("studio.generationLimit")).toBe("Two artworks are already being generated. Please wait for one to finish before continuing.");
});
```

- [ ] **Step 2: Run i18n test to verify it fails**

Run:

```powershell
npm --workspace @inkspire/client test -- i18n.test.ts
```

Expected: FAIL because the new keys are missing.

- [ ] **Step 3: Add API types and functions**

In `client/src/api.ts`, add:

```ts
export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface GenerationJob {
  id: string;
  user_id?: string;
  recordId: string;
  stage: "artwork" | "fusion_render";
  status: GenerationJobStatus;
  type?: WorkType;
  title?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface ActiveJobsPayload {
  jobs: GenerationJob[];
}

export class GenerationLimitError extends Error {
  activeJobs: GenerationJob[];

  constructor(activeJobs: GenerationJob[]) {
    super("user_generation_limit_reached");
    this.name = "GenerationLimitError";
    this.activeJobs = activeJobs;
  }
}
```

Change `requestJson` to expose structured error payloads:

```ts
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 429 && payload?.code === "user_generation_limit_reached") {
      throw new GenerationLimitError(payload.activeJobs ?? []);
    }
    throw new Error(`Request failed: ${response.status}`);
  }
  return payload as T;
}
```

Add:

```ts
export async function loadActiveJobs(): Promise<GenerationJob[]> {
  try {
    const payload = await requestJson<ActiveJobsPayload>("/api/me/jobs?status=active");
    return payload.jobs;
  } catch {
    return [];
  }
}

export async function getJob(jobId: string): Promise<GenerationJob> {
  return requestJson(`/api/jobs/${jobId}`);
}
```

- [ ] **Step 4: Update `createGeneration` and `createFusion` return types**

Change `createGeneration` return type:

```ts
export async function createGeneration(payload: {
  type: WorkType;
  answers: Answers;
  conversationNotes: string;
  source_photo_path?: string;
  recommended_artwork_size?: ArtworkSize | null;
}): Promise<{ job?: GenerationJob; record?: GenerationRecord } & GenerationRecord> {
```

Change `createFusion` body to return active job payloads without treating them as failed:

```ts
export async function createFusion(recordId: string, sourcePhotoPath = ""): Promise<{ job?: GenerationJob; record?: GenerationRecord } & GenerationRecord> {
  const payload = await requestJson<{ job?: GenerationJob; record?: GenerationRecord } & GenerationRecord>(`/api/records/${recordId}/fusion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_photo_path: sourcePhotoPath })
  });
  if (payload.job?.status === "failed") {
    throw new Error(payload.job.error || "Fusion generation failed");
  }
  return payload.record ? payload : { record: payload, ...payload };
}
```

- [ ] **Step 5: Add localization keys**

In each locale block in `client/src/i18n.ts`, add these keys under `studio`:

```ts
generatingPatience: "墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。",
queuedGeneration: "正在排队，墨色即将铺开。",
generationLimit: "已有 2 个作品正在生成，请等待完成后再继续。",
activeJobsTitle: "正在生成",
activeJobFallback: "未命名作品"
```

Traditional Chinese:

```ts
generatingPatience: "墨色正在鋪開，可能需要花費 2-3 分鐘，請耐心等待。",
queuedGeneration: "正在排隊，墨色即將鋪開。",
generationLimit: "已有 2 個作品正在生成，請等待完成後再繼續。",
activeJobsTitle: "正在生成",
activeJobFallback: "未命名作品"
```

English:

```ts
generatingPatience: "Ink is unfolding. This may take 2-3 minutes. Please wait.",
queuedGeneration: "Queued. The ink will begin unfolding soon.",
generationLimit: "Two artworks are already being generated. Please wait for one to finish before continuing.",
activeJobsTitle: "Generating",
activeJobFallback: "Untitled artwork"
```

- [ ] **Step 6: Run client i18n tests**

Run:

```powershell
npm --workspace @inkspire/client test -- i18n.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add client/src/api.ts client/src/i18n.ts client/tests/i18n.test.ts
git commit -m "feat: add active generation client api"
```

---

### Task 5: Frontend Active Job Recovery And UI

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Studio.tsx`
- Modify: `client/src/styles.css`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: Add frontend tests for active job state**

In `client/tests/app.test.tsx`, add mutable active jobs state in the `describe` block:

```ts
let activeJobs: Array<{
  id: string;
  recordId: string;
  stage: "artwork" | "fusion_render";
  status: "queued" | "running" | "succeeded" | "failed";
  type: "painting" | "calligraphy";
  title: string;
}> = [];
let recordStatus = "succeeded";
```

Reset it in `beforeEach`:

```ts
activeJobs = [];
recordStatus = "succeeded";
```

Add fetch handlers before `/api/generations`:

```ts
if (url.endsWith("/api/me/jobs?status=active")) {
  return Response.json({ jobs: activeJobs });
}
if (url.endsWith("/api/jobs/job-1")) {
  return Response.json(activeJobs.find((job) => job.id === "job-1") ?? { id: "job-1", recordId: "record-1", status: "succeeded", stage: "artwork" });
}
```

Change the `/api/records/record-1` handler so `status` uses `recordStatus`:

```ts
status: recordStatus,
```

Update `/api/generations` success handler to return a job:

```ts
activeJobs = [{
  id: "job-1",
  recordId: "record-1",
  stage: "artwork",
  status: "running",
  type: "painting",
  title: "山水"
}];
recordStatus = "running";
return Response.json({
  job: activeJobs[0],
  record: {
    id: "record-1",
    type: "painting",
    title: "山水",
    artwork_path: "records/record-1/artwork.webp",
    fusion_path: "",
    source_photo_path: "records/upload-1/source-photo.webp",
    status: "running"
  }
}, { status: 201 });
```

Append these tests:

```ts
it("shows the 2-3 minute patience message while generation is active", async () => {
  const user = userEvent.setup();
  render(<App />);

  await completePaintingWithoutPhoto(user);
  await user.click(screen.getByRole("button", { name: "生成" }));

  expect(await screen.findByText("墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。")).toBeInTheDocument();
  expect(screen.getByText("山水")).toBeInTheDocument();
});

it("keeps active generation visible after switching away and back", async () => {
  const user = userEvent.setup();
  activeJobs = [{ id: "job-1", recordId: "record-1", stage: "artwork", status: "running", type: "painting", title: "山水" }];
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "藏卷" }));
  await user.click(screen.getByRole("button", { name: "画案" }));

  expect(await screen.findByText("墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。")).toBeInTheDocument();
  expect(screen.getByText("山水")).toBeInTheDocument();
});

it("restores active generation jobs after remount", async () => {
  activeJobs = [{ id: "job-1", recordId: "record-1", stage: "artwork", status: "running", type: "painting", title: "山水" }];
  const view = render(<App />);

  expect(await screen.findByText("墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。")).toBeInTheDocument();

  view.unmount();
  render(<App />);

  expect(await screen.findByText("山水")).toBeInTheDocument();
});

it("renders two active generation jobs and disables new generation", async () => {
  const user = userEvent.setup();
  activeJobs = [
    { id: "job-1", recordId: "record-1", stage: "artwork", status: "running", type: "painting", title: "山水" },
    { id: "job-2", recordId: "record-2", stage: "artwork", status: "queued", type: "calligraphy", title: "明月松间照" }
  ];
  render(<App />);

  await completePaintingWithoutPhoto(user);

  expect(await screen.findByText("已有 2 个作品正在生成，请等待完成后再继续。")).toBeInTheDocument();
  expect(screen.getByText("山水")).toBeInTheDocument();
  expect(screen.getByText("明月松间照")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
});

it("updates the result when a running job completes", async () => {
  vi.useFakeTimers();
  activeJobs = [{ id: "job-1", recordId: "record-1", stage: "artwork", status: "running", type: "painting", title: "山水" }];
  render(<App />);

  expect(await screen.findByText("山水")).toBeInTheDocument();
  activeJobs = [];
  recordStatus = "succeeded";
  await vi.advanceTimersByTimeAsync(2000);

  expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run frontend app tests to verify they fail**

Run:

```powershell
npm --workspace @inkspire/client test -- app.test.tsx
```

Expected: FAIL because active jobs API is not consumed and status UI is missing.

- [ ] **Step 3: Add active job state to `App.tsx`**

Update imports:

```ts
import {
  fallbackConfig,
  createFusion,
  getRecord,
  loadActiveJobs,
  loadLibrary,
  loadPublicConfig,
  uploadPhoto,
  updateFavorite,
  type GenerationJob,
  type GenerationRecord,
  type LibraryRecord,
  type PublicConfig
} from "./api";
```

Add state:

```ts
const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
```

Add helpers:

```ts
const refreshActiveJobs = async () => {
  const jobs = await loadActiveJobs();
  setActiveJobs(jobs);
  return jobs;
};

const refreshFinishedActiveJobs = async (previousJobs: GenerationJob[], nextJobs: GenerationJob[]) => {
  const nextIds = new Set(nextJobs.map((job) => job.id));
  const finished = previousJobs.filter((job) => !nextIds.has(job.id));
  for (const job of finished) {
    if (!job.recordId) continue;
    try {
      onResult(await getRecord(job.recordId));
    } catch {
      setResultActionError(t("errors.generic"));
    }
  }
};
```

Add initial load:

```ts
useEffect(() => {
  refreshActiveJobs();
}, []);
```

Add polling:

```ts
useEffect(() => {
  if (activeJobs.length === 0) {
    return;
  }
  const timer = window.setInterval(async () => {
    const previous = activeJobs;
    const next = await refreshActiveJobs();
    await refreshFinishedActiveJobs(previous, next);
  }, 2000);
  return () => window.clearInterval(timer);
}, [activeJobs, t]);
```

Add tab refresh:

```ts
useEffect(() => {
  if (activeTab === "studio") {
    refreshActiveJobs();
  }
}, [activeTab]);
```

- [ ] **Step 4: Pass active job props to `Studio`**

In `App.tsx`, pass:

```tsx
<Studio
  config={config}
  locale={locale}
  t={t}
  list={list}
  onResult={onResult}
  onJobsChanged={setActiveJobs}
  onRefreshActiveJobs={refreshActiveJobs}
  activeJobs={activeJobs}
  resultSlot={resultSlot}
  notesFocusRequest={notesFocusRequest}
  hasResult={Boolean(currentRecord)}
  onStartOver={clearCurrentRecord}
/>
```

- [ ] **Step 5: Update `Studio` props and generation behavior**

In `client/src/components/Studio.tsx`, update imports:

```ts
import {
  createFusion,
  createGeneration,
  uploadPhoto,
  GenerationLimitError,
  type GenerationJob,
  type GenerationRecord,
  type PublicConfig
} from "../api";
```

Add props:

```ts
activeJobs?: GenerationJob[];
onJobsChanged?: (jobs: GenerationJob[]) => void;
onRefreshActiveJobs?: () => Promise<GenerationJob[]>;
```

In parameters:

```ts
activeJobs = [],
onJobsChanged,
onRefreshActiveJobs,
```

Add derived flags:

```ts
const activeJobCount = activeJobs.length;
const generationLimitReached = activeJobCount >= 2;
const hasActiveJobs = activeJobCount > 0;
```

Change generate start guard:

```ts
if (generationLimitReached) {
  setError(t("studio.generationLimit"));
  return;
}
```

After `createGeneration`:

```ts
const payload = await createGeneration({
  type,
  answers,
  conversationNotes: note || conversationNotes,
  source_photo_path: sourcePhotoPath,
  recommended_artwork_size: recommendedArtworkSize ?? null
});
if (payload.job && payload.job.status !== "succeeded" && payload.job.status !== "failed") {
  onJobsChanged?.([payload.job, ...activeJobs].slice(0, 2));
  await onRefreshActiveJobs?.();
  return;
}
const record = payload.record ?? payload;
onResult(record);
```

In `catch`, handle limit:

```ts
} catch (error) {
  if (error instanceof GenerationLimitError) {
    onJobsChanged?.(error.activeJobs);
    setError(t("studio.generationLimit"));
  } else {
    setError(t("errors.generic"));
  }
}
```

- [ ] **Step 6: Render active jobs in `Studio`**

Add helper above `return`:

```ts
const activeJobStatus = (job: GenerationJob) =>
  job.status === "queued" ? t("studio.queuedGeneration") : t("studio.generatingPatience");
```

Inside the conversation panel before the textarea:

```tsx
{hasActiveJobs ? (
  <div className="active-generation-panel" role="status">
    <strong>{t("studio.activeJobsTitle")}</strong>
    <p>{generationLimitReached ? t("studio.generationLimit") : t("studio.generatingPatience")}</p>
    <ul>
      {activeJobs.map((job) => (
        <li key={job.id}>
          <span>{job.title || t("studio.activeJobFallback")}</span>
          <small>{activeJobStatus(job)}</small>
        </li>
      ))}
    </ul>
  </div>
) : null}
```

Change button disabled:

```tsx
disabled={!complete || isGenerating || generationLimitReached}
```

- [ ] **Step 7: Add active job styles**

Append to `client/src/styles.css`:

```css
.active-generation-panel {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(38, 61, 53, 0.18);
  border-radius: 8px;
  background: rgba(255, 252, 243, 0.82);
}

.active-generation-panel strong {
  font-size: 0.95rem;
}

.active-generation-panel p {
  margin: 0;
  color: #4f5f58;
  line-height: 1.45;
}

.active-generation-panel ul {
  display: grid;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.active-generation-panel li {
  display: grid;
  gap: 2px;
}

.active-generation-panel span {
  font-weight: 700;
}

.active-generation-panel small {
  color: #68776f;
}
```

- [ ] **Step 8: Run frontend app tests**

Run:

```powershell
npm --workspace @inkspire/client test -- app.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

Run:

```powershell
git add client/src/App.tsx client/src/components/Studio.tsx client/src/styles.css client/tests/app.test.tsx
git commit -m "feat: restore active generation state"
```

---

### Task 6: Full Verification And E2E Alignment

**Files:**
- Modify if needed: `e2e/inkspire.spec.ts`
- Verify: server, client, and e2e test suites

- [ ] **Step 1: Run full server tests**

Run:

```powershell
npm --workspace @inkspire/server test
```

Expected: PASS.

- [ ] **Step 2: Run full client tests**

Run:

```powershell
npm --workspace @inkspire/client test
```

Expected: PASS.

- [ ] **Step 3: Run full package tests**

Run:

```powershell
npm test
```

Expected: PASS for workspace test scripts.

- [ ] **Step 4: Run Playwright e2e**

Run:

```powershell
npm run e2e
```

Expected: PASS. If e2e expects an immediate generated image after clicking generate, update it to wait for the active generation status first and then for the result image.

Use this replacement assertion in `e2e/inkspire.spec.ts`:

```ts
await expect(page.getByText("墨色正在铺开，可能需要花费 2-3 分钟，请耐心等待。")).toBeVisible();
await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
```

- [ ] **Step 5: Inspect status and final diff**

Run:

```powershell
git status --short
git diff --stat HEAD
```

Expected: only intentional source, test, and e2e files remain changed after the task commits. Existing unrelated worktree files from before this plan should remain untouched unless a task explicitly modified them.

- [ ] **Step 6: Commit e2e alignment if changed**

Run only if `e2e/inkspire.spec.ts` changed:

```powershell
git add e2e/inkspire.spec.ts
git commit -m "test: align e2e with async generation jobs"
```

---

## Self-Review

- Spec coverage:
  - Cookie browser users: Task 1.
  - Record/job/order ownership and route protection: Tasks 1 and 3.
  - Six global workers and two active jobs per user: Task 2.
  - 429 limit response with active jobs: Tasks 2, 3, and 5.
  - `/api/me/jobs?status=active` and protected `/api/jobs/:id`: Task 3.
  - Frontend recovery on startup, tab switch, and remount: Task 5.
  - 2-3 minute patience copy and two-job display: Tasks 4 and 5.
  - Verification: Task 6.
- Deferred-work scan:
  - No deferred work markers or vague task references.
- Type consistency:
  - Server job fields use `recordId`, `user_id`, `stage`, and `status`.
  - Client `GenerationJob` matches server job fields.
  - Active job API consistently returns `{ jobs }`.
