import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

const samplePng = {
  name: "sample.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4AWP8z8Dwn4GBgYGJAQoYAP8ABf8B8tH2rAAAAABJRU5ErkJggg==",
    "base64"
  )
};

async function completePaintingFlow(page, inspectFirstQuestion?: () => Promise<void>) {
  await page.getByRole("button", { name: "国画" }).click();
  await inspectFirstQuestion?.();
  for (const option of ["山水", "立轴", "写意", "水墨", "清雅"]) {
    await page.getByRole("button", { name: option }).click();
  }
  await expect(page.getByRole("heading", { name: "可选：添加环境照片" })).toBeVisible();
  await expect(page.getByText("第 7 / 8 步")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成", exact: true })).not.toBeVisible();
}

async function addPhotoAndContinue(page, entry: "album" | "camera" = "album") {
  const inputLabel = entry === "camera" ? "拍照" : "相册";
  await page.getByLabel(inputLabel).setInputFiles(samplePng);
  await expect(page.getByText("已提供环境图片，将用于生成效果图。")).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();
  await expect(page.getByText("第 8 / 8 步")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成", exact: true })).toBeVisible();
}

async function continueToNotesWithoutPhoto(page) {
  await page.getByRole("button", { name: "不需要效果图，直接生成" }).click();
  await expect(page.getByText("第 7 / 8 步")).toBeVisible();
  await page.getByRole("button", { name: "均衡" }).click();
  await expect(page.getByRole("heading", { name: "也可以补一句想法" })).toBeVisible();
  await expect(page.getByText("第 8 / 8 步")).toBeVisible();
}

async function expectFullyAboveBottomTabs(page, action) {
  await expect(action).toBeVisible();
  const actionBox = await action.boundingBox();
  const navBox = await page.locator(".bottom-tabs").boundingBox();

  expect(actionBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y);
}

for (const productionViewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 }
]) {
  test(`${productionViewport.width}px phone keeps creation actions reachable and production modal above hidden navigation`, async ({ page }) => {
    await page.setViewportSize(productionViewport);
    await page.goto("/");

    await completePaintingFlow(page, async () => {
      await expect(page.getByRole("heading", { name: "想画什么内容？" })).toBeVisible();
      const firstOptionFrame = page.locator(".option-preview-frame").first();
      await expect(firstOptionFrame).toHaveCSS("width", "100px");
      await expect(firstOptionFrame).toHaveCSS("height", "75px");
      await expect(firstOptionFrame.locator("..")).toHaveCSS("min-height", "92px");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
    await addPhotoAndContinue(page);
    const generateButton = page.getByRole("button", { name: "生成", exact: true });
    await expectFullyAboveBottomTabs(page, generateButton);
    await generateButton.click();

    const makeButton = page.getByRole("button", { name: "制作作品" });
    await expect(makeButton).toBeVisible({ timeout: 30_000 });
    await expectFullyAboveBottomTabs(page, makeButton);
    await makeButton.click();

    const confirmButton = page.getByRole("button", { name: "确认制作意向" });
    await expect(confirmButton).toBeVisible();
    await expect(page.locator(".bottom-tabs")).toBeHidden();
    const confirmBox = await confirmButton.boundingBox();
    expect(confirmBox).not.toBeNull();
    expect(confirmBox!.y + confirmBox!.height).toBeLessThanOrEqual(productionViewport.height);

    const referenceCards = page.locator(".reference-card");
    await expect(referenceCards).toHaveCount(5);
    const referenceBoxes = await referenceCards.evaluateAll((cards) => cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { x: box.x, y: box.y, height: box.height };
    }));
    expect(referenceBoxes.every(({ height }) => height >= 68)).toBe(true);
    expect(new Set(referenceBoxes.slice(0, 3).map(({ y }) => Math.round(y))).size).toBe(1);
    expect(new Set(referenceBoxes.slice(3).map(({ y }) => Math.round(y))).size).toBe(1);
    expect(referenceBoxes[3].y).toBeGreaterThan(referenceBoxes[0].y);
    expect(referenceBoxes[3].x).toBeGreaterThan(referenceBoxes[0].x);
  });
}

test("bottom tabs keep independent scroll positions across refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".studio,.empty-state,.library-grid,.experts-panel{min-height:1800px!important}";
      document.head.append(style);
    });
  });
  await page.goto("/");

  const surface = page.locator(".main-surface");
  const setScrollTop = (top: number) => surface.evaluate((element, value) => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    element.scrollTop = value;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    return element.scrollTop;
  }, top);
  const scrollTop = () => surface.evaluate((element) => element.scrollTop);

  expect(await setScrollTop(180)).toBe(180);
  const libraryTab = page.getByRole("button", { name: "藏卷", exact: true });
  await libraryTab.click();
  await expect(libraryTab).toHaveAttribute("aria-pressed", "true");
  expect(await scrollTop()).toBe(0);

  expect(await setScrollTop(320)).toBe(320);
  const expertsTab = page.getByRole("button", { name: "雅匠", exact: true });
  await expertsTab.click();
  await expect(expertsTab).toHaveAttribute("aria-pressed", "true");
  expect(await scrollTop()).toBe(0);

  expect(await setScrollTop(460)).toBe(460);
  const studioTab = page.getByRole("button", { name: "画案", exact: true });
  await studioTab.click();
  await expect(studioTab).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs(await scrollTop() - 180)).toBeLessThanOrEqual(2);

  await libraryTab.click();
  await expect(libraryTab).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs(await scrollTop() - 320)).toBeLessThanOrEqual(2);

  await expertsTab.click();
  await expect(expertsTab).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs(await scrollTop() - 460)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => JSON.parse(
    window.sessionStorage.getItem("inkspire.tabScrollPositions.v1") ?? "{}"
  ).experts)).toBe(460);

  await page.reload();
  await expect(page.getByRole("heading", { name: "吴嘉茵" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(
    window.sessionStorage.getItem("inkspire.tabScrollPositions.v1") ?? "{}"
  ).experts)).toBe(460);
  expect(Math.abs(await scrollTop() - 460)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.localStorage.getItem("inkspire.tabScrollPositions.v1"))).toBeNull();
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 }
]) {
  test(`${viewport.width}px phone shows two authorized works and scrolls the rest`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "雅匠" }).click();

    await expect(page.getByRole("heading", { name: "吴嘉茵" })).toBeVisible();
    await expect(page.getByText("代表作品")).toBeVisible();
    const works = page.getByRole("img", { name: /代表作品/ });
    await expect(works).toHaveCount(3);
    await expect(page.getByText(/非专家作品|承接人待确认|媒体来源|授权/)).toHaveCount(0);
    expect(await works.first().evaluate((image) => window.getComputedStyle(image).objectFit)).toBe("contain");
    const artworkFrame = await works.first().locator("..").boundingBox();
    expect(artworkFrame).not.toBeNull();
    expect(artworkFrame!.height).toBeGreaterThan(artworkFrame!.width);
    const stripGeometry = await page.locator(".expert-sample-strip").evaluate((strip) => {
      const style = window.getComputedStyle(strip);
      const cards = Array.from(strip.children, (card) => card.getBoundingClientRect());
      return {
        clientWidth: strip.clientWidth,
        scrollWidth: strip.scrollWidth,
        overflowX: style.overflowX,
        gap: Number.parseFloat(style.columnGap),
        cardWidths: cards.map((card) => card.width),
        cardTops: cards.map((card) => card.top)
      };
    });
    expect(stripGeometry.overflowX).toBe("auto");
    expect(stripGeometry.scrollWidth).toBeGreaterThan(stripGeometry.clientWidth);
    expect(stripGeometry.cardTops.every((top) => Math.abs(top - stripGeometry.cardTops[0]) < 1)).toBe(true);
    expect(Math.abs(stripGeometry.cardWidths[0] * 2 + stripGeometry.gap - stripGeometry.clientWidth)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test(`${viewport.width}px phone keeps verified classic references and script sources trustworthy`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await page.getByRole("button", { name: "从历代名作取意" }).click();
    await expect(page.getByRole("searchbox", { name: "搜索作品、作者、年代或地域" })).toBeVisible();
    await expect(page.locator(".classic-card")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "全部馆藏 · 保留原题" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    await page.getByRole("button", { name: "上一步" }).click();
    await page.getByRole("button", { name: "书法" }).click();
    const calligraphyText = page.getByLabel("想写什么正文？");
    await expect(calligraphyText).toBeVisible();
    await calligraphyText.pressSequentially("清风入怀");
    const continueToScript = page.getByRole("button", { name: "继续定书体" });
    await expect(continueToScript).toBeEnabled();
    await continueToScript.click();
    await expect(page.getByRole("heading", { name: "偏好哪种书体？" })).toBeVisible();
    await expect(page.locator(".script-source-option")).toHaveCount(5);
    await expect(page.locator(".script-source-option img")).toHaveCount(0);
    await expect(page.locator(".option-source-note")).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test(`${viewport.width}px phone keeps every notes suggestion above the generate action`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await completePaintingFlow(page);
    await continueToNotesWithoutPhoto(page);

    const finalSuggestion = page.getByRole("button", { name: "减少装饰性效果" });
    const generateButton = page.getByRole("button", { name: "生成", exact: true });
    await finalSuggestion.scrollIntoViewIfNeeded();

    const suggestionBox = await finalSuggestion.boundingBox();
    const actionBox = await generateButton.boundingBox();
    const navBox = await page.locator(".bottom-tabs").boundingBox();
    expect(suggestionBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(suggestionBox!.y + suggestionBox!.height).toBeLessThanOrEqual(actionBox!.y);
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y);

    await finalSuggestion.click();
    const notes = page.getByLabel("也可以补一句想法");
    await expect(notes).toHaveValue("减少装饰性效果");
    await page.getByRole("button", { name: "清除想法" }).click();
    await expect(notes).toHaveValue("");
    await expect(notes).toBeFocused();
    const focusedNotesBox = await notes.boundingBox();
    const focusedActionBox = await generateButton.boundingBox();
    expect(focusedNotesBox).not.toBeNull();
    expect(focusedActionBox).not.toBeNull();
    expect(focusedNotesBox!.y + focusedNotesBox!.height).toBeLessThanOrEqual(focusedActionBox!.y);

    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
}

test("phone browser back from a classic artwork detail returns to the classic step", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "从历代名作取意" }).click();
  await page.getByRole("button", { name: /照夜白图/ }).click();

  await expect(page.getByRole("img", { name: "照夜白图" })).toBeVisible();
  await expect(page).toHaveURL(/\/studio\?step=classic&artwork=/);

  await page.goBack();

  await expect(page).toHaveURL(/\/studio\?step=classic$/);
  await expect(page.getByRole("searchbox", { name: "搜索作品、作者、年代或地域" })).toBeVisible();
  await expect(page.getByText("第 2 / 4 步")).toBeVisible();
});

test("wide artisan gallery shows all current works in one row", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "雅匠" }).click();

  const works = page.getByRole("img", { name: /代表作品/ });
  await expect(works).toHaveCount(3);
  const stripGeometry = await page.locator(".expert-sample-strip").evaluate((strip) => {
    const stripRect = strip.getBoundingClientRect();
    const cards = Array.from(strip.children, (card) => card.getBoundingClientRect());
    return {
      stripLeft: stripRect.left,
      stripRight: stripRect.right,
      cardLefts: cards.map((card) => card.left),
      cardRights: cards.map((card) => card.right),
      cardTops: cards.map((card) => card.top)
    };
  });
  expect(stripGeometry.cardTops.every((top) => Math.abs(top - stripGeometry.cardTops[0]) < 1)).toBe(true);
  expect(Math.min(...stripGeometry.cardLefts)).toBeGreaterThanOrEqual(stripGeometry.stripLeft);
  expect(Math.max(...stripGeometry.cardRights)).toBeLessThanOrEqual(stripGeometry.stripRight + 1);
});

test("compact phone keeps classic failure recovery visible and opens the picker without retrying", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-compact-classic",
        startedAt: Date.now(),
        status: "running",
        payload: {
          type: "painting",
          answers: {
            work_type: "painting",
            creation_mode: "classic_reference",
            classic_artwork_id: "missing-classic"
          }
        }
      }
    }));
  });
  let generationRequests = 0;
  await page.route("**/api/jobs/active", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      jobs: [{
        id: "job-compact-classic",
        recordId: "record-compact-classic",
        stage: "artwork",
        origin_tab: "studio",
        operation: "create",
        status: "running"
      }]
    })
  }));
  await page.route("**/api/jobs/job-compact-classic", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: "job-compact-classic",
      recordId: "record-compact-classic",
      stage: "artwork",
      origin_tab: "studio",
      operation: "create",
      status: "failed",
      error: "private filesystem detail",
      diagnostics: { reason: "classic_reference_unavailable" }
    })
  }));
  await page.route("**/api/generations", async (route) => {
    generationRequests += 1;
    await route.continue();
  });

  await page.goto("/studio");

  await expect(page.getByRole("heading", { name: "所选名作暂不可用" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("private filesystem detail")).toBeHidden();
  const recovery = page.getByRole("button", { name: "重新选择名作" });
  await expectFullyAboveBottomTabs(page, recovery);
  await recovery.click();

  await expect(page).toHaveURL(/\/studio\?step=classic$/);
  await expect(page.getByRole("searchbox", { name: "搜索作品、作者、年代或地域" })).toBeVisible();
  await expect(page.locator(".classic-card").first()).toBeVisible();
  expect(generationRequests).toBe(0);
});

test("mobile user can complete Inkspire creation flow with mocked generation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "墨起" })).toBeVisible();
  await expect(page.getByRole("button", { name: "画案" })).toBeVisible();

  const canvasBox = await page.locator("canvas.particle-backdrop").boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(0);
  expect(canvasBox?.height).toBeGreaterThan(0);
  await expect.poll(async () => page.locator("canvas.particle-backdrop").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context || canvas.width === 0 || canvas.height === 0) {
      return 0;
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) {
        return 1;
      }
    }
    return 0;
  })).toBe(1);

  await page.getByLabel("语言").selectOption("en");
  await expect(page.getByRole("button", { name: "Studio" })).toBeVisible();
  await page.getByLabel("Language").selectOption("zh-Hans");
  await expect(page.getByRole("button", { name: "画案" })).toBeVisible();

  await completePaintingFlow(page);
  await addPhotoAndContinue(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
  await expect(page.getByText("作品图", { exact: true })).toBeVisible();
  await expect(page.getByText("效果图", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "制作作品" })).toBeVisible();

  await page.getByRole("button", { name: "查看作品图" }).click();
  await expect(page.getByRole("dialog", { name: "作品图" })).toBeVisible();
  await expect(page.locator(".image-viewer-transform-wrapper")).toBeVisible();
  await expect(page.getByRole("button", { name: "重置缩放" })).toBeVisible();
  await expect(page.getByRole("button", { name: "画案", exact: true })).toBeHidden();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "作品图" })).toBeHidden();
  await expect(page.getByRole("button", { name: "画案", exact: true })).toBeVisible();

  // Production dialog opens from the result and browser back closes it without losing the artwork.
  await page.getByRole("button", { name: "制作作品" }).click();
  await expect(page).toHaveURL(/\/records\/[^/]+\/production\?from=studio/);
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/records\/[^/]+\?from=studio/);
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeHidden();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();

  // Reload restores the production dialog, then the in-dialog close action returns to the artwork.
  await page.getByRole("button", { name: "制作作品" }).click();
  await expect(page).toHaveURL(/\/records\/[^/]+\/production\?from=studio/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page).toHaveURL(/\/records\/[^/]+\?from=studio/);
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeHidden();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();

  // Adjust page is a separate pushed view; back returns to the same artwork.
  await page.getByRole("button", { name: "调整作品" }).click();
  await expect(page.getByRole("heading", { name: "调整这张作品" })).toBeVisible();
  await expect(page.getByLabel("调整这张作品")).toBeFocused();
  await page.getByRole("button", { name: "返回作品" }).click();
  await expect(page.getByRole("heading", { name: "调整这张作品" })).toBeHidden();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();

  await page.getByRole("button", { name: "藏卷" }).click();
  const savedRecord = page.getByRole("button", { name: /查看/ }).first();
  await expect(savedRecord).toBeVisible();
  await savedRecord.click();
  await expect(page.getByRole("button", { name: "藏卷", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "画案", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
  await expect(page.getByRole("button", { name: "制作作品" })).toBeVisible();

  await page.getByRole("button", { name: "雅匠" }).click();
  await expect(page.getByText("可咨询方向")).toBeVisible();
  await page.getByRole("button", { name: "发起咨询" }).click();
  await expect(page.getByRole("status")).toHaveText("平台微信已复制");
  await page.getByRole("button", { name: "藏卷", exact: true }).click();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
  await expect(page.getByRole("button", { name: "藏卷", exact: true })).toHaveAttribute("aria-pressed", "true");

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(horizontalOverflow).toBe(false);

  const resultColumns = await page.locator(".result-grid").first().evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns.split(" ").length;
  });
  expect(resultColumns).toBe(1);
});

test("refreshing a library artwork avoids Library flash and restores its scroll position", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".result-view{min-height:1800px!important}";
      document.head.append(style);
    });
  });
  await page.goto("/");

  await completePaintingFlow(page);
  await addPhotoAndContinue(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();

  const studioResultSurface = page.locator(".main-surface");
  const studioScrollTopBeforeProduction = await studioResultSurface.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "制作作品" }).click();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeHidden();
  await expect.poll(async () => Math.abs(
    await studioResultSurface.evaluate((element) => element.scrollTop) - studioScrollTopBeforeProduction
  )).toBeLessThanOrEqual(2);

  const studioScrollTopBeforeBrowserBack = await studioResultSurface.evaluate((element) => element.scrollTop);
  await page.getByRole("button", { name: "制作作品" }).click();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeHidden();
  await expect.poll(async () => Math.abs(
    await studioResultSurface.evaluate((element) => element.scrollTop) - studioScrollTopBeforeBrowserBack
  )).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "藏卷", exact: true }).click();
  await page.getByRole("button", { name: /查看/ }).first().click();
  await expect(page).toHaveURL(/\/records\/[^/]+\?from=library/);
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();

  const resultSurface = page.locator(".main-surface");
  await resultSurface.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    element.scrollTop = 240;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  let releaseRecordRequest: (() => void) | undefined;
  let shouldDelayRecordRequest = true;
  await page.route(/\/api\/records\/[^/?]+(?:\?.*)?$/, async (route) => {
    if (shouldDelayRecordRequest && route.request().method() === "GET") {
      shouldDelayRecordRequest = false;
      await new Promise<void>((resolve) => {
        releaseRecordRequest = resolve;
      });
    }
    await route.continue();
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toHaveText("正在打开作品…");
  await expect(page.locator(".library-grid")).toHaveCount(0);
  releaseRecordRequest?.();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
  await expect.poll(async () => Math.abs(
    await resultSurface.evaluate((element) => element.scrollTop) - 240
  )).toBeLessThanOrEqual(2);

  const makeArtworkButton = page.getByRole("button", { name: "制作作品" });
  const scrollTopBeforeOpen = await resultSurface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  await makeArtworkButton.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeHidden();
  await expect.poll(async () => Math.abs(
    await resultSurface.evaluate((element) => element.scrollTop) - scrollTopBeforeOpen
  )).toBeLessThanOrEqual(2);
});

test("wide viewport shows artwork and fusion side by side", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");

  await completePaintingFlow(page);
  await addPhotoAndContinue(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
  const resultColumns = await page.locator(".result-grid").first().evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns.split(" ").length;
  });
  expect(resultColumns).toBeGreaterThan(1);
});

test("browser back stays on the selected bottom tab root", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");

  await expect(page.getByRole("button", { name: "画案", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "藏卷", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("button", { name: "藏卷", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.goBack();

  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("button", { name: "藏卷", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("先定作品类型")).toBeHidden();
});

test("studio keeps the current question step after switching to library and back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");

  await page.getByRole("button", { name: "国画" }).click();
  await page.getByRole("button", { name: "山水" }).click();
  await expect(page.getByRole("heading", { name: "希望做成什么形制？" })).toBeVisible();
  await expect(page.getByText("第 3 / 8 步")).toBeVisible();
  await expect(page).toHaveURL(/\/studio\?step=question&index=1$/);

  await page.getByRole("button", { name: "藏卷", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.getByRole("button", { name: "画案", exact: true }).click();
  await expect(page.getByRole("heading", { name: "希望做成什么形制？" })).toBeVisible();
  await expect(page.getByText("第 3 / 8 步")).toBeVisible();
  await expect(page.getByText("先定作品类型")).toBeHidden();
  await expect(page).toHaveURL(/\/studio\?step=question&index=1$/);
});

test("camera photo entry applies and generates fusion output", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await completePaintingFlow(page);
  await addPhotoAndContinue(page, "camera");
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
});
