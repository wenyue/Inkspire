# Image Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为结果页作品图、结果页效果图、调整作品页基准图增加全屏可缩放查看器。

**Architecture:** 新增 `ImageViewer` 作为纯前端查看组件，内部管理缩放、平移、键盘关闭和滚轮缩放。`ResultView` 与 `AdjustView` 只保存当前打开图片状态，并把可用图片传给 `ImageViewer`。样式集中追加到 `client/src/styles.css`，不改路由、后端接口或图片 URL。

**Tech Stack:** React 18、TypeScript、lucide-react、Vitest、Testing Library、CSS。

---

## 文件结构

- Create: `client/src/components/ImageViewer.tsx`
  - 职责：渲染全屏图片查看器，处理缩放、重置、拖动平移、滚轮缩放、`Escape` 关闭。
- Modify: `client/src/components/ResultView.tsx`
  - 职责：把作品图和效果图变成可点击图片，维护 `{ src, alt }` 查看状态。
- Modify: `client/src/components/AdjustView.tsx`
  - 职责：把基准作品图变成可点击图片，维护同一类查看状态。
- Modify: `client/src/styles.css`
  - 职责：增加查看器覆盖层、图片舞台、工具栏、缩放按钮、可点击图片状态。
- Modify: `client/tests/app.test.tsx`
  - 职责：覆盖结果页作品图、结果页效果图、调整页基准图、缩放按钮、关闭后页面继续可用。

## Task 1: 写结果页查看器失败测试

**Files:**
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 增加结果页作品图全屏测试**

在 `describe("App", () => { ... })` 内新增测试。放在结果页导航测试附近即可。先把测试文件顶部 import 改为：

```tsx
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
```

```tsx
  it("opens and closes the artwork image viewer from the result page", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "查看作品图" }));

    const viewer = screen.getByRole("dialog", { name: "作品图" });
    const viewerScope = within(viewer);
    expect(viewer).toBeInTheDocument();
    expect(viewerScope.getByRole("img", { name: "作品图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/artwork"
    );

    await user.click(screen.getByRole("button", { name: "放大" }));
    expect(viewerScope.getByRole("img", { name: "作品图" })).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.25)"
    });

    await user.click(screen.getByRole("button", { name: "缩小" }));
    expect(viewerScope.getByRole("img", { name: "作品图" })).toHaveStyle({
      transform: "translate(0px, 0px) scale(1)"
    });

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.queryByRole("dialog", { name: "作品图" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 增加结果页效果图全屏测试**

```tsx
  it("opens the fusion image viewer from the result page", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "查看效果图" }));

    const viewer = screen.getByRole("dialog", { name: "效果图" });
    const viewerScope = within(viewer);
    expect(viewer).toBeInTheDocument();
    expect(viewerScope.getByRole("img", { name: "效果图" })).toHaveAttribute(
      "src",
      "/api/records/record-1/images/fusion"
    );
  });
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: FAIL，错误包含找不到 `查看作品图` 或 `查看效果图` 按钮。

## Task 2: 实现 `ImageViewer` 组件

**Files:**
- Create: `client/src/components/ImageViewer.tsx`

- [ ] **Step 1: 新增组件文件**

创建 `client/src/components/ImageViewer.tsx`：

```tsx
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Minus, Plus, RotateCcw } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

interface ImageViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

export default function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    setDragStart(null);
    setImageFailed(false);
    closeRef.current?.focus();
  }, [src]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const updateScale = (nextScale: number): void => {
    const clamped = clampScale(nextScale);
    setScale(clamped);
    if (clamped === MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
    }
  };

  const reset = (): void => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
    setDragStart(null);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    updateScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (scale <= MIN_SCALE) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragStart) {
      return;
    }
    setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
  };

  const stopDrag = (): void => {
    setDragStart(null);
  };

  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <button ref={closeRef} className="image-viewer-back" type="button" onClick={onClose}>
        <ArrowLeft aria-hidden="true" size={18} />
        返回
      </button>
      <div
        className={dragStart ? "image-viewer-stage dragging" : "image-viewer-stage"}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {imageFailed ? (
          <div className="image-viewer-error" role="status">图片暂时无法查看</div>
        ) : (
          <img
            className="image-viewer-image"
            src={src}
            alt={alt}
            onError={() => setImageFailed(true)}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
            }}
          />
        )}
      </div>
      <div className="image-viewer-controls" aria-label="图片缩放控制">
        <button type="button" aria-label="缩小" onClick={() => updateScale(scale - SCALE_STEP)} disabled={scale <= MIN_SCALE}>
          <Minus aria-hidden="true" size={18} />
        </button>
        <button type="button" aria-label="重置" onClick={reset}>
          <RotateCcw aria-hidden="true" size={18} />
        </button>
        <button type="button" aria-label="放大" onClick={() => updateScale(scale + SCALE_STEP)} disabled={scale >= MAX_SCALE}>
          <Plus aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 运行测试并确认仍失败在接入点**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: FAIL，组件已存在，但结果页还没有 `查看作品图` / `查看效果图` 按钮。

## Task 3: 接入结果页作品图和效果图

**Files:**
- Modify: `client/src/components/ResultView.tsx`

- [ ] **Step 1: 增加 import 和查看状态**

把 import 改成：

```tsx
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Brush, ImagePlus, Wand2 } from "lucide-react";
import type { GenerationRecord } from "../api";
import { resultLayoutForWidth } from "../domain";
import ImageViewer from "./ImageViewer";
```

在 `pendingPhotoTimer` 后加入：

```tsx
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string } | null>(null);
```

- [ ] **Step 2: 把作品图包成可点击按钮**

把作品图 `<img ... />` 替换为：

```tsx
        <button
          className={`image-open-button ${mediaClassName ?? ""}`.trim()}
          type="button"
          aria-label={`查看${artworkLabel}`}
          onClick={() => setViewerImage({ src: artwork, alt: artworkLabel })}
        >
          <img
            className={mediaClassName}
            src={artwork}
            alt={artworkLabel}
            onError={() => setFailedImages((current) => ({ ...current, artwork: true }))}
          />
        </button>
```

- [ ] **Step 3: 把效果图包成可点击按钮**

把效果图 `<img ... />` 替换为：

```tsx
        <button
          className={`image-open-button ${mediaClassName ?? ""}`.trim()}
          type="button"
          aria-label={`查看${fusionLabel}`}
          onClick={() => setViewerImage({ src: fusion, alt: fusionLabel })}
        >
          <img
            className={mediaClassName}
            src={fusion}
            alt={fusionLabel}
            onError={() => setFailedImages((current) => ({ ...current, fusion: true }))}
          />
        </button>
```

- [ ] **Step 4: 在返回 JSX 末尾渲染查看器**

在 `actionError` 后、`</section>` 前加入：

```tsx
      {viewerImage ? (
        <ImageViewer src={viewerImage.src} alt={viewerImage.alt} onClose={() => setViewerImage(null)} />
      ) : null}
```

- [ ] **Step 5: 运行结果页测试**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: 结果页新增测试通过；调整页测试尚未添加。

## Task 4: 写并实现调整页查看器

**Files:**
- Modify: `client/tests/app.test.tsx`
- Modify: `client/src/components/AdjustView.tsx`

- [ ] **Step 1: 增加调整页测试**

在调整页已有测试附近新增：

```tsx
  it("opens and closes the image viewer from the adjust page", async () => {
    const user = userEvent.setup();
    renderApp({ initialRoute: "/studio" });

    await completePaintingWithoutPhoto(user);
    await user.click(screen.getByRole("button", { name: "生成" }));
    await user.click(await screen.findByRole("button", { name: "调整作品" }));
    await user.click(screen.getByRole("button", { name: "查看当前作品 作品图" }));

    const viewer = screen.getByRole("dialog", { name: "当前作品 作品图" });
    expect(viewer).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.queryByRole("dialog", { name: "当前作品 作品图" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("调整这张作品")).toBeInTheDocument();
  });
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: FAIL，错误包含找不到 `查看当前作品 作品图` 按钮。

- [ ] **Step 3: 接入 `AdjustView`**

把 import 改成：

```tsx
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { GenerationRecord } from "../api";
import ImageViewer from "./ImageViewer";
```

在 `imageFailed` 后加入：

```tsx
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string } | null>(null);
```

在 `const image = recordImage(record);` 后加入：

```tsx
  const baseImageLabel = `${baseLabel} ${artworkLabel}`;
```

把调整页图片 `<img ... />` 替换为：

```tsx
          <button
            className="adjust-base-open surface-clear-button"
            type="button"
            aria-label={`查看${baseImageLabel}`}
            onClick={() => setViewerImage({ src: image, alt: baseImageLabel })}
          >
            <img
              className="adjust-base-image"
              src={image}
              alt={baseImageLabel}
              onError={() => setImageFailed(true)}
            />
          </button>
```

在 `</section>` 前加入：

```tsx
      {viewerImage ? (
        <ImageViewer src={viewerImage.src} alt={viewerImage.alt} onClose={() => setViewerImage(null)} />
      ) : null}
```

- [ ] **Step 4: 运行测试**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: 所有新增交互测试通过或仅剩样式断言相关失败。

## Task 5: 增加查看器样式

**Files:**
- Modify: `client/src/styles.css`

- [ ] **Step 1: 增加可点击图片按钮样式**

在 `.result-grid img, .image-placeholder` 规则附近加入：

```css
.image-open-button {
  display: block;
  width: 100%;
  min-height: 0;
  padding: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  overflow: hidden;
}

.image-open-button:focus-visible,
.adjust-base-open:focus-visible {
  outline: 2px solid rgba(43, 88, 71, 0.72);
  outline-offset: 3px;
}

.image-open-button img {
  display: block;
}

.image-open-button.compact-result-media {
  aspect-ratio: 1 / 1;
}
```

- [ ] **Step 2: 增加调整页图片按钮样式**

在 `.adjust-base-image` 附近加入：

```css
.adjust-base-open {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  color: inherit;
  overflow: hidden;
}
```

- [ ] **Step 3: 增加全屏查看器样式**

在 dialog 相关样式前加入：

```css
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: calc(12px + env(safe-area-inset-top)) 12px calc(16px + env(safe-area-inset-bottom));
  background: rgba(15, 24, 21, 0.92);
  color: #fffaf0;
}

.image-viewer-back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(255, 250, 240, 0.12);
  color: #fffaf0;
  box-shadow: inset 0 0 0 1px rgba(255, 250, 240, 0.2);
}

.image-viewer-stage {
  display: grid;
  min-height: 0;
  place-items: center;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

.image-viewer-stage.dragging {
  cursor: grabbing;
}

.image-viewer-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center;
  user-select: none;
  will-change: transform;
}

.image-viewer-error {
  display: grid;
  min-width: min(100%, 260px);
  min-height: 120px;
  place-items: center;
  padding: 18px;
  border-radius: 8px;
  background: rgba(255, 250, 240, 0.12);
  text-align: center;
}

.image-viewer-controls {
  justify-self: center;
  display: inline-grid;
  grid-template-columns: repeat(3, 44px);
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(255, 250, 240, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 250, 240, 0.18);
}

.image-viewer-controls button {
  display: grid;
  width: 44px;
  height: 44px;
  min-height: 44px;
  place-items: center;
  padding: 0;
  border-radius: 8px;
  background: rgba(255, 250, 240, 0.9);
  color: #20352e;
}
```

- [ ] **Step 4: 运行样式相关测试**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: PASS。

## Task 6: 补充滚轮和 Escape 测试

**Files:**
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 在作品图查看器测试中增加滚轮和 Escape 断言**

在 `opens and closes the artwork image viewer from the result page` 测试中，点击“缩小”之后、点击“返回”之前加入：

```tsx
    const wheelViewer = screen.getByRole("dialog", { name: "作品图" });
    const wheelViewerScope = within(wheelViewer);
    fireEvent.wheel(wheelViewer.querySelector(".image-viewer-stage") as Element, {
      deltaY: -100
    });
    expect(wheelViewerScope.getByRole("img", { name: "作品图" })).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.25)"
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "作品图" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看作品图" }));
```

- [ ] **Step 2: 运行测试**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: PASS。

## Task 7: 最终验证

**Files:**
- Verify only.

- [ ] **Step 1: 运行前端测试**

Run:

```powershell
npm test --workspace client
```

Expected: PASS。

- [ ] **Step 2: 判断是否需要 e2e**

如果实现只新增固定全屏覆盖层和局部按钮样式，没有改变结果页网格、移动滚动、底部导航或路由，记录为不运行 `npm run e2e`，原因是覆盖范围已由前端组件测试验证。  
如果实现改到了 `.result-grid` 布局、`.main-surface` 滚动、`.bottom-tabs` 或路由行为，则运行：

```powershell
npm run e2e
```

Expected: PASS。

## 自检记录

- Spec 覆盖：
  - 结果页作品图：Task 1、Task 3。
  - 结果页效果图：Task 1、Task 3。
  - 调整作品页基准图：Task 4。
  - 左上角返回：Task 2、Task 5。
  - 底部缩放控件：Task 2、Task 5。
  - 滚轮缩放、拖动平移、Escape：Task 2、Task 6。
  - 不改 URL/后端：文件结构和 Task 7 限定。
- 占位扫描通过。
- 类型一致性：查看状态统一为 `{ src: string; alt: string } | null`，组件 props 统一为 `src`、`alt`、`onClose`。
- Git 说明：项目规则禁止自动 git 操作，因此本计划没有 worktree 或 commit 步骤。
