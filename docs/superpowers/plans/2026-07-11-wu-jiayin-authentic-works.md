# Wu Jiayin Authentic Works Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Wu Jiayin as an onboarded expert and display three authorized authentic artworks in her profile without attribution or source labels.

**Architecture:** Keep the expert identity and local artwork paths in shared `config/experts.json`, render localized profile data through the existing `Experts` component, and normalize the short-lived platform placeholder ID only at the production-order response boundary. Store optimized WebP files under a dedicated expert asset directory so runtime rendering never depends on an external host.

**Tech Stack:** React 18, strict TypeScript, Vite, Express CommonJS, Vitest, Node test runner, Playwright, Sharp.

---

### Task 1: Lock the real expert contract with failing tests

**Files:**
- Modify: `server/tests/config.test.js`
- Modify: `server/tests/app.test.js`
- Modify: `client/src/components/Experts.test.tsx`

- [x] **Step 1: Change the config expectations to the real expert and local samples**

Replace the placeholder assertions in `server/tests/config.test.js` with:

```js
assert.equal(config.experts[0].id, "wu_jiayin");
assert.equal(config.experts[0].name["zh-Hans"], "吴嘉茵");
assert.equal(config.experts[0].name.en, "Wu Jiayin");
assert.equal(config.experts[0].region["zh-Hant"], "廣東省");
assert.deepEqual(config.experts[0].sampleImages, [
  "/experts/wu-jiayin-listen-to-rain.webp",
  "/experts/wu-jiayin-lotus.webp",
  "/experts/wu-jiayin-long-joy.webp"
]);
for (const image of config.experts[0].sampleImages) {
  assert.ok(fs.existsSync(path.join(root, "client/public", image)));
}
```

Update the public-config assertion to:

```js
assert.equal(exposed.experts[0].name["zh-Hans"], "吴嘉茵");
```

- [x] **Step 2: Change production API expectations to `wu_jiayin`**

In `server/tests/app.test.js`, change current request and response fixtures from `platform_artisan_match` to `wu_jiayin`. In the legacy-order compatibility assertion, write `platform_artisan_match` into `order_json` and expect the response to contain:

```js
assert.equal(legacyLookup.body.order.expert_id, "wu_jiayin");
```

- [x] **Step 3: Replace placeholder component tests with the onboarded profile contract**

Use this expert fixture in `client/src/components/Experts.test.tsx`:

```tsx
experts={[{
  id: "wu_jiayin",
  name: { "zh-Hans": "吴嘉茵", "zh-Hant": "吳嘉茵", en: "Wu Jiayin" },
  region: { "zh-Hans": "广东省", "zh-Hant": "廣東省", en: "Guangdong, China" },
  bio: {
    "zh-Hans": "中山大学哲学博士，中国书法家协会会员。",
    "zh-Hant": "中山大學哲學博士，中國書法家協會會員。",
    en: "PhD in Philosophy from Sun Yat-sen University and member of the China Calligraphers Association."
  },
  credentials: [
    { "zh-Hans": "中国书法家协会会员", "zh-Hant": "中國書法家協會會員", en: "China Calligraphers Association member" }
  ],
  sampleImages: ["/one.webp", "/two.webp", "/three.webp"],
  services: []
}]}
```

Assert the observable contract:

```tsx
expect(screen.getByRole("heading", { name: "吴嘉茵" })).toBeInTheDocument();
expect(screen.getByText("广东省")).toBeInTheDocument();
expect(screen.getByText(/中山大学哲学博士/)).toBeInTheDocument();
expect(screen.getByText("中国书法家协会会员")).toBeInTheDocument();
expect(screen.getAllByRole("img", { name: /代表作品/ })).toHaveLength(3);
expect(screen.queryByText(/非专家作品|承接人待确认|媒体来源|授权/)).not.toBeInTheDocument();
```

- [x] **Step 4: Run focused tests and confirm the new contract fails**

Run:

```powershell
npm test --workspace server -- --test-name-pattern="configuration|production-orders"
Set-Location client
npx vitest run src/components/Experts.test.tsx --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

Expected: failures for the placeholder expert ID/name, missing local artwork files, and absent profile bio/credentials.

### Task 2: Add authorized local artwork assets and real shared config

**Files:**
- Create: `client/public/experts/wu-jiayin-listen-to-rain.webp`
- Create: `client/public/experts/wu-jiayin-lotus.webp`
- Create: `client/public/experts/wu-jiayin-long-joy.webp`
- Modify: `config/experts.json`

- [x] **Step 1: Convert the three reviewed authorized images to WebP**

Use the already reviewed source files in `%TEMP%\inkspire-wu-jiayin-review` and Sharp from the worktree dependency tree:

```powershell
New-Item -ItemType Directory -Path client/public/experts -Force | Out-Null
node -e "const sharp=require('sharp');const p=require('path');const os=require('os');const src=p.join(os.tmpdir(),'inkspire-wu-jiayin-review');const out=p.join(process.cwd(),'client','public','experts');Promise.all([['03-listen-rain.jpeg','wu-jiayin-listen-to-rain.webp'],['04-lotus.jpeg','wu-jiayin-lotus.webp'],['05-long-joy.jpeg','wu-jiayin-long-joy.webp']].map(([a,b])=>sharp(p.join(src,a)).rotate().resize({width:1200,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toFile(p.join(out,b)))).catch(e=>{console.error(e);process.exit(1)})"
```

Verify all files are WebP and non-empty:

```powershell
Get-ChildItem client/public/experts/wu-jiayin-*.webp | Select-Object Name,Length
```

Expected: three files, each with `Length` greater than zero.

- [x] **Step 2: Restore the real localized expert config**

Set `config/experts.json` to use:

```json
{
  "id": "wu_jiayin",
  "name": { "zh-Hans": "吴嘉茵", "zh-Hant": "吳嘉茵", "en": "Wu Jiayin" },
  "region": { "zh-Hans": "广东省", "zh-Hant": "廣東省", "en": "Guangdong, China" },
  "bio": {
    "zh-Hans": "中山大学哲学博士，中国书法家协会会员，现为广东技术师范大学教师，长期从事书法理论、创作与美育实践。",
    "zh-Hant": "中山大學哲學博士，中國書法家協會會員，現為廣東技術師範大學教師，長期從事書法理論、創作與美育實踐。",
    "en": "PhD in Philosophy from Sun Yat-sen University, member of the China Calligraphers Association, and faculty member at Guangdong Polytechnic Normal University, working across calligraphy theory, practice, and arts education."
  },
  "credentials": [
    { "zh-Hans": "中国书法家协会会员", "zh-Hant": "中國書法家協會會員", "en": "China Calligraphers Association member" },
    { "zh-Hans": "中山大学哲学博士", "zh-Hant": "中山大學哲學博士", "en": "PhD, Sun Yat-sen University" }
  ],
  "sampleImages": [
    "/experts/wu-jiayin-listen-to-rain.webp",
    "/experts/wu-jiayin-lotus.webp",
    "/experts/wu-jiayin-long-joy.webp"
  ]
}
```

Keep the existing two service IDs and price rules, but restore user-facing service names to `专家定制` / `專家定製` / `Expert Custom` and `专家指导` / `專家指導` / `Expert Guided`. Describe Wu Jiayin as the person creating or guiding the work while retaining the platform-estimate warning.

- [x] **Step 3: Run the config test**

Run:

```powershell
node --test --test-name-pattern="loads required Inkspire configuration|public config exposes" server/tests/config.test.js
```

Expected: PASS.

### Task 3: Render verified profile data and preserve order compatibility

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/components/Experts.tsx`
- Modify: `client/src/i18n.ts`
- Modify: `client/tests/app.test.tsx`
- Modify: `server/src/app.js`
- Test: `client/src/components/Experts.test.tsx`
- Test: `server/tests/app.test.js`

- [x] **Step 1: Localize credential values at the API boundary**

Change the `Expert` credential type in `client/src/api.ts` to:

```ts
credentials?: Array<string | Record<string, string>>;
```

- [x] **Step 2: Render the verified bio and credentials**

In `client/src/components/Experts.tsx`, render the localized bio and credential values:

```tsx
<p className="expert-bio">{localizedText(expert.bio, locale)}</p>
{expert.credentials?.length ? (
  <div className="expert-credentials" aria-label={expectationLabel}>
    {expert.credentials.map((credential) => {
      const label = localizedText(credential, locale);
      return <span key={label}>{label}</span>;
    })}
  </div>
) : null}
```

Keep the existing profile notice and service-boundary paragraphs. The sample gallery continues to use neutral image alt text derived from `sampleHeading`.

- [x] **Step 3: Replace placeholder copy in all three locales**

Set the expert strings in `client/src/i18n.ts` to the following equivalents:

```ts
// zh-Hans
sampleHeading: "代表作品",
profileNotice: "吴嘉茵为平台已入驻专家，具体档期与交付安排将在咨询后确认。",

// zh-Hant
sampleHeading: "代表作品",
profileNotice: "吳嘉茵為平台已入駐專家，具體檔期與交付安排將在諮詢後確認。",

// en
sampleHeading: "Selected works",
profileNotice: "Wu Jiayin is an onboarded expert. Availability and delivery arrangements are confirmed after consultation.",
```

Do not add source, attribution, copyright, or authorization copy.

- [x] **Step 4: Reverse the temporary expert-ID compatibility mapping**

In `server/src/app.js`, change the legacy set and fallback:

```js
const LEGACY_EXPERT_IDS = new Set(["platform_artisan_match"]);

function publicProductionOrder(order, config) {
  if (!LEGACY_EXPERT_IDS.has(order.expert_id)) {
    return order;
  }
  return { ...order, expert_id: config.experts[0]?.id || "wu_jiayin" };
}
```

Requests still fall back to the configured expert, so an old client posting `platform_artisan_match` creates a new order with `wu_jiayin`.

- [x] **Step 5: Align the client integration fixture with the real expert ID**

In `client/tests/app.test.tsx`, change the expert fixture ID, estimate responses, order responses, and request-body expectations from `platform_artisan_match` to `wu_jiayin`. Keep any explicit legacy-ID test isolated to the server compatibility case.

- [x] **Step 6: Run focused component and API tests**

Run:

```powershell
Set-Location client
npx vitest run src/components/Experts.test.tsx tests/app.test.tsx -t "artisan|production|selected works|代表作品" --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
Set-Location ..\server
node --test --test-name-pattern="production-estimate|production-orders" tests/app.test.js
```

Expected: PASS with the real expert ID and legacy placeholder compatibility.

### Task 4: Verify the mobile expert gallery and complete the business commit

**Files:**
- Modify: `e2e/inkspire.spec.ts`
- Modify: `client/src/styles.css`

- [x] **Step 1: Add a compact phone gallery test**

Add this scenario for both existing mobile viewports in `e2e/inkspire.spec.ts`:

```ts
test(`${viewport.width}px phone shows Wu Jiayin's authorized works without overflow`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await page.getByRole("button", { name: "雅匠" }).click();

  await expect(page.getByRole("heading", { name: "吴嘉茵" })).toBeVisible();
  await expect(page.getByText("代表作品")).toBeVisible();
  await expect(page.getByRole("img", { name: /代表作品/ })).toHaveCount(3);
  await expect(page.getByText(/非专家作品|承接人待确认|媒体来源|授权/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
```

- [x] **Step 2: Preserve full artwork framing**

Keep the current gallery dimensions and ensure the image rule uses:

```css
.expert-sample-frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

- [x] **Step 3: Run complete verification**

Run:

```powershell
npm test --workspace server
Set-Location client
npx vitest run --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
Set-Location ..
npm run build --workspace client
npm run e2e -- --project=chromium
git diff --check
```

Expected: all server tests, all client tests, the production build, Chromium E2E, and whitespace validation pass.

- [x] **Step 4: Create the single business commit required by project policy**

Run:

```powershell
git add client/public/experts config/experts.json client/src/api.ts client/src/components/Experts.tsx client/src/components/Experts.test.tsx client/src/i18n.ts client/src/styles.css server/src/app.js server/tests/app.test.js server/tests/config.test.js e2e/inkspire.spec.ts docs/superpowers/plans/2026-07-11-wu-jiayin-authentic-works.md
git diff --cached --check
git commit -m "feat: restore Wu Jiayin expert profile"
```

Expected: one implementation commit containing the approved profile, assets, compatibility behavior, tests, and this plan.

### Task 5: Integrate and restart the verified stack

**Files:**
- No product-file changes expected.

- [ ] **Step 1: Integrate the feature commit into the current `main` checkout**

Use the repository `worktree-integrate` commit workflow with an external bundle backup, then fast-forward `main` to the verified feature commit. Preserve unrelated worktrees and local changes.

- [ ] **Step 2: Restart both workspace services**

Inspect and stop the exact existing Inkspire process trees on ports `3001` and `5173`, then launch:

```powershell
npm run dev --workspace server
npm run dev --workspace client -- --host 0.0.0.0
```

Capture logs in `.runtime/server.out.log`, `.runtime/server.err.log`, `.runtime/client.out.log`, and `.runtime/client.err.log`.

- [ ] **Step 3: Verify the live surface**

Verify:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
Invoke-WebRequest http://127.0.0.1:5173/ -UseBasicParsing
Invoke-RestMethod http://127.0.0.1:3001/api/config/public
```

Expected: health `ok: true`, frontend HTTP `200`, and public config expert ID `wu_jiayin` with three `/experts/` sample images.
