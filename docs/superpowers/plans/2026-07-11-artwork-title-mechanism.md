# Artwork Title Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every classic reference five bespoke titles and apply current-collection Chinese ordinal de-duplication to classic, free-painting, and calligraphy generations.

**Architecture:** Curated classic titles live beside the existing classic-artwork curation source and flow through the existing manifest builders into shared config. `server/src/jobs.js` remains the single title owner: it resolves trusted classic candidates from `classic_artwork_id`, calculates one deterministic base for free painting or calligraphy, and applies a shared smallest-available Chinese ordinal collision resolver against kept titles.

**Tech Stack:** Node.js 20+, CommonJS server, ESM curation scripts, SQLite storage, `node:test`, Supertest.

---

### Task 1: Define collision behavior with failing server tests

**Files:**
- Modify: `server/tests/app.test.js:261-325`
- Modify: `server/tests/jobs.test.js:392-458`

- [ ] **Step 1: Replace the free-painting pool-rotation expectation with ordinal expectations**

Update the same-user API test to create the same deterministic painting three times and assert:

```js
assert.equal(secondRecord.body.title, `${firstRecord.body.title} 其一`);
assert.equal(thirdRecord.body.title, `${firstRecord.body.title} 其二`);
```

Keep the existing cross-user assertion that another user can receive the unsuffixed base title.

- [ ] **Step 2: Add current-collection and smallest-gap assertions**

Seed kept records with a base title plus `其一` and `其三`, generate the same work, and assert the new title is `其二`. Mark the unsuffixed source record `favorite: false`, generate again, and assert the unsuffixed title is reusable because removed records do not occupy names.

- [ ] **Step 3: Add a calligraphy duplicate regression test**

Generate the same full calligraphy text three times for one user and assert the stored titles are the original text, `<text> 其一`, and `<text> 其二` without truncating the submitted text.

- [ ] **Step 4: Run focused tests and verify RED**

Run `node --test --test-name-pattern "title|calligraphy" tests/app.test.js tests/jobs.test.js` from `server/`.

Expected: failures showing the current implementation rotates to other pool titles and emits the old Arabic ordinal format instead of `其一` / `其二`.

### Task 2: Implement shared Chinese ordinal collision resolution

**Files:**
- Modify: `server/src/jobs.js:184-235`
- Modify: `server/src/jobs.js:402-412`

- [ ] **Step 1: Add integer-to-Chinese conversion owned by title generation**

Add a private helper that supports positive values through at least 9999 and produces canonical forms such as `一`, `十`, `十一`, `二十`, and `一百零一`. It must reject non-positive or non-integer input rather than silently producing a title.

- [ ] **Step 2: Replace candidate rotation as the general duplicate strategy**

Add a private resolver with this contract:

```js
function titleAvailableInCollection(baseTitle, usedTitles) {
  if (!usedTitles.has(baseTitle)) return baseTitle;
  for (let ordinal = 1; ; ordinal += 1) {
    const candidate = `${baseTitle} 其${chineseInteger(ordinal)}`;
    if (!usedTitles.has(candidate)) return candidate;
  }
}
```

Free painting uses `paintingTitleFromAnswers(answers)` as its single base. Calligraphy uses the complete submitted text. Both pass that base through the same resolver whenever a user-scoped kept-title query is available.

- [ ] **Step 3: Preserve the legacy no-user fallback**

When no user ID or no `listKeptRecordTitles` implementation is available, return `titleFromRequest(type, answers)` unchanged so immediate legacy and isolated test paths retain their existing behavior.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command again and expect all selected tests to pass.

### Task 3: Add 500 curated classic-reference titles to the source of truth

**Files:**
- Create: `scripts/classic-artwork-titles.mjs`
- Modify: `scripts/classic-artwork-curation.mjs`
- Modify: `scripts/apply-classic-artwork-curation.mjs`
- Modify: `scripts/build-classic-artworks.mjs`
- Modify: `scripts/validate-classic-artworks.mjs`
- Modify: `server/tests/config.test.js:145-175`
- Regenerate: `config/classic-artworks.json`

- [ ] **Step 1: Write failing config and validator expectations**

For every loaded artwork, assert `new_artwork_titles` is an array of five trimmed non-empty strings. Accumulate all 500 values and assert the set size is 500. Extend the CLI validator with the same constraints and record-specific failure messages.

- [ ] **Step 2: Run validation tests and verify RED**

Run `node --test tests/config.test.js` from `server/`, then run `npm run validate:classic-artworks` from the repository root.

Expected: both checks fail because `new_artwork_titles` is absent.

- [ ] **Step 3: Author the curated title map**

Create `scripts/classic-artwork-titles.mjs` exporting `newArtworkTitlesByObjectId`, a `Map` keyed by each of the 100 Metropolitan object IDs already used by `curationByObjectId`. Every value is an ordered array of five concise Chinese artwork names derived from that record's curated title and description. All 500 strings must be globally unique and must not use mechanical source-title suffixes.

- [ ] **Step 4: Join titles into curation records**

Import the map into `classic-artwork-curation.mjs`; while creating `curationByObjectId`, require a five-title entry for each object ID and expose it as `newArtworkTitles`. Add an import-time size check requiring exactly 100 map entries.

- [ ] **Step 5: Propagate titles through both manifest owners**

In both `recordFromObject()` and `apply-classic-artwork-curation.mjs`, write:

```js
new_artwork_titles: [...curation.newArtworkTitles]
```

Do not alter image downloads or asset paths.

- [ ] **Step 6: Regenerate only manifest metadata**

Run `node scripts/apply-classic-artwork-curation.mjs`.

Expected: the existing 100-record manifest is rewritten with curated metadata and five titles per record, without downloading artwork assets.

- [ ] **Step 7: Run validation tests and verify GREEN**

Run both commands from Step 2 and expect success with 100 records and 500 globally unique titles.

### Task 4: Select classic titles and suffix after all five are occupied

**Files:**
- Modify: `server/tests/jobs.test.js`
- Modify: `server/src/jobs.js:200-235`
- Modify: `server/src/jobs.js:402-412`

- [ ] **Step 1: Add a failing classic sequence test**

Create a test config containing a trusted classic artwork with:

```js
new_artwork_titles: ["溪山清韵", "云壑松声", "烟岚归舟", "松风入画", "远水含光"]
```

For one user, create six works using the same `classic_artwork_id`. Assert the titles are the five values in order, followed by `溪山清韵 其一`. Use the existing classic-reference fixture pattern so the test exercises the real trusted-config lookup.

- [ ] **Step 2: Run the classic test and verify RED**

Run `node --test --test-name-pattern "classic.*title" tests/jobs.test.js` from `server/`.

Expected: failure because the current title generator ignores `classic_artwork_id` and `new_artwork_titles`.

- [ ] **Step 3: Resolve trusted classic candidates**

When `answers.creation_mode === "classic_reference"`, find the matching entry in `config.classicArtworks` by `answers.classic_artwork_id`. Use only a valid five-string `new_artwork_titles` array from trusted config. Return the first candidate whose exact title is absent from kept titles; when all five are occupied, pass the first candidate to the shared collision resolver.

- [ ] **Step 4: Keep malformed-config fallback local**

If the trusted entry is absent or its candidate array is invalid, fall back to the normal painting base plus collision resolution. Do not accept a candidate list from request answers.

- [ ] **Step 5: Run classic and general title tests and verify GREEN**

Run `node --test --test-name-pattern "classic.*title|painting title|calligraphy title" tests/jobs.test.js` from `server/`.

Expected: all selected tests pass.

### Task 5: Full verification and diff audit

**Files:**
- Verify all files changed in Tasks 1-4

- [ ] **Step 1: Run the complete server suite**

Run `npm test --workspace server` and expect zero failures.

- [ ] **Step 2: Validate generated classic-artwork data**

Run `npm run validate:classic-artworks` and expect validation to succeed for exactly 100 records and 500 globally unique new-work titles.

- [ ] **Step 3: Run repository integrity checks**

Run `git diff --check` and `git status --short`. Confirm no image assets were regenerated, no unrelated working changes were reverted, and changes remain limited to title logic, tests, curation metadata, manifest propagation, and the approved docs.

- [ ] **Step 4: Review the implementation against the design**

Re-read `docs/superpowers/specs/2026-07-11-artwork-title-mechanism-design.md` and confirm every goal, non-goal, compatibility rule, trusted-data boundary, and test requirement is represented in the final diff.

Because overlapping curation files already contain user changes in this checkout, do not create implementation commits that would capture unrelated work. Preserve the working tree for user review.
