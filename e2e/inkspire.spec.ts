import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

test("mobile user can complete Inkspire creation flow with mocked generation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "墨起" })).toBeVisible();
  await expect(page.getByRole("button", { name: "画案" })).toBeVisible();

  const canvasBox = await page.locator("canvas.particle-backdrop").boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(0);
  expect(canvasBox?.height).toBeGreaterThan(0);

  await page.getByLabel("语言").selectOption("en");
  await expect(page.getByRole("button", { name: "Studio" })).toBeVisible();
  await page.getByLabel("Language").selectOption("zh-Hans");
  await expect(page.getByRole("button", { name: "画案" })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4AWP8z8Dwn4GBgYGJAQoYAP8ABf8B8tH2rAAAAABJRU5ErkJggg==",
      "base64"
    )
  });
  await page.getByRole("button", { name: "国画" }).click();
  for (const option of ["山水", "水墨", "清雅", "竖幅", "适中"]) {
    await page.getByRole("button", { name: option }).click();
  }
  await expect(page.getByRole("button", { name: "可以开始生成" })).toBeVisible();
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "融合图" })).toBeVisible();
  await expect(page.getByText("作品图")).toBeVisible();
  await expect(page.getByText("融合图")).toBeVisible();
  await expect(page.getByText(/制作作品/)).toBeVisible({ timeout: 30_000 });
  await page.getByText("制作作品").click();
  await expect(page.getByText("专家定制")).toBeVisible();
  await expect(page.getByText("专家指导")).toBeVisible();

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(horizontalOverflow).toBe(false);

  const resultColumns = await page.locator(".result-grid").evaluate((element) => {
    return window.getComputedStyle(element).gridTemplateColumns.split(" ").length;
  });
  expect(resultColumns).toBe(1);
});
