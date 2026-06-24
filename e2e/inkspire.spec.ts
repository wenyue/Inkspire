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

async function addPhotoAndContinue(page) {
  await page.getByLabel("相册").setInputFiles(samplePng);
  await expect(page.getByText("已提供环境图，将用于生成效果图。")).toBeVisible();
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

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
  await expect(page.getByText("作品图", { exact: true })).toBeVisible();
  await expect(page.getByText("效果图", { exact: true })).toBeVisible();
  await expect(page.getByText(/制作作品/)).toBeVisible({ timeout: 30_000 });
  await page.getByText("制作作品").click();
  await expect(page.getByText("专家定制")).toBeVisible();
  await expect(page.getByText("专家指导")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "藏卷" }).click();
  const savedRecord = page.getByRole("button", { name: /查看/ }).first();
  await expect(savedRecord).toBeVisible();
  await savedRecord.click();
  await expect(page.getByRole("button", { name: "画案" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible();
  await expect(page.getByText(/制作作品/)).toBeVisible();

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

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
  const resultColumns = await page.locator(".result-grid").first().evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns.split(" ").length;
  });
  expect(resultColumns).toBeGreaterThan(1);
});
