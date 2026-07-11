# Independent Tab Scroll Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve independent vertical scroll positions for Studio, Library, and Artisans across tab switches, browser history navigation, and refreshes within the current browser-tab session.

**Architecture:** Add a focused storage module that validates and persists a three-tab position map in `sessionStorage`. Keep runtime ownership in `App`, where the shared `.main-surface` is available: scroll events update the active tab, layout effects save the outgoing tab and restore the incoming tab before paint, and a pending restore retries once tab content becomes ready.

**Tech Stack:** React 18, TypeScript, React Router, Vitest/Testing Library, Playwright

---

### Task 1: Define and test session scroll storage

**Files:**
- Create: `client/src/tabScrollPosition.ts`
- Create: `client/tests/tabScrollPosition.test.ts`

- [ ] **Step 1: Write failing storage tests**

Cover an empty store, a valid round trip, partial/corrupt data, negative numbers, `NaN`-like values, and independence between `studio`, `library`, and `experts`.

```ts
expect(readTabScrollPositions()).toEqual({ studio: 0, library: 0, experts: 0 });
writeTabScrollPositions({ studio: 120, library: 340, experts: 560 });
expect(readTabScrollPositions()).toEqual({ studio: 120, library: 340, experts: 560 });
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx vitest run tests/tabScrollPosition.test.ts`

Expected: FAIL because `tabScrollPosition.ts` does not exist.

- [ ] **Step 3: Implement validated session storage**

Export `TAB_SCROLL_POSITIONS_KEY`, `TabScrollPositions`, `createEmptyTabScrollPositions`, `readTabScrollPositions`, and `writeTabScrollPositions`. Accept only finite non-negative numbers and fall back per field to `0`; return defaults when `window` or storage access is unavailable.

- [ ] **Step 4: Run the storage test and verify GREEN**

Run: `npx vitest run tests/tabScrollPosition.test.ts`

Expected: all storage tests pass.

### Task 2: Preserve the shared main surface position per tab

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: Write failing application tests**

Add one test that assigns distinct `scrollTop` values while switching Studio → Library → Artisans → Studio → Library → Artisans and asserts `120`, `240`, and `360` are restored. Add another test that seeds `sessionStorage`, mounts `/experts`, and asserts the main surface restores the stored Artisans value.

```ts
const surface = container.querySelector<HTMLElement>(".main-surface")!;
surface.scrollTop = 120;
fireEvent.scroll(surface);
await user.click(screen.getByRole("button", { name: "藏卷" }));
expect(surface.scrollTop).toBe(0);
```

- [ ] **Step 2: Run focused app tests and verify RED**

Run: `npx vitest run tests/app.test.tsx -t "scroll position"`

Expected: FAIL because every tab currently inherits the shared surface's last `scrollTop` and refresh does not read scroll storage.

- [ ] **Step 3: Implement App-owned save and restore**

Import `useLayoutEffect` and the storage helpers. Add a `mainSurfaceRef`, a positions ref initialized from `sessionStorage`, an active rendered-tab ref, a pending restore ref, and an applying-scroll guard. On scroll, persist the active tab unless a programmatic restoration is in progress. In a layout effect, save the outgoing tab, mark the incoming saved position pending, and set `scrollTop` before paint. Retry a still-pending Library restore when `library.length` changes, and an Artisans restore when `config.experts.length` changes; clear the pending restore once the requested position is reached or the user scrolls.

- [ ] **Step 4: Run focused app tests and verify GREEN**

Run: `npx vitest run tests/app.test.tsx -t "scroll position"`

Expected: both independent-tab and refresh restoration tests pass.

### Task 3: Verify real browser behavior

**Files:**
- Modify: `e2e/inkspire.spec.ts`

- [ ] **Step 1: Add a failing E2E scenario**

At `390×844`, install a test-only minimum-height rule for the three tab roots, set distinct real `.main-surface.scrollTop` values, switch among all three tabs, and assert each value is restored. On Artisans, reload after storing its position and assert the position survives while `localStorage` does not contain the scroll key.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run: `npm run e2e -- --grep "independent scroll positions"`

Expected: FAIL because the shared surface carries one position across all tabs and no session scroll map exists.

- [ ] **Step 3: Make only test-stability adjustments required by real layout**

Keep production behavior unchanged. If browser rounding differs, compare scroll positions with a tolerance of `2px`; do not weaken the independence or refresh assertions.

- [ ] **Step 4: Run the focused E2E and verify GREEN**

Run: `npm run e2e -- --grep "independent scroll positions"`

Expected: Chromium, Firefox, and WebKit pass.

### Task 4: Full verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run the complete client suite**

Run: `npm test --workspace client`

Expected: all client tests pass.

- [ ] **Step 2: Run typecheck and production build**

Run: `npm run build --workspace client`

Expected: TypeScript and Vite build exit successfully.

- [ ] **Step 3: Run the complete E2E suite**

Run: `npm run e2e`

Expected: all Playwright tests pass.

- [ ] **Step 4: Check patch hygiene**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the planned source, tests, spec, and plan files are changed.
