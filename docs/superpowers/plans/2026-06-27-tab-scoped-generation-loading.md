# Tab-Scoped Generation Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared generation loading experience where each tab owns one active job, while loading copy and images are selected by operation type (`create` or `adjust`).

**Architecture:** The server becomes the source of truth for tab-scoped active job limits via `origin_tab` and `operation`. The client stores lightweight per-tab sessions in `App`, renders a shared `GeneratingView`, and routes completion back to the tab that started the job. Loading copy/image sets are operation-scoped, not tab-scoped.

**Tech Stack:** React 18 + TypeScript + Vite, Express CommonJS server, Node test runner, Vitest/jsdom, Playwright E2E.

> Project rule override: do not create git commits or worktrees. Ignore any generic skill instruction that asks for commits.

---

## File Structure

- Modify `server/src/jobs.js`: add `origin_tab` and `operation` fields to jobs, enforce one active job per user per `origin_tab`, return tab-specific limit metadata.
- Modify `server/src/app.js`: read `origin_tab` and `operation` from generation/fusion requests and pass them into `jobs`.
- Modify `server/tests/jobs.test.js`: replace old user-wide two-job limit expectations with tab-scoped limit tests.
- Modify `server/tests/app.test.js`: assert API payloads preserve `origin_tab`, `operation`, and tab-specific limit responses.
- Modify `client/src/api.ts`: add `OriginTab`, `GenerationOperation`, job/session fields, and pass source metadata in generation/fusion requests.
- Create `client/src/generationSession.ts`: per-tab session persistence helpers, operation phase calculation, deterministic image selection.
- Create `client/src/components/GeneratingView.tsx`: shared loading/failure view driven by `operation`, elapsed time, and selected image.
- Modify `client/src/App.tsx`: own per-tab sessions, replace active tab content with `GeneratingView`, route completions to `from=studio` or `from=library`, add result-back confirmation.
- Modify `client/src/components/Studio.tsx`: remove active job status UI dependency, submit `origin_tab: "studio"` and `operation: "create"`.
- Modify call sites in `client/src/App.tsx`: ensure adjust submits use current source tab and `operation: "adjust"`; `ResultView` should remain a presentational component unless implementation proves otherwise.
- Modify `client/src/i18n.ts`: add `generationLoading` copy for `create` and `adjust`, failure, retry, tab-busy, and back confirmation.
- Modify `client/src/styles.css`: add layout styles for `GeneratingView`.
- Add generated image assets under `client/public/loading/`: `create-*` and `adjust-*` images, 4 per stage.
- Modify `client/tests/app.test.tsx`: cover create/adjust loading, tab ownership, completion routing, refresh restore, failure, and back confirmation.
- Modify `e2e/inkspire.spec.ts`: add mobile paths for studio create loading, studio adjust loading, and library adjust loading.

---

### Task 1: Server Job Metadata And Tab-Scoped Limits

**Files:**
- Modify: `server/src/jobs.js`
- Test: `server/tests/jobs.test.js`

- [ ] **Step 1: Write failing server tests for tab-scoped limits**

Add tests near the existing active job limit tests in `server/tests/jobs.test.js`:

```js
test("limits active jobs independently per origin tab", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-jobs-"));
  const releases = new Map();
  const manager = createJobManager({
    config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
    storage: createStorage(temp),
    runner: async ({ outputPngPath, record }) => {
      await new Promise((resolve) => releases.set(record.id, resolve));
      await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
      await fs.writeFile(outputPngPath, pngBuffer());
      return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
    }
  });

  const studio = await manager.createArtwork({
    userId: "user-a",
    type: "painting",
    answers: {},
    originTab: "studio",
    operation: "create"
  });
  const studioRejected = await manager.createArtwork({
    userId: "user-a",
    type: "painting",
    answers: {},
    originTab: "studio",
    operation: "create"
  });
  const library = await manager.createArtwork({
    userId: "user-a",
    type: "painting",
    answers: {},
    originTab: "library",
    operation: "adjust"
  });
  const libraryRejected = await manager.createArtwork({
    userId: "user-a",
    type: "painting",
    answers: {},
    originTab: "library",
    operation: "adjust"
  });

  assert.ok(["queued", "running"].includes(studio.job.status));
  assert.equal(studio.job.origin_tab, "studio");
  assert.equal(studio.job.operation, "create");
  assert.equal(studioRejected.limitReached, true);
  assert.equal(studioRejected.code, "tab_generation_limit_reached");
  assert.equal(studioRejected.origin_tab, "studio");
  assert.equal(studioRejected.activeJobs.length, 1);

  assert.ok(["queued", "running"].includes(library.job.status));
  assert.equal(library.job.origin_tab, "library");
  assert.equal(library.job.operation, "adjust");
  assert.equal(libraryRejected.limitReached, true);
  assert.equal(libraryRejected.code, "tab_generation_limit_reached");
  assert.equal(libraryRejected.origin_tab, "library");
  assert.equal(libraryRejected.activeJobs.length, 1);

  await waitUntil(() => releases.size === 2);
  for (const release of releases.values()) release();
  await manager.waitForIdle();
});
```

- [ ] **Step 2: Run server test and confirm failure**

Run: `npm test --workspace server -- --test-name-pattern "limits active jobs independently per origin tab"`

Expected: FAIL because `origin_tab`, `operation`, and tab-specific limit response do not exist.

- [ ] **Step 3: Implement metadata normalization and tab slot reservation**

In `server/src/jobs.js`, add helpers near `normalizeUserId`:

```js
const VALID_ORIGIN_TABS = new Set(["studio", "library", "experts"]);
const VALID_OPERATIONS = new Set(["create", "adjust"]);

function normalizeOriginTab(originTab) {
  return VALID_ORIGIN_TABS.has(originTab) ? originTab : "studio";
}

function normalizeOperation(operation) {
  return VALID_OPERATIONS.has(operation) ? operation : "create";
}

function tabKey(userId, originTab) {
  return `${normalizeUserId(userId)}:${normalizeOriginTab(originTab)}`;
}
```

Replace the existing active count helpers with tab-aware versions:

```js
const activeCounts = new Map();

function countActiveJobs(ownerId, originTab) {
  return activeCounts.get(tabKey(ownerId, originTab)) || 0;
}

function listActiveJobs(ownerId, originTab) {
  return Array.from(jobs.values())
    .filter((job) => {
      const sameOwner = ownerId ? job.user_id === ownerId : !job.user_id;
      const sameTab = normalizeOriginTab(job.origin_tab) === normalizeOriginTab(originTab);
      return sameOwner && sameTab && (job.status === "queued" || job.status === "running");
    })
    .map(cloneJob);
}

function reserveActiveSlot(userId, originTab) {
  const ownerId = normalizeUserId(userId);
  const normalizedTab = normalizeOriginTab(originTab);
  const activeJobs = countActiveJobs(ownerId, normalizedTab);
  if (activeJobs >= 1) {
    return {
      limitReached: true,
      origin_tab: normalizedTab,
      activeJobs: listActiveJobs(ownerId, normalizedTab)
    };
  }
  activeCounts.set(tabKey(ownerId, normalizedTab), activeJobs + 1);
  return { limitReached: false, ownerId, origin_tab: normalizedTab };
}

function releaseActiveSlot(userId, originTab) {
  const key = tabKey(userId, originTab);
  const next = (activeCounts.get(key) || 0) - 1;
  if (next > 0) activeCounts.set(key, next);
  else activeCounts.delete(key);
}
```

Update `createArtwork` signature:

```js
async function createArtwork({
  userId = "",
  type,
  answers = {},
  conversationNotes = "",
  sourcePhotoPath = "",
  recommendedArtworkSize = null,
  originTab = "studio",
  operation = "create"
}) {
  const ownerId = normalizeUserId(userId);
  const normalizedOriginTab = normalizeOriginTab(originTab);
  const normalizedOperation = normalizeOperation(operation);
  // use normalizedOriginTab / normalizedOperation in reservation, record, and job
}
```

When reserving and creating jobs, include:

```js
const reservation = reserveActiveSlot(ownerId, normalizedOriginTab);
if (reservation.limitReached) {
  return {
    limitReached: true,
    code: "tab_generation_limit_reached",
    origin_tab: reservation.origin_tab,
    activeJobs: reservation.activeJobs
  };
}

const job = {
  id: newId("job"),
  user_id: ownerId,
  recordId,
  stage: "artwork",
  type,
  title: record.title,
  status: "queued",
  origin_tab: normalizedOriginTab,
  operation: normalizedOperation,
  created_at: createdAt,
  started_at: null,
  completed_at: null,
  error: "",
  diagnostics: null
};
```

When queueing tasks, carry metadata:

```js
queuedJobs.push({
  userId: ownerId,
  originTab: normalizedOriginTab,
  operation: normalizedOperation,
  stage: "artwork",
  type,
  title: record.title,
  answers,
  conversationNotes,
  sourcePhotoPath,
  record,
  job,
  outputPngPath: pngPath,
  outputWebpPath: artworkPath
});
```

In queue completion/failure cleanup, call:

```js
releaseActiveSlot(task.userId, task.originTab);
```

- [ ] **Step 4: Run server test and confirm pass**

Run: `npm test --workspace server -- --test-name-pattern "limits active jobs independently per origin tab"`

Expected: PASS.

---

### Task 2: Server Route Contract

**Files:**
- Modify: `server/src/app.js`
- Modify: `server/tests/app.test.js`

- [ ] **Step 1: Add failing API route assertions**

In `server/tests/app.test.js`, add assertions near generation route tests:

```js
test("generation route preserves origin tab and operation metadata", async () => {
  const app = createApp({
    jobs: {
      createArtwork: async (payload) => ({
        job: {
          id: "job-1",
          recordId: "record-1",
          stage: "artwork",
          title: "山水",
          status: "queued",
          origin_tab: payload.originTab,
          operation: payload.operation
        }
      })
    }
  });

  const response = await request(app)
    .post("/api/generations")
    .send({
      type: "painting",
      answers: {},
      origin_tab: "library",
      operation: "adjust"
    })
    .expect(201);

  assert.equal(response.body.job.origin_tab, "library");
  assert.equal(response.body.job.operation, "adjust");
});
```

- [ ] **Step 2: Run API test and confirm failure**

Run: `npm test --workspace server -- --test-name-pattern "generation route preserves origin tab"`

Expected: FAIL because route does not pass `origin_tab` / `operation`.

- [ ] **Step 3: Pass route metadata into job manager**

In `server/src/app.js`, update `/api/generations`:

```js
const result = await jobs.createArtwork({
  userId: req.userId,
  type: req.body.type,
  answers: req.body.answers || {},
  conversationNotes: req.body.conversationNotes || req.body.conversation_notes || "",
  sourcePhotoPath,
  recommendedArtworkSize: req.body.recommended_artwork_size || null,
  originTab: req.body.origin_tab || req.body.originTab || "studio",
  operation: req.body.operation || "create"
});
```

Update `/api/records/:id/regenerate` to treat regeneration/adjustment as adjust and accept tab:

```js
const result = await jobs.createArtwork({
  userId: req.userId,
  type: current.type,
  answers: req.body.answers || current.answers || {},
  conversationNotes: req.body.conversationNotes || current.conversation_notes || "",
  originTab: req.body.origin_tab || req.body.originTab || "studio",
  operation: req.body.operation || "adjust"
});
```

Update `/api/records/:id/fusion`:

```js
const result = await jobs.createFusion({
  userId: req.userId,
  recordId: req.params.id,
  sourcePhotoPath,
  originTab: req.body.origin_tab || req.body.originTab || "studio",
  operation: req.body.operation || "create"
});
```

- [ ] **Step 4: Run route tests**

Run: `npm test --workspace server`

Expected: PASS after updating any old two-job-limit assertions to tab-scoped expectations.

---

### Task 3: Client API Types And Session Helpers

**Files:**
- Modify: `client/src/api.ts`
- Create: `client/src/generationSession.ts`
- Test: `client/tests/generationSession.test.ts`

- [ ] **Step 1: Add helper tests**

Create `client/tests/generationSession.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  generationPhase,
  loadingImageIndex,
  readGenerationSessions,
  writeGenerationSessions,
  type GenerationSessionMap
} from "../src/generationSession";

describe("generation session helpers", () => {
  it("selects create and adjust phases by elapsed seconds", () => {
    expect(generationPhase("create", 0).labelKey).toBe("thinking");
    expect(generationPhase("create", 6).labelKey).toBe("paper");
    expect(generationPhase("create", 12).labelKey).toBe("painting");
    expect(generationPhase("adjust", 0).labelKey).toBe("understanding");
    expect(generationPhase("adjust", 6).labelKey).toBe("direction");
    expect(generationPhase("adjust", 12).labelKey).toBe("repainting");
  });

  it("keeps random loading image selection stable per job and phase", () => {
    const first = loadingImageIndex("job-1", "create", "painting", 5);
    const second = loadingImageIndex("job-1", "create", "painting", 5);
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(5);
  });

  it("round trips per-tab sessions in localStorage", () => {
    const sessions: GenerationSessionMap = {
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-a",
        resultRecordId: "record-a",
        startedAt: 1000,
        status: "running",
        payload: { type: "painting", answers: {}, conversationNotes: "" }
      }
    };
    writeGenerationSessions(sessions);
    expect(readGenerationSessions()).toEqual(sessions);
  });
});
```

- [ ] **Step 2: Run helper tests and confirm failure**

Run: `npm test --workspace client -- generationSession.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Extend client API types**

In `client/src/api.ts`, add:

```ts
export type OriginTab = "studio" | "library" | "experts";
export type GenerationOperation = "create" | "adjust";
```

Extend `GenerationJob`:

```ts
origin_tab?: OriginTab;
operation?: GenerationOperation;
```

Extend `createGeneration` payload:

```ts
origin_tab?: OriginTab;
operation?: GenerationOperation;
```

Include fields in request body:

```ts
origin_tab: payload.origin_tab ?? "studio",
operation: payload.operation ?? "create"
```

Update `createFusion` signature:

```ts
export async function createFusion(
  recordId: string,
  sourcePhotoPath = "",
  origin_tab: OriginTab = "studio",
  operation: GenerationOperation = "create"
): Promise<GenerationStartResult> {
  return requestJson(`/api/records/${recordId}/fusion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_photo_path: sourcePhotoPath, origin_tab, operation })
  });
}
```

- [ ] **Step 4: Implement `generationSession.ts`**

Create `client/src/generationSession.ts`:

```ts
import type { Answers } from "./domain";
import type { GenerationOperation, OriginTab, GenerationRecord, WorkType } from "./api";

const STORAGE_KEY = "inkspire.generationSessions.v1";

export type GenerationSessionStatus = "running" | "succeeded" | "failed";
export type LoadingPhaseKey =
  | "thinking" | "paper" | "painting" | "details"
  | "understanding" | "direction" | "repainting" | "adjustDetails";

export interface GenerationSessionPayload {
  type?: WorkType;
  answers?: Answers;
  conversationNotes?: string;
  source_photo_path?: string;
  recommended_artwork_size?: GenerationRecord["recommended_artwork_size"] | null;
}

export interface GenerationSession {
  originTab: OriginTab;
  operation: GenerationOperation;
  jobId: string;
  sourceRecordId?: string;
  resultRecordId?: string;
  startedAt: number;
  status: GenerationSessionStatus;
  payload: GenerationSessionPayload;
  error?: string;
}

export type GenerationSessionMap = Partial<Record<OriginTab, GenerationSession>>;

export function readGenerationSessions(): GenerationSessionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed as GenerationSessionMap : {};
  } catch {
    return {};
  }
}

export function writeGenerationSessions(sessions: GenerationSessionMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function generationPhase(operation: GenerationOperation, elapsedSeconds: number): { labelKey: LoadingPhaseKey; imageStage: string } {
  if (operation === "adjust") {
    if (elapsedSeconds < 5) return { labelKey: "understanding", imageStage: "understanding" };
    if (elapsedSeconds < 8) return { labelKey: "direction", imageStage: "direction" };
    if (elapsedSeconds < 20) return { labelKey: "repainting", imageStage: "repainting" };
    return { labelKey: "adjustDetails", imageStage: "adjust-details" };
  }
  if (elapsedSeconds < 5) return { labelKey: "thinking", imageStage: "thinking" };
  if (elapsedSeconds < 8) return { labelKey: "paper", imageStage: "paper" };
  if (elapsedSeconds < 20) return { labelKey: "painting", imageStage: "painting" };
  return { labelKey: "details", imageStage: "details" };
}

export function loadingImageIndex(seed: string, operation: GenerationOperation, stage: string, count: number): number {
  const text = `${seed}:${operation}:${stage}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return count <= 0 ? 0 : hash % count;
}
```

- [ ] **Step 5: Run helper tests**

Run: `npm test --workspace client -- generationSession.test.ts`

Expected: PASS.

---

### Task 4: Shared `GeneratingView`

**Files:**
- Create: `client/src/components/GeneratingView.tsx`
- Modify: `client/src/i18n.ts`
- Modify: `client/src/styles.css`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: Add i18n copy**

In each locale inside `client/src/i18n.ts`, add `generationLoading`:

```ts
generationLoading: {
  estimate: "通常约 30 秒，请稍候。",
  retry: "重新尝试",
  failedTitle: "生成没有完成",
  failedHint: "可以重新尝试，或先切到其他页面。",
  backConfirm: "离开结果并返回当前页面？",
  tabBusy: {
    studio: "画案正在生成中",
    library: "藏卷正在生成中",
    experts: "雅匠正在生成中"
  },
  create: {
    thinking: "艺术家正在构思",
    paper: "艺术家正在张开纸张",
    painting: "艺术家正在绘画",
    details: "艺术家正在完善细节"
  },
  adjust: {
    understanding: "艺术家正在理解原作",
    direction: "艺术家正在推敲调整方向",
    repainting: "艺术家正在重绘笔墨",
    adjustDetails: "艺术家正在修整细节"
  }
}
```

For `zh-Hant`, use Traditional Chinese equivalents. For `en`, use:

```ts
generationLoading: {
  estimate: "Usually about 30 seconds. Please wait.",
  retry: "Try again",
  failedTitle: "Generation did not finish",
  failedHint: "Try again, or switch to another page first.",
  backConfirm: "Leave this result and return to this tab?",
  tabBusy: {
    studio: "Studio is generating",
    library: "Library is generating",
    experts: "Artisans are generating"
  },
  create: {
    thinking: "The artist is shaping the idea",
    paper: "The artist is opening the paper",
    painting: "The artist is painting",
    details: "The artist is refining details"
  },
  adjust: {
    understanding: "The artist is reading the original",
    direction: "The artist is planning the adjustment",
    repainting: "The artist is repainting the inkwork",
    adjustDetails: "The artist is refining the new draft"
  }
}
```

- [ ] **Step 2: Create component**

Create `client/src/components/GeneratingView.tsx`:

```tsx
import { RotateCcw } from "lucide-react";
import type { GenerationOperation, OriginTab } from "../api";
import { generationPhase, loadingImageIndex, type GenerationSessionStatus } from "../generationSession";
import type { Locale } from "../domain";

const IMAGE_COUNT = 4;

interface GeneratingViewProps {
  originTab: OriginTab;
  operation: GenerationOperation;
  jobId: string;
  startedAt: number;
  status: GenerationSessionStatus;
  error?: string;
  locale: Locale;
  t: (key: string) => string;
  onRetry: () => void;
}

function imagePath(operation: GenerationOperation, stage: string, jobId: string): string {
  const index = loadingImageIndex(jobId, operation, stage, IMAGE_COUNT) + 1;
  return `/loading/${operation}-${stage}-${index}.webp`;
}

export default function GeneratingView({
  operation,
  jobId,
  startedAt,
  status,
  error,
  t,
  onRetry
}: GeneratingViewProps) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const phase = generationPhase(operation, elapsedSeconds);
  const copyBase = `generationLoading.${operation}.${phase.labelKey}`;
  const failed = status === "failed";

  return (
    <section className="generating-view" aria-live="polite">
      <div className="generating-visual">
        <img src={imagePath(operation, phase.imageStage, jobId)} alt="" aria-hidden="true" />
      </div>
      <div className="generating-copy">
        <h2>{failed ? t("generationLoading.failedTitle") : t(copyBase)}</h2>
        <p>{failed ? error || t("generationLoading.failedHint") : t("generationLoading.estimate")}</p>
      </div>
      {failed ? (
        <button className="primary-action" type="button" onClick={onRetry}>
          <RotateCcw aria-hidden="true" size={16} />
          {t("generationLoading.retry")}
        </button>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Add styles**

Append to `client/src/styles.css`:

```css
.generating-view {
  min-height: min(620px, calc(100vh - 172px));
  display: grid;
  align-content: center;
  gap: 18px;
  padding: 18px;
  text-align: center;
}

.generating-visual {
  width: min(100%, 520px);
  margin: 0 auto;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 252, 245, 0.72);
  border: 1px solid rgba(88, 76, 61, 0.16);
}

.generating-visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.generating-copy {
  display: grid;
  gap: 8px;
}

.generating-copy h2 {
  margin: 0;
  font-size: 1.45rem;
}

.generating-copy p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}
```

- [ ] **Step 4: Run client tests for compile feedback**

Run: `npm test --workspace client -- generationSession.test.ts`

Expected: PASS. Full app tests may still fail until `App` is wired.

---

### Task 5: Wire App State, Completion Routing, And Back Confirmation

**Files:**
- Modify: `client/src/App.tsx`
- Reference only: `client/src/navigation.ts` for existing `pathForRecord`, `readSourceTab`, and tab stack behavior; do not change it unless a failing test proves the current helpers cannot represent the required route.
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: Add failing app tests for loading ownership**

In `client/tests/app.test.tsx`, add tests:

```tsx
it("shows create loading in the studio tab after starting generation", async () => {
  const user = userEvent.setup();
  renderApp();
  await completePaintingWithoutPhoto(user);
  await user.click(screen.getByRole("button", { name: "生成" }));

  expect(await screen.findByText("艺术家正在构思")).toBeInTheDocument();
  expect(screen.getByText("通常约 30 秒，请稍候。")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  expect(generationRequestBodies()[0].origin_tab).toBe("studio");
  expect(generationRequestBodies()[0].operation).toBe("create");
});

it("shows adjust loading in the library tab after adjusting a library result", async () => {
  libraryRecords = [{
    id: "record-1",
    type: "painting",
    title: "藏卷山水",
    thumbnail_path: "records/record-1/artwork.webp",
    artwork_path: "records/record-1/artwork.webp",
    status: "succeeded",
    favorite: true
  }];
  const user = userEvent.setup();
  renderApp({ initialRoute: "/library" });

  await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
  await user.click(screen.getByRole("button", { name: "调整作品" }));
  await user.type(screen.getByLabelText("调整这张作品"), "换成竖幅");
  await user.click(screen.getByRole("button", { name: "生成调整后的作品" }));

  expect(await screen.findByText("艺术家正在理解原作")).toBeInTheDocument();
  expect(generationRequestBodies().at(-1)?.origin_tab).toBe("library");
  expect(generationRequestBodies().at(-1)?.operation).toBe("adjust");
});
```

- [ ] **Step 2: Run app tests and confirm failure**

Run: `npm test --workspace client -- app.test.tsx -t "loading"`

Expected: FAIL because loading view and request metadata are not wired.

- [ ] **Step 3: Add session state to App**

In `client/src/App.tsx`, import:

```ts
import GeneratingView from "./components/GeneratingView";
import {
  readGenerationSessions,
  writeGenerationSessions,
  type GenerationSession,
  type GenerationSessionMap
} from "./generationSession";
import type { OriginTab, GenerationOperation } from "./api";
```

Add state after `activeJobs`:

```ts
const [generationSessions, setGenerationSessions] = useState<GenerationSessionMap>(() => readGenerationSessions());
const generationSessionsRef = useRef(generationSessions);
```

Persist on change:

```ts
useEffect(() => {
  generationSessionsRef.current = generationSessions;
  writeGenerationSessions(generationSessions);
}, [generationSessions]);
```

Add helper:

```ts
function originTabFromSource(source: Tab): OriginTab {
  return source === "experts" ? "experts" : source;
}
```

- [ ] **Step 4: Update generation start path**

Change `startGenerationJob` to receive `origin_tab` and `operation` from payload and create a session when a job starts:

```ts
const startGenerationJob = useCallback(async (payload: Parameters<typeof createGeneration>[0]) => {
  const originTab = payload.origin_tab ?? "studio";
  const operation = payload.operation ?? "create";
  try {
    const result = await createGeneration(payload);
    handleGenerationStart(result);
    if (result.job) {
      setGenerationSessions((sessions) => ({
        ...sessions,
        [originTab]: {
          originTab,
          operation,
          jobId: result.job.id,
          sourceRecordId: operation === "adjust" ? recordRoute?.recordId : undefined,
          resultRecordId: result.job.recordId,
          startedAt: result.job.created_at ? Date.parse(result.job.created_at) : Date.now(),
          status: "running",
          payload
        }
      }));
      navigate(fallbackPathForSource(originTab), { replace: true });
    }
    if (result.record && !result.job) {
      applyFinishedRecord(result.record);
    }
  } catch (error) {
    if (isGenerationLimitError(error)) {
      replaceActiveJobs((error.payload as GenerationStartResult).activeJobs ?? []);
    }
    throw error;
  }
}, [applyFinishedRecord, handleGenerationStart, navigate, recordRoute?.recordId, replaceActiveJobs]);
```

- [ ] **Step 5: Render `GeneratingView` for active tab sessions**

Before rendering tab content:

```ts
const activeGenerationSession = generationSessions[activeTab];
```

Inside `main`, before `<Studio>` / `<Library>`, render:

```tsx
{activeGenerationSession ? (
  <GeneratingView
    originTab={activeGenerationSession.originTab}
    operation={activeGenerationSession.operation}
    jobId={activeGenerationSession.jobId}
    startedAt={activeGenerationSession.startedAt}
    status={activeGenerationSession.status}
    error={activeGenerationSession.error}
    locale={locale}
    t={t}
    onRetry={() => retryGeneration(activeGenerationSession)}
  />
) : (
  <>
    {/* existing tab content */}
  </>
)}
```

Implement retry:

```ts
const retryGeneration = async (session: GenerationSession) => {
  if (!session.payload.type || !session.payload.answers) return;
  await startGenerationJob({
    type: session.payload.type,
    answers: session.payload.answers,
    conversationNotes: session.payload.conversationNotes ?? "",
    source_photo_path: session.payload.source_photo_path ?? "",
    recommended_artwork_size: session.payload.recommended_artwork_size ?? null,
    origin_tab: session.originTab,
    operation: session.operation
  });
};
```

- [ ] **Step 6: Completion routing by origin tab**

When finishing a job, use `job.origin_tab`:

```ts
const finishRecordForJob = useCallback(async (job: GenerationJob, record: GenerationRecord) => {
  const originTab = job.origin_tab ?? "studio";
  setGenerationSessions((sessions) => ({
    ...sessions,
    [originTab]: {
      ...(sessions[originTab] ?? {
        originTab,
        operation: job.operation ?? "create",
        jobId: job.id,
        startedAt: job.created_at ? Date.parse(job.created_at) : Date.now(),
        status: "running",
        payload: {}
      }),
      status: record.status === "failed" ? "failed" : "succeeded",
      resultRecordId: record.id,
      error: job.error
    }
  }));
  if (record.status === "failed") return;
  onResult(record);
  setLibrary((records) => visibleLibraryRecords([record, ...records.filter((item) => item.id !== record.id)]));
  if (activeTab === originTab) {
    setRecordViewOpen(true);
    navigate(pathForRecord(record.id, originTab), { replace: true });
  }
}, [activeTab, navigate, onResult]);
```

When opening the result, clear that tab session:

```ts
setGenerationSessions((sessions) => {
  const next = { ...sessions };
  delete next[originTab];
  return next;
});
```

- [ ] **Step 7: Add result back confirmation**

In `onPopState`, before backing away from a record route:

```ts
if (recordRoute && recordViewOpen) {
  const confirmed = window.confirm(t("generationLoading.backConfirm"));
  if (!confirmed) {
    window.history.pushState(null, "", pathWithSearch);
    return;
  }
}
```

Keep existing tab-history behavior after confirmation.

- [ ] **Step 8: Run app tests**

Run: `npm test --workspace client -- app.test.tsx -t "loading|back|library"`

Expected: PASS after updating any assertions that expected old active job status copy.

---

### Task 6: Studio And Result Submit Metadata

**Files:**
- Modify: `client/src/components/Studio.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: Update Studio prop type**

In `client/src/components/Studio.tsx`, extend `onStartGeneration` payload:

```ts
origin_tab?: "studio";
operation?: "create";
```

In `generate`, pass:

```ts
await onStartGeneration({
  type,
  answers,
  conversationNotes: note || conversationNotes,
  source_photo_path: sourcePhotoPath,
  recommended_artwork_size: recommendedArtworkSize ?? null,
  origin_tab: "studio",
  operation: "create"
});
```

- [ ] **Step 2: Update adjust submit**

In `client/src/App.tsx`, change `submitAdjustment`:

```ts
const source = readSourceTab(location.search);
await startGenerationJob({
  type: currentRecord.type,
  answers: currentRecord.answers ?? {},
  conversationNotes: note,
  source_photo_path: currentRecord.source_photo_path,
  recommended_artwork_size: currentRecord.recommended_artwork_size ?? null,
  origin_tab: originTabFromSource(source),
  operation: "adjust"
});
```

- [ ] **Step 3: Run targeted tests**

Run: `npm test --workspace client -- app.test.tsx -t "adjust|generates from empty notes"`

Expected: PASS with request bodies containing correct `origin_tab` and `operation`.

---

### Task 7: Loading Image Assets

**Files:**
- Add: `client/public/loading/*.webp`
- Optional helper output: generated source images under a temporary untracked folder before final WebP conversion

- [ ] **Step 1: Generate image sets**

Use the image generation capability to create these 32 WebP assets:

```text
create-thinking-1.webp ... create-thinking-4.webp
create-paper-1.webp ... create-paper-4.webp
create-painting-1.webp ... create-painting-4.webp
create-details-1.webp ... create-details-4.webp
adjust-understanding-1.webp ... adjust-understanding-4.webp
adjust-direction-1.webp ... adjust-direction-4.webp
adjust-repainting-1.webp ... adjust-repainting-4.webp
adjust-adjust-details-1.webp ... adjust-adjust-details-4.webp
```

Prompt constraints for all images:

```text
Chinese ink painting studio atmosphere, quiet desk, xuan paper, ink brush, warm natural light, refined and subtle, no text, no watermark, no signature, no logo, not in the style of a living artist, soft composition suitable for a loading screen
```

Stage-specific additions:

```text
thinking: empty paper, inkstone, contemplative setup
paper: paper being opened on a desk
painting: ink spreading and brush touching paper
details: close-up refined brush details and pale color wash
understanding: existing artwork being reviewed on desk
direction: small comparison sketches and adjustment notes without readable text
repainting: brush revising a section of inkwork
adjust-details: new draft being refined and settled
```

- [ ] **Step 2: Verify assets exist**

Run:

```powershell
Get-ChildItem client/public/loading/*.webp | Measure-Object
```

Expected: `Count : 32`.

- [ ] **Step 3: Run client test to catch missing asset references**

Run: `npm test --workspace client -- generationSession.test.ts`

Expected: PASS.

---

### Task 8: Full Verification

**Files:**
- No code changes unless verification exposes defects

- [ ] **Step 1: Run client tests**

Run: `npm test --workspace client`

Expected: PASS.

- [ ] **Step 2: Run server tests**

Run: `npm test --workspace server`

Expected: PASS.

- [ ] **Step 3: Run E2E**

Run: `npm run e2e`

Expected: PASS. If ports `5173` or `3101` are occupied, stop the stale process or report the blocker with the exact listener PID.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev`

Open: `http://127.0.0.1:5173`

Check:

```text
1. Start a Studio create job: Studio tab shows create loading copy and a create image.
2. Switch to Library and back: Studio loading remains.
3. Open a Library record and adjust: Library tab shows adjust loading copy.
4. Switch to Studio while Library adjusts: Studio remains usable unless its own job is active.
5. Result page browser back asks for confirmation.
```

---

## Self-Review Notes

- Spec coverage: tab-scoped limits, operation-scoped copy/images, per-tab loading, refresh persistence, result routing, back confirmation, and tests are covered by Tasks 1-8.
- No automatic commit steps are included because repository rules forbid automatic git operations.
- The plan intentionally leaves exact generated image pixels to the image-generation step, but fixes file names, counts, prompts, and verification.
