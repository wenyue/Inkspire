# Shared Dialog and Artwork Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a reusable modal dialog shell, migrate the production flow to it, and present artwork adjustment in the same modal without a current-artwork preview.

**Architecture:** A business-agnostic `Dialog` owns overlay rendering, dialog semantics, close controls, focus containment/restoration, Escape handling, and the body class that hides bottom navigation. `ProductionDialog` and `AdjustView` keep their own state and content while composing that shell. `App.tsx` continues to own routes and adjustment submission data.

**Tech Stack:** React 18, TypeScript, Lucide React, Vitest, Testing Library, CSS.

**Working-tree constraint:** The current checkout contains pre-existing staged and unstaged changes in target files. Preserve them, edit only the named behavior, and do not create implementation commits that could capture unrelated work.

---

## File Map

- Create `client/src/components/Dialog.tsx`: reusable modal shell and accessibility behavior.
- Create `client/src/components/Dialog.test.tsx`: dialog semantics, keyboard, and focus tests.
- Modify `client/src/components/ProductionDialog.tsx`: compose `Dialog` and remove duplicate shell behavior.
- Modify `client/src/components/AdjustView.tsx`: compose `Dialog` and retain only the adjustment form.
- Modify `client/src/components/AdjustView.test.tsx`: replace artwork-frame coverage with modal/form coverage.
- Modify `client/src/App.tsx`: reduce adjustment props and mount the adjustment overlay above its result.
- Modify `client/tests/app.test.tsx`: cover route-level modal behavior and remove obsolete adjust-viewer tests.
- Modify `client/src/styles.css`: add shared dialog styles and remove adjustment-preview-only styles.
- Modify `client/tests/mobile-css.test.ts`: update CSS contract assertions.

### Task 1: Build the reusable Dialog shell

**Files:**
- Create: `client/src/components/Dialog.test.tsx`
- Create: `client/src/components/Dialog.tsx`
- Modify: `client/src/styles.css`

- [ ] **Step 1: Write failing Dialog behavior tests**

Use this harness:

```tsx
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      {open ? (
        <Dialog title="Shared dialog" closeLabel="Close dialog" onClose={() => setOpen(false)}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Dialog>
      ) : null}
    </>
  );
}
```

In separate tests, assert dialog semantics and initial focus, Escape close and trigger focus restoration, forward/reverse focus wrapping, and `document.body` receiving/removing `dialog-open`.

```tsx
expect(screen.getByRole("dialog", { name: "Shared dialog" })).toHaveAttribute("aria-modal", "true");
expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
```

- [ ] **Step 2: Run the Dialog test and verify RED**

```powershell
npm test --workspace client -- --run src/components/Dialog.test.tsx
```

Expected: FAIL because `./Dialog` does not exist.

- [ ] **Step 3: Implement the minimal reusable shell**

Use this public interface:

```tsx
interface DialogProps {
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
  onClose: () => void;
}
```

The component must use `useId`, a dialog ref, and a close-button ref. On mount it records the active element, adds `dialog-open`, and focuses close. On unmount it removes the class and restores focus. Its key handler closes on Escape and cycles enabled buttons, links, inputs, selects, textareas, and explicit non-negative tab stops.

Render `.dialog-layer.shared-dialog-layer`, `.shared-dialog`, `.shared-dialog-header`, `.shared-dialog-body`, and optional `.shared-dialog-footer`, merging modifier classes.

- [ ] **Step 4: Add shared CSS**

```css
.shared-dialog-layer {
  padding: max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom));
}

.dialog-open .bottom-tabs {
  display: none;
}

.shared-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(100%, 520px);
  max-height: 100%;
  overflow: hidden;
  padding: 16px;
  border-radius: 8px;
  background: #fffaf0;
  box-shadow: 0 24px 70px rgba(24, 39, 33, 0.28);
}

.shared-dialog-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

- [ ] **Step 5: Run the Dialog test and verify GREEN**

```powershell
npm test --workspace client -- --run src/components/Dialog.test.tsx
```

Expected: PASS with no React warnings.

### Task 2: Migrate ProductionDialog to the shared shell

**Files:**
- Modify: `client/src/components/ProductionDialog.tsx`
- Modify: `client/tests/app.test.tsx`
- Modify: `client/src/styles.css`

- [ ] **Step 1: Strengthen production integration coverage**

In the existing production-dialog scenario, add:

```tsx
const dialog = await screen.findByRole("dialog", { name: "制作作品" });
expect(dialog).toHaveClass("shared-dialog", "production-dialog");
expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
expect(document.body).toHaveClass("dialog-open");
```

Close via Escape, then assert the result actions return and `dialog-open` is removed.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "opens the production dialog"
```

Expected: FAIL because production still owns `production-dialog-open` and lacks the shared class.

- [ ] **Step 3: Compose Dialog from ProductionDialog**

Import `Dialog`. Replace the outer layer, section, header, body, and footer with:

```tsx
<Dialog
  title={page === "size" ? localizedAdjustSizeTitle : order ? successTitleLabel : title}
  closeLabel={closeLabel}
  className="production-dialog"
  bodyClassName="production-dialog-body"
  footerClassName="production-dialog-footer"
  footer={page === "main" && !order && productionOpen ? productionFooter : undefined}
  onClose={onClose}
>
  {productionBody}
</Dialog>
```

Keeping existing body branches inline is acceptable. Remove `KeyboardEvent`, `useId`, dialog/close refs, `onDialogKeyDown`, focus restoration, and the `production-dialog-open` effect. Preserve copy-toast cleanup in its own unmount effect.

- [ ] **Step 4: Run production coverage and verify GREEN**

```powershell
npm test --workspace client -- --run tests/app.test.tsx -t "production"
```

Expected: all production-filtered tests PASS.

### Task 3: Convert AdjustView into a dialog and remove the artwork preview

**Files:**
- Modify: `client/src/components/AdjustView.test.tsx`
- Modify: `client/src/components/AdjustView.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`
- Modify: `client/src/styles.css`
- Modify: `client/tests/mobile-css.test.ts`

- [ ] **Step 1: Replace the image test with failing modal/form tests**

Render the desired reduced interface:

```tsx
<AdjustView
  title="调整这张作品"
  intro="描述调整方向"
  placeholder="请输入调整方向"
  submitLabel="生成新作品"
  submittingLabel="生成中"
  closeLabel="返回作品"
  clearLabel="清空"
  suggestions={["留白更多"]}
  onClose={onClose}
  onSubmit={onSubmit}
/>
```

Assert the named dialog exists, contains no image and no “当前作品”, starts with submit disabled, copies and clears a suggestion, trims typed input before submit, and calls `onClose` from the close button.

- [ ] **Step 2: Run the component test and verify RED**

```powershell
npm test --workspace client -- --run src/components/AdjustView.test.tsx
```

Expected: FAIL because current props and page rendering do not match the desired dialog.

- [ ] **Step 3: Implement the minimal AdjustView dialog**

Use this interface:

```tsx
interface AdjustViewProps {
  title: string;
  intro: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel: string;
  closeLabel: string;
  clearLabel: string;
  suggestions: string[];
  isSubmitting?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}
```

Render the intro, textarea, clear button, suggestions, submit button, and error inside `Dialog`. Put submit/error in `footer`. Delete the record/image helper and state, `ArtworkFrame`, `ImageViewer`, `GenerationRecord`, `artworkFormatClass`, image labels, translator prop, and textarea mount-focus effect.

- [ ] **Step 4: Keep the result mounted beneath the overlay in App**

Pass `closeLabel={t("adjust.back")}` and `onClose={navigateBack}`. Remove deleted props. Define:

```tsx
const adjustDialog = currentRecord && adjustOpen ? <AdjustView ... /> : null;
const recordView = recordRoute && activeTab !== "studio" && recordViewOpen ? resultSlot : null;
```

Render `{adjustDialog}` beside `ProductionDialog` at the end of `.app-shell`, leaving `resultSlot` mounted in Studio or Library beneath it.

- [ ] **Step 5: Replace obsolete app viewer scenarios with modal routing coverage**

Delete the two adjust-image-viewer tests. Extend adjust-open/back coverage:

```tsx
const dialog = screen.getByRole("dialog", { name: "调整这张作品" });
expect(dialog).toHaveClass("shared-dialog", "adjust-dialog");
expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "制作作品" })).toBeInTheDocument();
expect(document.body).toHaveClass("dialog-open");
fireEvent.keyDown(dialog, { key: "Escape" });
await waitFor(() => expect(screen.queryByRole("dialog", { name: "调整这张作品" })).not.toBeInTheDocument());
expect(window.location.pathname).toBe("/records/record-1");
```

Keep existing adjustment submission-body assertions unchanged.

- [ ] **Step 6: Update adjustment CSS and CSS contract tests**

Replace `.adjust-view` page layout with `.adjust-dialog`, `.adjust-dialog-body`, and `.adjust-dialog-footer`. Keep form selectors. Remove selectors used only by the deleted preview and toolbar. Update `mobile-css.test.ts` to require `.dialog-open .bottom-tabs` and shared-dialog safe-area styling instead of the production-only body class.

- [ ] **Step 7: Run adjustment tests and verify GREEN**

```powershell
npm test --workspace client -- --run src/components/AdjustView.test.tsx tests/app.test.tsx -t "adjust"
npm test --workspace client -- --run tests/mobile-css.test.ts
```

Expected: all adjustment-filtered and CSS contract tests PASS.

### Task 4: Verify the integrated client behavior

**Files:**
- Verify all files listed in the file map.

- [ ] **Step 1: Run focused component and integration coverage**

```powershell
npm test --workspace client -- --run src/components/Dialog.test.tsx src/components/AdjustView.test.tsx tests/app.test.tsx tests/mobile-css.test.ts
```

Expected: all selected test files PASS with zero failures.

- [ ] **Step 2: Run the complete client suite**

```powershell
npm test --workspace client -- --run
```

Expected: all client tests PASS with zero failures.

- [ ] **Step 3: Run the client production build**

```powershell
npm run build --workspace client
```

Expected: TypeScript and Vite exit successfully.

- [ ] **Step 4: Check patch hygiene and scope**

```powershell
git diff --check
git status --short
git diff -- client/src/components/Dialog.tsx client/src/components/Dialog.test.tsx client/src/components/ProductionDialog.tsx client/src/components/AdjustView.tsx client/src/components/AdjustView.test.tsx client/src/App.tsx client/tests/app.test.tsx client/src/styles.css client/tests/mobile-css.test.ts
```

Expected: no whitespace errors, and the task diff contains only shared-dialog extraction, production migration, adjustment modal changes, and tests while preserving unrelated changes.
