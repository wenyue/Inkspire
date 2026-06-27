# React Router Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 React Router 重新实现 Inkspire 页面跳转，让 URL 成为页面来源，刷新后恢复当前页面，只有目标作品不存在时才 fallback。

**Architecture:** `main.tsx` 提供 Router 上下文，`App.tsx` 只根据当前 URL 渲染画案、藏卷、雅匠、作品页、调整页和制作弹窗页。新增 `client/src/navigation.ts` 集中处理来源 tab、路由生成、tab 记忆、旧 localStorage 迁移和 fallback，逐步删除 `activeTab/currentRecordId/recordViewOpen/showProduction/adjustOpen` 作为页面来源的职责。

**Tech Stack:** React 18, Vite, TypeScript, Vitest, Testing Library, Playwright, `react-router-dom@7.18.0`。

> **项目约束:** 本仓库规则禁止自动创建 git commit；执行本计划时跳过任何提交步骤，只保留测试和人工 review checkpoint。

---

## 文件结构

- Modify: `client/package.json`
  - 增加 `react-router-dom` 依赖。
- Modify: `package-lock.json`
  - 由 `npm install react-router-dom@7.18.0 --workspace client` 生成。
- Create: `client/src/navigation.ts`
  - 负责路由路径、`from` 解析、tab 推导、tab 最后 URL 记忆、旧 key 迁移和 fallback。
- Modify: `client/src/main.tsx`
  - 用 `BrowserRouter` 包住 `App`。
- Modify: `client/src/App.tsx`
  - 从状态驱动页面切换改为 URL 驱动页面切换。
  - 保留 config/library/jobs/record cache 等数据状态。
  - `navigate()` 替代 `pushNav/replaceNav/applySnapshot`。
- Modify: `client/tests/app.test.tsx`
  - 增加 router-aware render helper。
  - 增加 URL、刷新恢复、fallback、tab 记忆、production 刷新恢复测试。
  - 改写依赖旧 `activeTab/currentRecordId` 页面来源的断言。
- Modify: `e2e/inkspire.spec.ts`
  - 增加真实浏览器路径：藏卷作品页 -> 雅匠 -> 藏卷仍回作品页。
  - 增加 production URL reload 后仍显示弹窗。

---

### Task 1: 安装 React Router 并建立导航 helper

**Files:**
- Modify: `client/package.json`
- Modify: `package-lock.json`
- Create: `client/src/navigation.ts`
- Test: `client/tests/navigation.test.ts`

- [ ] **Step 1: 安装依赖**

Run:

```powershell
npm install react-router-dom@7.18.0 --workspace client
```

Expected:

```text
`client/package.json` contains `"react-router-dom": "^7.18.0"` and `package-lock.json` is updated.
```

- [ ] **Step 2: 写导航 helper 的失败测试**

Create `client/tests/navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  defaultTabRouteMemory,
  fallbackPathForSource,
  normalizePathForTabMemory,
  pathForRecord,
  readSourceTab,
  tabFromPath
} from "../src/navigation";

describe("navigation helpers", () => {
  it("derives the highlighted tab from plain pages", () => {
    expect(tabFromPath("/studio")).toBe("studio");
    expect(tabFromPath("/library")).toBe("library");
    expect(tabFromPath("/experts")).toBe("experts");
  });

  it("derives the highlighted tab from record pages using from", () => {
    expect(tabFromPath("/records/record-1?from=library")).toBe("library");
    expect(tabFromPath("/records/record-1/adjust?from=studio")).toBe("studio");
    expect(tabFromPath("/records/record-1/production?from=experts")).toBe("experts");
  });

  it("falls back to studio when from is missing or invalid", () => {
    expect(readSourceTab("?from=bad")).toBe("studio");
    expect(tabFromPath("/records/record-1")).toBe("studio");
    expect(fallbackPathForSource("bad")).toBe("/studio");
  });

  it("builds stable record paths", () => {
    expect(pathForRecord("record-1", "library")).toBe("/records/record-1?from=library");
    expect(pathForRecord("record-1", "library", "adjust")).toBe("/records/record-1/adjust?from=library");
    expect(pathForRecord("record-1", "experts", "production")).toBe("/records/record-1/production?from=experts");
  });

  it("keeps only app routes in tab memory", () => {
    expect(normalizePathForTabMemory("library", "/records/record-1?from=library")).toBe("/records/record-1?from=library");
    expect(normalizePathForTabMemory("library", "/records/record-1?from=studio")).toBe("/library");
    expect(normalizePathForTabMemory("library", "/unknown")).toBe("/library");
    expect(defaultTabRouteMemory.library).toBe("/library");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/navigation.test.ts
```

Expected:

```text
FAIL tests/navigation.test.ts
Cannot find module '../src/navigation'
```

- [ ] **Step 4: 创建 `client/src/navigation.ts` 的最小实现**

Create `client/src/navigation.ts`:

```ts
export type Tab = "studio" | "library" | "experts";
export type RecordRouteKind = "result" | "adjust" | "production";

export interface TabRouteMemory {
  studio: string;
  library: string;
  experts: string;
}

export const TAB_ROUTE_MEMORY_KEY = "inkspire.tabRouteMemory.v1";
export const LEGACY_ACTIVE_TAB_KEY = "inkspire.activeTab";
export const LEGACY_CURRENT_RECORD_KEY = "inkspire.currentRecordId";

export const defaultTabRouteMemory: TabRouteMemory = {
  studio: "/studio",
  library: "/library",
  experts: "/experts"
};

export function isTab(value: string | null | undefined): value is Tab {
  return value === "studio" || value === "library" || value === "experts";
}

export function readSourceTab(search: string): Tab {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  return isTab(from) ? from : "studio";
}

export function fallbackPathForSource(source: string | null | undefined): string {
  return isTab(source) ? `/${source}` : "/studio";
}

export function pathForRecord(recordId: string, source: Tab, kind: RecordRouteKind = "result"): string {
  const suffix = kind === "result" ? "" : `/${kind}`;
  return `/records/${encodeURIComponent(recordId)}${suffix}?from=${source}`;
}

export function tabFromPath(pathWithSearch: string): Tab {
  const url = new URL(pathWithSearch, "http://inkspire.local");
  if (url.pathname === "/library") {
    return "library";
  }
  if (url.pathname === "/experts") {
    return "experts";
  }
  if (url.pathname.startsWith("/records/")) {
    return readSourceTab(url.search);
  }
  return "studio";
}

export function normalizePathForTabMemory(tab: Tab, pathWithSearch: string): string {
  const url = new URL(pathWithSearch, "http://inkspire.local");
  if (url.pathname === `/${tab}`) {
    return `${url.pathname}${url.search}`;
  }
  if (url.pathname.startsWith("/records/") && readSourceTab(url.search) === tab) {
    return `${url.pathname}${url.search}`;
  }
  return defaultTabRouteMemory[tab];
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/navigation.test.ts
```

Expected:

```text
PASS tests/navigation.test.ts
```

---

### Task 2: 加入 Router 上下文和测试 render helper

**Files:**
- Modify: `client/src/main.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，证明 App 可在初始 URL 下渲染**

Modify `client/tests/app.test.tsx` imports:

```ts
import { MemoryRouter } from "react-router-dom";
```

Add helper near `type TestUser`:

```ts
function renderApp(initialPath = "/studio") {
  window.history.pushState({}, "", initialPath);
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  );
}
```

Change the first App render test:

```ts
it("renders 墨起 and the three mobile nav buttons", async () => {
  renderApp("/studio");

  expect(await screen.findByRole("heading", { name: "墨起" })).toBeInTheDocument();
  expect(screen.getAllByText("园林卷轴里的书画生成")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "画案" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "藏卷" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "雅匠" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "renders 墨起"
```

Expected before dependency/task wiring is complete:

```text
FAIL with a missing dependency, missing import, or router context error.
```

- [ ] **Step 3: 用 `BrowserRouter` 包住生产入口**

Modify `client/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 4: 批量替换 app 测试的 `render(<App />)`**

In `client/tests/app.test.tsx`, replace each:

```ts
render(<App />);
```

with:

```ts
renderApp();
```

For tests that need a specific route, call:

```ts
renderApp("/records/record-1?from=library");
```

- [ ] **Step 5: 运行 smoke 测试**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "renders 墨起"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 3: 用 URL 驱动底部 tab 和首页路由

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，访问 `/library` 时高亮藏卷**

Add in `client/tests/app.test.tsx` near existing tab tests:

```ts
it("highlights tabs from URL routes", async () => {
  renderApp("/library");

  expect(await screen.findByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "highlights tabs from URL routes"
```

Expected:

```text
FAIL because the 藏卷 button does not yet have `aria-pressed="true"` for `/library`.
```

- [ ] **Step 3: 修改 App 使用 router location 推导 tab**

Modify imports in `client/src/App.tsx`:

```ts
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { pathForRecord, tabFromPath, type Tab } from "./navigation";
```

Remove local `type Tab = "studio" | "library" | "experts";` from `App.tsx`.

Inside `App`, add:

```ts
const navigate = useNavigate();
const location = useLocation();
const activeTab = tabFromPath(`${location.pathname}${location.search}`);
```

Keep the existing active-tab state temporarily only until this task compiles, then remove it in Task 8. During this task, rename the state variable before removal to avoid duplicate names:

```ts
const [_legacyActiveTab, setLegacyActiveTab] = useState<Tab>(() => readStoredTab());
```

Update bottom tab `onClick` to call a new `goToTab` based on `navigate`:

```ts
const goToTab = (tab: Tab) => {
  if (tab === "studio" && activeTab === "studio" && currentRecord && location.pathname.startsWith("/records/")) {
    startNewArtwork();
    return;
  }
  navigate(`/${tab}`);
};
```

In the `<main>`, introduce initial routes while still reusing existing render blocks:

```tsx
<Routes>
  <Route path="/" element={<Navigate to="/studio" replace />} />
  <Route path="/studio" element={
    <Studio
      config={config}
      locale={locale}
      t={t}
      list={list}
      onStartGeneration={startGenerationJob}
      activeJobs={activeJobs}
      resultSlot={null}
      studioResetRequest={studioResetRequest}
      hasResult={false}
    />
  } />
  <Route path="/library" element={
    <Library
      records={library}
      locale={locale}
      emptyLabel={t("empty.library")}
      emptyHint={t("empty.libraryHint")}
      emptyActionLabel={t("empty.libraryAction")}
      actionError={libraryActionError}
      labels={{
        artwork: t("library.artwork"),
        fusion: t("library.fusion"),
        failed: t("library.failed"),
        openRecord: t("library.openRecord"),
        removeFavorite: t("library.removeFavorite"),
        removeFavoriteShort: t("library.removeFavoriteShort"),
        removeConfirmTitle: t("library.removeConfirmTitle"),
        removeConfirmHint: t("library.removeConfirmHint"),
        removeConfirmCancel: t("library.removeConfirmCancel"),
        removeConfirmAction: t("library.removeConfirmAction")
      }}
      onEmptyAction={() => {
        setLibraryActionError("");
        navigate("/studio");
      }}
      onOpen={openRecordFromLibrary}
      onFavoriteToggle={async (record, favorite) => {
        setLibraryActionError("");
        await updateFavorite(record.id, favorite);
        setLibrary((records) => visibleLibraryRecords(
          records.map((item) => item.id === record.id ? { ...item, favorite } : item)
        ));
      }}
    />
  } />
  <Route path="/experts" element={
    <Experts
      experts={config.experts}
      title={t("experts.title")}
      locale={locale}
      serviceHeading={t("experts.serviceHeading")}
      extraServiceName={t("experts.extraServiceName")}
      extraServiceDescription={t("experts.extraServiceDescription")}
      expectationLabel={t("experts.expectation")}
      sampleHeading={t("experts.sampleHeading")}
      currentWorkLabel={t("experts.currentWork")}
      currentWorkPreviewLabel={t("experts.currentWorkPreview")}
      ctaLabel={
        currentRecord && currentRecord.status !== "failed"
          ? productionEnabled ? t("experts.ctaWithRecord") : t("experts.productionUnavailable")
          : t("experts.ctaStart")
      }
      ctaDisabled={Boolean(currentRecord && currentRecord.status !== "failed" && !productionEnabled)}
      currentRecord={currentRecord}
      onCta={() => {
        if (currentRecord && currentRecord.status !== "failed" && productionEnabled) {
          navigate(pathForRecord(currentRecord.id, "experts", "production"));
        } else {
          navigate("/studio");
        }
      }}
    />
  } />
</Routes>
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "highlights tabs from URL routes"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 4: 作品页路由和 missing fallback

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，直接访问作品 URL 恢复作品页**

Add tests:

```ts
it("restores a library record page from the URL", async () => {
  renderApp("/records/record-1?from=library");

  expect(await screen.findByRole("img", { name: "作品图" })).toHaveAttribute(
    "src",
    "/api/records/record-1/images/artwork"
  );
  expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
});

it("falls back to the source tab when a record URL is missing", async () => {
  renderApp("/records/missing-record?from=library");

  expect(await screen.findByRole("heading", { name: "藏卷还空着" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "restores a library record page|falls back to the source tab"
```

Expected:

```text
FAIL because `/records/:recordId` has no working route yet or no result image is rendered.
```

- [ ] **Step 3: 在 App 中增加 record route loader 组件**

In `client/src/App.tsx`, import:

```ts
import { useParams, useSearchParams } from "react-router-dom";
import { fallbackPathForSource, readSourceTab } from "./navigation";
```

Inside `App`, add a local component before `return`:

```tsx
function RecordRoute({ mode }: { mode: "result" | "adjust" | "production" }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const source = readSourceTab(`?${searchParams.toString()}`);
  const recordId = params.recordId ?? "";

  useEffect(() => {
    if (!recordId) {
      navigate(fallbackPathForSource(source), { replace: true });
      return;
    }
    const cached = recordCacheRef.current.get(recordId);
    if (cached) {
      setCurrentRecord(cached);
      return;
    }
    let active = true;
    setRestoringRecordId(recordId);
    getRecord(recordId)
      .then((record) => {
        if (!active) {
          return;
        }
        recordCacheRef.current.set(record.id, record);
        setCurrentRecord(record);
        setRestoringRecordId("");
      })
      .catch(() => {
        if (active) {
          setRestoringRecordId("");
          navigate(fallbackPathForSource(source), { replace: true });
        }
      });
    return () => {
      active = false;
    };
  }, [recordId, source]);

  if (restoringRecordId === recordId || !currentRecord || currentRecord.id !== recordId) {
    return (
      <section className="studio-panel">
        <p className="status-line" role="status">{t("studio.generatingWait")}</p>
      </section>
    );
  }

  if (mode === "adjust") {
    return (
      <AdjustView
        record={currentRecord}
        title={t("adjust.title")}
        intro={t("adjust.intro")}
        placeholder={t("adjust.placeholder")}
        submitLabel={t("adjust.submit")}
        submittingLabel={t("adjust.submitting")}
        backLabel={t("adjust.back")}
        baseLabel={t("adjust.baseLabel")}
        artworkLabel={t("result.artwork")}
        suggestions={list("suggestions").slice(1)}
        isSubmitting={isAdjusting}
        error={adjustError}
        onBack={() => navigate(-1)}
        onSubmit={submitAdjustment}
      />
    );
  }

  return resultSlot;
}
```

Add routes:

```tsx
<Route path="/records/:recordId" element={<RecordRoute mode="result" />} />
<Route path="/records/:recordId/adjust" element={<RecordRoute mode="adjust" />} />
<Route path="/records/:recordId/production" element={<RecordRoute mode="production" />} />
```

In this task `production` still renders `resultSlot`; Task 7 opens the dialog.

- [ ] **Step 4: Update `openRecordFromLibrary` to navigate**

Replace the body after `onResult(fullRecord)` with:

```ts
navigate(pathForRecord(fullRecord.id, "library"));
```

Remove direct calls in that function to:

```ts
setRecordViewOpen(true);
setAdjustOpen(false);
setShowProduction(false);
pushNav({ tab: "library", recordId: fullRecord.id, production: false, adjust: false, result: true });
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "restores a library record page|falls back to the source tab"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 5: Tab 最后 URL 记忆

**Files:**
- Modify: `client/src/navigation.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，藏卷作品页切走再切回仍显示作品**

Add test:

```ts
it("returns to the library record page when switching away and back to the library tab", async () => {
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
  renderApp("/library");

  await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
  expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "雅匠" }));
  expect(await screen.findByText("可咨询方向")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "藏卷" }));
  expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "returns to the library record page"
```

Expected:

```text
FAIL because returning to the 藏卷 tab renders the library list or empty state instead of the record image.
```

- [ ] **Step 3: 扩展 `navigation.ts` 读写 tab 记忆**

Add to `client/src/navigation.ts`:

```ts
function isTabRouteMemory(value: unknown): value is TabRouteMemory {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<TabRouteMemory>;
  return typeof candidate.studio === "string"
    && typeof candidate.library === "string"
    && typeof candidate.experts === "string";
}

export function readTabRouteMemory(): TabRouteMemory {
  if (typeof window === "undefined") {
    return defaultTabRouteMemory;
  }
  try {
    const raw = window.localStorage.getItem(TAB_ROUTE_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!isTabRouteMemory(parsed)) {
      return defaultTabRouteMemory;
    }
    return {
      studio: normalizePathForTabMemory("studio", parsed.studio),
      library: normalizePathForTabMemory("library", parsed.library),
      experts: normalizePathForTabMemory("experts", parsed.experts)
    };
  } catch {
    return defaultTabRouteMemory;
  }
}

export function writeTabRouteMemory(memory: TabRouteMemory) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TAB_ROUTE_MEMORY_KEY, JSON.stringify(memory));
}

export function rememberTabRoute(memory: TabRouteMemory, pathWithSearch: string): TabRouteMemory {
  const tab = tabFromPath(pathWithSearch);
  return {
    ...memory,
    [tab]: normalizePathForTabMemory(tab, pathWithSearch)
  };
}
```

- [ ] **Step 4: 在 App 中更新和使用 tab 记忆**

Import:

```ts
import { readTabRouteMemory, rememberTabRoute, writeTabRouteMemory } from "./navigation";
```

Add state:

```ts
const [tabRouteMemory, setTabRouteMemory] = useState(readTabRouteMemory);
```

Add effect:

```ts
useEffect(() => {
  const pathWithSearch = `${location.pathname}${location.search}`;
  setTabRouteMemory((current) => {
    const next = rememberTabRoute(current, pathWithSearch);
    writeTabRouteMemory(next);
    return next;
  });
}, [location.pathname, location.search]);
```

Update `goToTab`:

```ts
const goToTab = (tab: Tab) => {
  if (tab === "studio" && activeTab === "studio" && currentRecord && location.pathname.startsWith("/records/")) {
    startNewArtwork();
    return;
  }
  navigate(tabRouteMemory[tab] ?? `/${tab}`);
};
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "returns to the library record page"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 6: 生成结果和调整流程使用 URL

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，生成后进入 `/records/:id?from=studio`**

Add test:

```ts
it("navigates to a studio record URL after generation", async () => {
  const user = userEvent.setup();
  renderApp("/studio");

  await completePaintingWithoutPhoto(user);
  await user.click(screen.getByRole("button", { name: "生成" }));

  expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/records/record-1");
  expect(window.location.search).toBe("?from=studio");
});
```

- [ ] **Step 2: 写失败测试，调整成功 replace 到新作品 URL**

Add test:

```ts
it("replaces the adjust URL with the new record URL after adjustment submit", async () => {
  const user = userEvent.setup();
  renderApp("/records/record-1/adjust?from=library");

  await user.type(await screen.findByLabelText("调整这张作品"), "换成竖幅");
  await user.click(screen.getByRole("button", { name: "生成调整后的作品" }));

  expect(await screen.findByRole("img", { name: "作品图" })).toHaveAttribute(
    "src",
    "/api/records/record-2/images/artwork"
  );
  expect(window.location.pathname).toBe("/records/record-2");
  expect(window.location.search).toBe("?from=library");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "navigates to a studio record URL|replaces the adjust URL"
```

Expected:

```text
FAIL because generation or adjustment does not yet update `window.location.pathname` and `window.location.search`.
```

- [ ] **Step 4: 更新 `applyFinishedRecord`**

Replace history-state logic in `applyFinishedRecord` with:

```ts
const applyFinishedRecord = useCallback((record: GenerationRecord) => {
  onResult(record);
  const source = readSourceTab(location.search);
  const finishingAdjustment = adjustSubmitRef.current;
  if (finishingAdjustment) {
    adjustSubmitRef.current = false;
    navigate(pathForRecord(record.id, source), { replace: true });
    return;
  }
  navigate(pathForRecord(record.id, "studio"));
}, [location.search, navigate, onResult]);
```

- [ ] **Step 5: 更新 `openAdjust` 和 result 按钮**

Replace `openAdjust` with:

```ts
const openAdjust = () => {
  if (!currentRecord) {
    return;
  }
  setAdjustError("");
  navigate(pathForRecord(currentRecord.id, readSourceTab(location.search), "adjust"));
};
```

Keep `ResultView` props unchanged:

```tsx
onAdjust={openAdjust}
```

- [ ] **Step 6: 运行测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "navigates to a studio record URL|replaces the adjust URL"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 7: 制作弹窗路由和刷新恢复

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，production URL 直接恢复弹窗**

Add test:

```ts
it("restores the production dialog from a production URL", async () => {
  renderApp("/records/record-1/production?from=library");

  expect(await screen.findByRole("dialog", { name: "制作作品" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "作品图" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "藏卷" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "restores the production dialog"
```

Expected:

```text
FAIL because the production dialog is not rendered from `/records/:recordId/production?from=library`.
```

- [ ] **Step 3: 用 production route 控制弹窗**

In `RecordRoute`, when `mode === "production"`, render `resultSlot` and let global dialog open based on route.

Add:

```ts
const productionRouteOpen = location.pathname.endsWith("/production");
```

Replace dialog condition:

```tsx
{productionRouteOpen && currentRecord && currentRecord.status !== "failed" ? (
  <ProductionDialog
    expert={config.experts[0]}
    supportContact={config.productionContact}
    locale={locale}
    record={currentRecord}
    title={t("production.title")}
    introLabel={t("production.intro")}
    closeLabel={t("production.close")}
    sizeLabel={t("production.size")}
    estimateLabel={t("production.estimate")}
    contactLabel={t("production.contact")}
    phoneLabel={t("production.phone")}
    wechatLabel={t("production.wechat")}
    customSizeLabel={t("production.customSize")}
    widthLabel={t("production.width")}
    heightLabel={t("production.height")}
    sizeUnitLabel={t("production.sizeUnit")}
    referenceLabel={t("production.reference")}
    services={config.experts[0]?.services ?? []}
    submitLabel={t("production.submit")}
    submittingLabel={t("production.submitting")}
    onClose={() => navigate(-1)}
  />
) : null}
```

Replace `openProduction`:

```ts
const openProduction = () => {
  if (!currentRecord || currentRecord.status === "failed") {
    return;
  }
  navigate(pathForRecord(currentRecord.id, readSourceTab(location.search), "production"));
};
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "restores the production dialog"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 8: 旧 localStorage 页面来源迁移并删除旧导航状态

**Files:**
- Modify: `client/src/navigation.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试，旧 key 只迁移为初始 URL**

Add test:

```ts
it("migrates legacy activeTab and currentRecordId into the router URL once", async () => {
  window.localStorage.setItem("inkspire.activeTab", "library");
  window.localStorage.setItem("inkspire.currentRecordId", "record-1");

  renderApp("/");

  expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/records/record-1");
  expect(window.location.search).toBe("?from=library");
  expect(window.localStorage.getItem("inkspire.activeTab")).toBeNull();
  expect(window.localStorage.getItem("inkspire.currentRecordId")).toBeNull();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "migrates legacy"
```

Expected:

```text
FAIL because `/` still renders the default route instead of migrating to `/records/record-1?from=library`.
```

- [ ] **Step 3: 在 navigation helper 中实现迁移**

Add to `client/src/navigation.ts`:

```ts
export function migrateLegacyNavigationPath(): string {
  if (typeof window === "undefined") {
    return "/studio";
  }
  const activeTab = window.localStorage.getItem(LEGACY_ACTIVE_TAB_KEY);
  const currentRecordId = window.localStorage.getItem(LEGACY_CURRENT_RECORD_KEY);
  window.localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY);
  window.localStorage.removeItem(LEGACY_CURRENT_RECORD_KEY);
  const source = isTab(activeTab) ? activeTab : "studio";
  if (currentRecordId) {
    return pathForRecord(currentRecordId, source);
  }
  return `/${source}`;
}
```

- [ ] **Step 4: 在 `/` route 使用迁移路径**

In `App.tsx`, import:

```ts
import { migrateLegacyNavigationPath } from "./navigation";
```

Add:

```tsx
function InitialRouteRedirect() {
  return <Navigate to={migrateLegacyNavigationPath()} replace />;
}
```

Replace root route:

```tsx
<Route path="/" element={<InitialRouteRedirect />} />
```

- [ ] **Step 5: 删除旧页面来源状态与函数**

Remove from `client/src/App.tsx` when no longer referenced:

```ts
interface NavSnapshot;
const ACTIVE_TAB_KEY = "inkspire.activeTab";
const CURRENT_RECORD_KEY = "inkspire.currentRecordId";
function readStoredTab;
function readStoredRecordId;
const [_legacyActiveTab, setLegacyActiveTab];
const [recordViewOpen, setRecordViewOpen];
const [showProduction, setShowProduction];
const pushNav;
const replaceNav;
const applySnapshot;
useEffect that registers the `popstate` listener;
useEffect that calls `replaceNav` to seed browser history;
```

- [ ] **Step 6: 运行迁移测试确认通过**

Run:

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "migrates legacy"
```

Expected:

```text
PASS tests/app.test.tsx
```

---

### Task 9: 更新 E2E 覆盖真实浏览器导航

**Files:**
- Modify: `e2e/inkspire.spec.ts`

- [ ] **Step 1: 增加藏卷 tab 记忆 E2E 断言**

In the mobile flow after opening the saved record from library, add:

```ts
await page.getByRole("button", { name: "雅匠" }).click();
await expect(page.getByText("可咨询方向")).toBeVisible();
await page.getByRole("button", { name: "藏卷", exact: true }).click();
await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
await expect(page.getByRole("button", { name: "藏卷", exact: true })).toHaveAttribute("aria-pressed", "true");
```

- [ ] **Step 2: 增加 production reload E2E 断言**

After clicking `制作作品`, add:

```ts
await expect(page).toHaveURL(/\/records\/[^/]+\/production\?from=/);
await page.reload();
await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
```

- [ ] **Step 3: 运行 E2E 预期可能失败**

Run:

```powershell
npm run e2e
```

Expected before final cleanup:

```text
FAIL if URL expectations or production route is not fully wired
```

- [ ] **Step 4: 修正 E2E 暴露的路由边界**

Use the failure location to update only the corresponding route transition. The expected URL shapes are:

```text
/records/:id?from=studio
/records/:id?from=library
/records/:id/production?from=studio
/records/:id/production?from=library
```

- [ ] **Step 5: 重新运行 E2E**

Run:

```powershell
npm run e2e
```

Expected:

```text
2 passed
```

---

### Task 10: 全量验证和清理

**Files:**
- Inspect: `client/src/App.tsx`
- Inspect: `client/src/navigation.ts`
- Inspect: `client/tests/app.test.tsx`
- Inspect: `e2e/inkspire.spec.ts`

- [ ] **Step 1: 查找旧导航状态残留**

Run:

```powershell
rg -n "activeTab|recordViewOpen|showProduction|pushNav|replaceNav|applySnapshot|inkspire.currentRecordId|inkspire.activeTab" client/src client/tests
```

Expected:

```text
Only migration constants/tests mention inkspire.activeTab or inkspire.currentRecordId.
No activeTab state, recordViewOpen, showProduction, pushNav, replaceNav, applySnapshot remain in App.tsx.
```

- [ ] **Step 2: 运行前端测试**

Run:

```powershell
npm test --workspace client
```

Expected:

```text
Test Files  all passed
Tests       all passed
```

- [ ] **Step 3: 运行 E2E**

Run:

```powershell
npm run e2e
```

Expected:

```text
2 passed
```

- [ ] **Step 4: 检查 dev server 端口冲突风险**

If E2E reports Vite started on `5174`, check stale listeners:

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Expected:

```text
No stale listener before running e2e, or e2e uses its managed 5173 server.
```

- [ ] **Step 5: 人工 review checkpoint**

Review these behaviors in the browser:

```text
/studio
/library
/experts
/records/<existing-id>?from=library
/records/<existing-id>/adjust?from=library
/records/<existing-id>/production?from=library
```

Expected:

```text
Each URL renders the intended page, refresh preserves it, and missing record URLs fallback to the source tab.
```
