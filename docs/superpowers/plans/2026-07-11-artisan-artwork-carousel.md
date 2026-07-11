# Artisan Artwork Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all price language from the Artisans screen and present every expert artwork in a polished, responsive, single-row horizontal gallery.

**Architecture:** Keep pricing data and production-dialog behavior unchanged, while narrowing the `Experts` component API to Artisans-only labels. Use semantic list markup and CSS flexbox with scroll snapping so compact screens show exactly two cards and wide screens show more without wrapping.

**Tech Stack:** React 18, TypeScript, CSS, Vitest/Testing Library, Playwright

---

### Task 1: Lock the Artisans component contract with failing tests

**Files:**
- Modify: `client/src/components/Experts.test.tsx`
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: Write the failing component test**

Remove the obsolete `expectationLabel` prop from test renders, add `credentialsLabel="专业资历"`, supply four sample images, and assert that the named list contains four list items while price-related text is absent.

```tsx
expect(screen.getByRole("list", { name: "代表作品" })).toBeInTheDocument();
expect(screen.getAllByRole("listitem", { name: /代表作品/ })).toHaveLength(4);
expect(screen.queryByText(/价格|金额|费用|报价|估算/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Write the failing application test**

Replace the old amount disclaimer assertion with the approved service-boundary copy and assert the Artisans panel does not contain price language.

```tsx
expect(screen.getByText("服务范围、修改轮次与交付时间均以承接确认单为准。")).toBeInTheDocument();
expect(screen.getByRole("region", { name: "雅匠" })).not.toHaveTextContent(/价格|金额|费用|报价|估算/);
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `npm test --workspace client -- --run src/components/Experts.test.tsx tests/app.test.tsx`

Expected: FAIL because `credentialsLabel` and gallery list semantics do not exist, the fourth image is sliced away, and the old price copy is still rendered.

### Task 2: Remove Artisans price language and add semantic gallery markup

**Files:**
- Modify: `client/src/components/Experts.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/i18n.ts`
- Modify: `config/experts.json`

- [ ] **Step 1: Narrow the component API and markup**

Replace `expectationLabel` with `credentialsLabel`, remove `.expert-pricing-note`, use the credentials label only for the credentials group, and render every sample image as a named list item.

```tsx
<div className="expert-credentials" aria-label={credentialsLabel}>...</div>
<div className="expert-sample-strip" role="list" aria-label={sampleHeading}>
  {expert.sampleImages.map((image, index) => (
    <span className="expert-sample-frame" role="listitem" aria-label={`${sampleHeading} ${index + 1}`} key={image}>
      <img src={image} alt={`${sampleHeading} ${index + 1}`} />
    </span>
  ))}
</div>
```

- [ ] **Step 2: Replace localized Artisans copy**

Add `experts.credentialsLabel` in all three locales, delete `experts.expectation`, and change the boundary copy to only describe scope, revisions, and delivery. Pass `credentialsLabel={t("experts.credentialsLabel")}` from `App.tsx`.

- [ ] **Step 3: Remove price wording from visible service descriptions**

Keep each `priceEstimate` object unchanged, but rewrite the three localized descriptions for `expert_custom` and `expert_guided` to describe only participation and guidance.

- [ ] **Step 4: Run the targeted tests and verify GREEN**

Run: `npm test --workspace client -- --run src/components/Experts.test.tsx tests/app.test.tsx`

Expected: both files pass and the existing production estimate assertions remain green.

### Task 3: Implement the responsive one-row artwork strip

**Files:**
- Modify: `client/src/styles.css`
- Modify: `e2e/inkspire.spec.ts`

- [ ] **Step 1: Strengthen mobile E2E assertions before CSS changes**

For `320×568` and `390×844`, assert the strip has `overflow-x: auto`, `scrollWidth > clientWidth`, all cards share the same top coordinate, and two card widths plus one gap match the strip client width. Add a `900×900` test asserting all three works share one row and fit inside the strip viewport.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run: `npx playwright test e2e/inkspire.spec.ts --grep "authorized works|wide artisan"`

Expected: FAIL because the current two-column grid wraps and does not horizontally scroll.

- [ ] **Step 3: Add the flex strip and visual treatment**

Replace the sample grid with `.expert-sample-strip` using `display: flex`, `flex-wrap: nowrap`, `overflow-x: auto`, `scroll-snap-type: x mandatory`, and an 8px gap. Use `flex: 0 0 calc((100% - 8px) / 2)` by default and, from 680px, a constrained responsive width such as `clamp(180px, 24%, 240px)` so wider layouts can reveal more cards. Add a subtle border/shadow and thin scrollbar styling without placing a background on the image loading surface or changing `object-fit: contain`.

- [ ] **Step 4: Run focused E2E and verify GREEN**

Run: `npx playwright test e2e/inkspire.spec.ts --grep "authorized works|wide artisan"`

Expected: all compact and wide gallery cases pass with no document-level overflow.

### Task 4: Full verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run the complete client test suite**

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

Expected: no whitespace errors; only the planned source, test, config, spec, and plan files are changed.
