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

async function completePaintingFlow(page) {
  await page.getByRole("button", { name: "国画" }).click();
  for (const option of ["山水", "水墨", "清雅", "竖幅", "适中"]) {
    await page.getByRole("button", { name: option }).click();
  }
  await expect(page.getByRole("heading", { name: "可选：添加摆放环境照片" })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成", exact: true })).not.toBeVisible();
}

async function addPhotoAndContinue(page, entry: "album" | "camera" = "album") {
  const inputLabel = entry === "camera" ? "拍照" : "相册";
  await page.getByLabel(inputLabel).setInputFiles(samplePng);
  await expect(page.getByText("已提供环境图片，将用于生成效果图。")).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();
  await expect(page.getByRole("button", { name: "生成", exact: true })).toBeVisible();
}

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

  await expect(page.getByText("墨色正在铺开，可能需要 2-3 分钟，请耐心等待。")).toBeVisible();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
  await expect(page.getByText("作品图", { exact: true })).toBeVisible();
  await expect(page.getByText("效果图", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "制作作品" })).toBeVisible();

  // Production dialog opens from the result and browser back closes it without losing the artwork.
  await page.getByRole("button", { name: "制作作品" }).click();
  await expect(page).toHaveURL(/\/records\/[^/]+\/production\?from=studio/);
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
  await page.goBack();
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

test("wide viewport shows artwork and fusion side by side", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");

  await completePaintingFlow(page);
  await addPhotoAndContinue(page);
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByText("墨色正在铺开，可能需要 2-3 分钟，请耐心等待。")).toBeVisible();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
  const resultColumns = await page.locator(".result-grid").first().evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns.split(" ").length;
  });
  expect(resultColumns).toBeGreaterThan(1);
});

test("camera photo entry applies and generates fusion output", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await completePaintingFlow(page);
  await addPhotoAndContinue(page, "camera");
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByText("墨色正在铺开，可能需要 2-3 分钟，请耐心等待。")).toBeVisible();
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
});
