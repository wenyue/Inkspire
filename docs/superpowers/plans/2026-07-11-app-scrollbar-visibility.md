# App Scrollbar Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the main vertical scrollbar while preserving scrolling and the existing discoverable artisan artwork scrollbar.

**Architecture:** Keep scrolling ownership on `.main-surface` and change only its scrollbar presentation with standard Firefox and WebKit CSS. Protect the distinction between the hidden main scrollbar and the visible thin artwork scrollbar with a stylesheet regression test.

**Tech Stack:** CSS, Vitest, Playwright, React/Vite build tooling

---

### Task 1: Hide only the main vertical scrollbar

**Files:**
- Modify: `client/tests/mobile-css.test.ts`
- Modify: `client/src/styles.css`

- [ ] **Step 1: Write the failing regression test**

Add this test inside the existing `describe("mobile touch targets", ...)` block:

```ts
it("hides the main scrollbar without disabling scrolling", () => {
  expect(blockFor(".main-surface {")).toContain("scrollbar-width: none");
  expect(blockFor(".main-surface {")).toContain("overflow-y: auto");
  expect(css).toMatch(/\.main-surface::\-webkit-scrollbar\s*{[^}]*display:\s*none/s);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `client/`:

```powershell
npx vitest run tests/mobile-css.test.ts -t "hides the main scrollbar"
```

Expected: FAIL because `.main-surface` does not yet contain `scrollbar-width: none`.

- [ ] **Step 3: Add the minimal cross-browser CSS**

Add `scrollbar-width: none;` to `.main-surface`, then add:

```css
.main-surface::-webkit-scrollbar {
  display: none;
}
```

Do not change `overflow-y: auto`. The artisan scrollbar is verified after integration because its current implementation belongs to pre-existing main-worktree changes that are intentionally absent from this isolated worktree.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run from `client/`:

```powershell
npx vitest run tests/mobile-css.test.ts -t "hides the main scrollbar"
```

Expected: 1 test passed.

- [ ] **Step 5: Run affected verification**

Run from the repository root:

```powershell
npm run test:client -- --run tests/mobile-css.test.ts tests/tabScrollPosition.test.ts
npm run build --workspace client
npm run e2e -- --grep "bottom tabs keep independent scroll positions|phone shows two authorized works|wide artisan gallery"
```

Expected: all selected tests pass and the production build exits with code 0.

- [ ] **Step 6: Commit the implementation**

```powershell
git add client/tests/mobile-css.test.ts client/src/styles.css
git commit -m "style: hide main app scrollbar"
```
