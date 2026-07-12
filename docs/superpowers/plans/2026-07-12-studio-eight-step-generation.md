# Studio Eight-Step Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count the final custom-notes generation screen as an independent eighth Studio step while keeping photo and complexity selection together as step seven.

**Architecture:** Extend the existing progress helper with a UI-stage input derived from `Studio`'s current render state. Keep the existing draft, routing, navigation, and generation payload unchanged; only progress calculation and its observable tests change.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Playwright

---

## File Structure

- Modify `client/src/components/Studio.tsx`: define the progress-stage type, calculate stage-aware progress, and pass the current rendered stage to the helper.
- Modify `client/tests/app.test.tsx`: add focused failing behavior tests and update existing progress assertions for standard and classic paths.
- Modify `e2e/inkspire.spec.ts`: update browser-visible progress assertions and add step-seven/step-eight coverage to the existing flow helpers.

### Task 1: Specify the eight-step progress behavior

**Files:**
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: Add focused failing assertions for the no-photo path**

In the existing test that verifies complexity selection after skipping the photo, assert that both the photo screen and complexity screen remain on step seven, then assert that the notes screen becomes step eight:

```tsx
await completePaintingQuestions(user);
expect(screen.getByText('第 3 / 4 步')).toBeInTheDocument();

await user.click(screen.getByRole('button', { name: '不需要效果图，直接生成' }));
expect(screen.getByText('第 3 / 4 步')).toBeInTheDocument();

await user.click(screen.getByRole('button', { name: /繁密/ }));
expect(screen.getByText('第 4 / 4 步')).toBeInTheDocument();
```

The fixture has one branch question, so its four steps correspond to work type, branch question, photo/complexity, and notes.

- [ ] **Step 2: Add focused failing assertions for the photo path**

In the environment-photo test, prove that accepting a photo moves directly from step seven to step eight without showing complexity:

```tsx
await completePaintingQuestions(user);
expect(screen.getByText('第 3 / 4 步')).toBeInTheDocument();

await user.upload(
  screen.getByLabelText('相册'),
  new File(['sample'], 'sample.png', { type: 'image/png' }),
);
await screen.findByText('已提供环境图片，将用于生成效果图。');
await user.click(screen.getByRole('button', { name: '继续' }));

expect(screen.getByText('第 4 / 4 步')).toBeInTheDocument();
expect(screen.queryByRole('heading', { name: '希望画面如何安排疏密？' })).not.toBeInTheDocument();
```

- [ ] **Step 3: Add classic-path final-step coverage**

Extend the classic generation test after selecting the artwork:

```tsx
expect(screen.getByText('第 3 / 4 步')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '不需要效果图，直接生成' }));
expect(screen.getByText('第 3 / 4 步')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /均衡/ }));
expect(screen.getByText('第 4 / 4 步')).toBeInTheDocument();
```

- [ ] **Step 4: Update existing progress expectations to the approved totals**

Apply these mechanical expectation changes without changing unrelated test behavior:

```text
Fixture standard path photo:      第 3 / 3 步 -> 第 3 / 4 步
Fixture second branch question:   第 3 / 4 步 -> 第 3 / 5 步
Classic picker:                   第 2 / 3 步 -> 第 2 / 4 步
Classic photo:                    第 3 / 3 步 -> 第 3 / 4 步
```

- [ ] **Step 5: Run the focused client test and verify RED**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: FAIL only on the new progress expectations because `getProgressLabel` still reports the previous totals and cannot distinguish notes from photo/complexity.

### Task 2: Implement stage-aware progress calculation

**Files:**
- Modify: `client/src/components/Studio.tsx:300`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: Define the progress stage and extend the helper signature**

Add a local stage type near the progress helpers and preserve `questions` as the default for direct callers:

```tsx
type StudioProgressStage = 'questions' | 'photo' | 'complexity' | 'notes';

export function getProgressLabel(
  config: PublicConfig,
  answers: Answers,
  locale: Locale,
  stage: StudioProgressStage = 'questions',
): string {
```

- [ ] **Step 2: Implement the approved standard-path calculation**

Replace the complete-flow portion of `getProgressLabel` with stage-aware calculation:

```tsx
const penultimateStep = 1 + questionsForAnswers(config, answers).length + 1;
const total = penultimateStep + 1;
const currentQuestion = nextQuestion(config, answers);
const branchQuestions = questionsForAnswers(config, answers);
const step = currentQuestion
  ? branchQuestions.findIndex((item) => item.id === currentQuestion.id) + 2
  : stage === 'notes'
    ? total
    : penultimateStep;
return progressLabel(step, total, locale);
```

This keeps photo and complexity on the penultimate step and reserves the final step for notes.

- [ ] **Step 3: Apply the same rule to the classic path**

Update classic progress before the standard-path calculation:

```tsx
if (isChoosingClassicReference(answers)) {
  return progressLabel(2, 4, locale);
}
if (isClassicReferenceComplete(answers)) {
  return progressLabel(stage === 'notes' ? 4 : 3, 4, locale);
}
```

- [ ] **Step 4: Derive the current visible stage in `Studio`**

After the existing `showPhotoStep`, `showComplexityStep`, and `showConversationStep` values, add:

```tsx
const progressStage: StudioProgressStage = showPhotoStep
  ? 'photo'
  : showComplexityStep
    ? 'complexity'
    : showConversationStep
      ? 'notes'
      : 'questions';
```

Pass it to the toolbar helper:

```tsx
<span>{getProgressLabel(config, answers, locale, progressStage)}</span>
```

- [ ] **Step 5: Run the focused client test and verify GREEN**

Run:

```powershell
npm test --workspace client -- app.test.tsx
```

Expected: PASS with all `app.test.tsx` tests green.

- [ ] **Step 6: Review the implementation for unnecessary state or routing changes**

Confirm the diff does not add a draft field, alter `photoStepComplete`, alter `complexityStepComplete`, or change `step=photo`, `step=complexity`, and `step=notes` navigation.

### Task 3: Align browser coverage and verify the changed surface

**Files:**
- Modify: `e2e/inkspire.spec.ts`
- Test: `e2e/inkspire.spec.ts`

- [ ] **Step 1: Update existing browser progress totals**

Change the classic picker expectation from `第 2 / 3 步` to `第 2 / 4 步`, and both full-config question expectations from `第 3 / 7 步` to `第 3 / 8 步`.

- [ ] **Step 2: Assert step seven and step eight in the reusable full painting flow**

At the end of `completePaintingFlow`, add:

```tsx
await expect(page.getByText('第 7 / 8 步')).toBeVisible();
```

At the end of `addPhotoAndContinue`, add:

```tsx
await expect(page.getByText('第 8 / 8 步')).toBeVisible();
```

At the end of `continueToNotesWithoutPhoto`, add:

```tsx
await expect(page.getByText('第 8 / 8 步')).toBeVisible();
```

Before selecting `均衡` in `continueToNotesWithoutPhoto`, assert that the complexity screen still shows `第 7 / 8 步`.

- [ ] **Step 3: Run client tests**

Run:

```powershell
npm test --workspace client
```

Expected: PASS with no new warnings or failures.

- [ ] **Step 4: Run client type checking**

Run:

```powershell
npm run typecheck --workspace client
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Validate Playwright test discovery**

Run:

```powershell
npx playwright test --list
```

Expected: PASS and list the existing Inkspire browser scenarios without syntax or discovery errors.

- [ ] **Step 6: Run the changed browser scenarios when the managed ports are available**

Run:

```powershell
npm run e2e
```

Expected: PASS. If the managed stack reports a port conflict, report the occupied port as an environment blocker rather than changing application behavior.

- [ ] **Step 7: Check patch integrity**

Run:

```powershell
git diff --check -- client/src/components/Studio.tsx client/tests/app.test.tsx e2e/inkspire.spec.ts
git diff --stat -- client/src/components/Studio.tsx client/tests/app.test.tsx e2e/inkspire.spec.ts
```

Expected: no whitespace errors and a focused three-file implementation diff, while preserving all unrelated pre-existing worktree changes.
