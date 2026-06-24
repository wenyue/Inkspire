# Painting Flow Photo Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make photo selection/camera capture an explicit final Studio step, requiring either upload/capture plus continue or an explicit skip before generation.

**Architecture:** Keep this change inside the existing `Studio` component and draft persistence model. The question flow remains driven by `domain.ts`; `Studio` adds a small UI-only photo step after `isQuestionFlowComplete()` and before the conversation panel. CSS changes reduce mobile question height and avoid persistent scrollbar styling when content fits.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, CSS.

---

## File Map

- Modify `client/src/components/Studio.tsx`: add `photoStepComplete` draft state, render a photo-step card inside the existing scroll question container, update progress/back behavior, and gate the conversation panel behind photo-step completion.
- Modify `client/src/styles.css`: add compact photo-step styles, reduce mobile question spacing, and make the main surface use automatic overflow without always showing a visible scrollbar.
- Modify `client/tests/app.test.tsx`: update obsolete photo-strip tests and add explicit final-step, skip, upload-continue, persistence, and generation payload coverage.
- Read-only reference `docs/superpowers/specs/2026-06-24-painting-flow-photo-step-design.md`: source of accepted behavior.

Commits are intentionally omitted from the implementation tasks because the project design states not to auto-commit implementation work unless explicitly requested.

---

### Task 1: Add Failing Tests For Explicit Photo Step

**Files:**
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: Replace obsolete first-screen photo tests**

Update the tests currently named `places optional photo controls after the question card`, `keeps optional photo controls lightweight on the first screen`, and `keeps branch questions focused by hiding optional photo controls until completion`.

Use these assertions:

```tsx
it("does not show photo controls before the final photo step", async () => {
  const user = userEvent.setup();
  render(<App />);

  await screen.findByRole("button", { name: "国画" });

  expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("拍照")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "跳过" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "国画" }));

  expect(screen.getByText("想画什么主题？")).toBeInTheDocument();
  expect(screen.queryByLabelText("相册")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("拍照")).not.toBeInTheDocument();
});

it("shows photo selection as the final explicit step", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "国画" }));
  await user.click(screen.getByRole("button", { name: "山水" }));

  expect(screen.getByRole("heading", { name: "您想要把作品摆在哪里？" })).toBeInTheDocument();
  expect(screen.getByText("第 3 / 3 步")).toBeInTheDocument();
  expect(screen.getByLabelText("相册")).toBeInTheDocument();
  expect(screen.getByLabelText("拍照")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "跳过" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add skip and upload flow tests**

Add tests near the generation tests:

```tsx
it("requires an explicit photo skip before generating without a photo", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "国画" }));
  await user.click(screen.getByRole("button", { name: "山水" }));

  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "跳过" }));

  expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "生成" }));

  await waitFor(() => {
    expect(generationRequestBodies()).toHaveLength(1);
  });
  expect(generationRequestBodies()[0].source_photo_path).toBe("");
});

it("keeps uploaded photos on the photo step until continuing", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(await screen.findByRole("button", { name: "国画" }));
  await user.click(screen.getByRole("button", { name: "山水" }));
  await user.upload(screen.getByLabelText("相册"), new File(["sample"], "sample.png", { type: "image/png" }));

  expect(await screen.findByText("已提供环境图，将用于生成效果图。")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "已选照片预览" })).toHaveAttribute("src", "blob:photo-preview");
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "继续" }));

  expect(screen.getByRole("button", { name: "生成" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Update existing generation tests to pass through the photo step**

Where a test completes the shortened painting flow with:

```tsx
await user.click(await screen.findByRole("button", { name: "国画" }));
await user.click(screen.getByRole("button", { name: "山水" }));
await user.click(screen.getByRole("button", { name: "生成" }));
```

insert:

```tsx
await user.click(screen.getByRole("button", { name: "跳过" }));
```

For uploaded-photo generation tests, upload on the photo step after the branch question and then click:

```tsx
await user.click(screen.getByRole("button", { name: "继续" }));
```

- [ ] **Step 4: Run focused tests and confirm failure**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected before implementation: failing tests show photo controls missing in the final-step shape or generation button still appears before explicit skip.

---

### Task 2: Implement Photo Step State And Flow

**Files:**
- Modify: `client/src/components/Studio.tsx`

- [ ] **Step 1: Extend draft state**

Add `photoStepComplete?: boolean;` to `StudioDraft` and initialize:

```tsx
const [photoStepComplete, setPhotoStepComplete] = useState(() => readStudioDraft().photoStepComplete ?? false);
```

Include `photoStepComplete` in `writeStudioDraft`.

- [ ] **Step 2: Derive panel state**

Replace the current photo-panel derivation with:

```tsx
const complete = isQuestionFlowComplete(config, answers);
const showPhotoStep = complete && !photoStepComplete;
const showConversationStep = complete && photoStepComplete;
const showCreationPanel = !hasResult || notesFocusRequest > 0;
const isIteratingResult = showConversationStep && notesFocusRequest > 0;
```

Remove `showPhotoPanel`.

- [ ] **Step 3: Update progress helper**

Change `expectedInitialStepTotal` so equal branch totals add both the work-type question and the photo step:

```tsx
.map((total) => total + 2);
```

Change selected-branch total in `getProgressLabel`:

```tsx
const total = 1 + questionsForAnswers(config, answers).length + 1;
```

When no current question remains, return the final photo step:

```tsx
const step = currentQuestion
  ? branchQuestions.findIndex((item) => item.id === currentQuestion.id) + 2
  : total;
```

- [ ] **Step 4: Update back behavior**

At the start of `goBack`, handle conversation and photo states:

```tsx
if (photoStepComplete) {
  setPhotoStepComplete(false);
  setError("");
  return;
}
```

Then keep the existing answer-deletion logic for normal question back.

- [ ] **Step 5: Add photo completion handlers**

Add:

```tsx
const skipPhotoStep = () => {
  setPhotoStepComplete(true);
  setError("");
};

const continueFromPhotoStep = () => {
  if (!sourcePhotoPath) {
    return;
  }
  setPhotoStepComplete(true);
  setError("");
};
```

In `onPhotoChange`, after successful upload, keep `photoStepComplete` false so the user must click continue.

In `removePhoto`, leave `photoStepComplete` false when on the photo step and clear photo data.

In `resetStudioDraft`, call `setPhotoStepComplete(false)`.

- [ ] **Step 6: Render the photo step inside `.scroll-question`**

Inside the card, render three mutually exclusive branches:

```tsx
{question ? (
  existingQuestionMarkup
) : showPhotoStep ? (
  <div className="photo-step">
    <h2>{t("studio.photo")}</h2>
    {isUploading ? <p className="status-line" role="status">{t("studio.uploadingPhoto")}</p> : null}
    {!isUploading && sourcePhotoPath ? (
      <>
        existingSelectedPhotoPanel
        <button className="primary-action" type="button" onClick={continueFromPhotoStep}>
          {continueLabel(locale)}
        </button>
      </>
    ) : null}
    {!isUploading && !sourcePhotoPath ? (
      <div className="photo-step-actions" aria-label={t("studio.photo")}>
        existingAlbumLabel
        existingCameraLabel
        <button className="secondary-action" type="button" onClick={skipPhotoStep}>{t("studio.skipPhoto")}</button>
      </div>
    ) : null}
  </div>
) : (
  existingConversationPanel
)}
```

Move selected-photo markup and upload labels from the removed outer `showPhotoPanel` block into this branch.

- [ ] **Step 7: Keep generation gated**

Leave `generate()` unchanged except it is now only reachable after `photoStepComplete` is true. It should continue sending `source_photo_path: sourcePhotoPath`.

- [ ] **Step 8: Run focused tests**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: photo-flow tests pass or expose only layout/test expectation issues.

---

### Task 3: Compact Mobile Layout And Scroll Styling

**Files:**
- Modify: `client/src/styles.css`

- [ ] **Step 1: Add photo step styles**

Add:

```css
.photo-step {
  display: grid;
  gap: 12px;
}

.photo-step h2 {
  margin: 2px 0 0;
}

.photo-step-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
```

Style `.photo-step-actions label` like the old `.photo-strip label`.

- [ ] **Step 2: Update main surface overflow**

Change:

```css
overflow: auto;
scrollbar-width: thin;
```

to:

```css
overflow-y: auto;
overflow-x: hidden;
scrollbar-gutter: stable;
```

The surface still scrolls when content exceeds available height, but avoids persistent horizontal or visually noisy scrollbars.

- [ ] **Step 3: Add mobile compact rule**

Inside `@media (max-height: 740px) and (max-width: 520px)`, add:

```css
.scroll-question {
  padding: 12px;
}

.question-toolbar {
  margin-bottom: 8px;
}

.preview-ink {
  aspect-ratio: 2 / 1;
}

.scroll-question h2 {
  margin: 12px 0 10px;
  font-size: 20px;
}

.option-grid {
  gap: 8px;
}

.option-grid button {
  min-height: 64px;
  grid-template-columns: 64px minmax(0, 1fr);
}

.option-preview-frame {
  width: 64px;
  height: 50px;
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: focused tests pass.

---

### Task 4: Full Verification

**Files:**
- No source modifications expected.

- [ ] **Step 1: Run client tests**

Run:

```powershell
npm test --workspace client
```

Expected: all client Vitest tests pass.

- [ ] **Step 2: Run full workspace tests**

Run:

```powershell
npm test
```

Expected: all workspace tests pass. If server tests fail for unrelated local environment reasons, record the exact failure.

- [ ] **Step 3: Inspect final diff**

Run:

```powershell
git diff -- client/src/components/Studio.tsx client/src/styles.css client/tests/app.test.tsx
git status --short
```

Expected: implementation files reflect only the photo-step and layout work plus the pre-existing topbar alignment changes.

