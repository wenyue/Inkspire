import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import questions from "../../config/questions.json";
import { ARTWORK_TEMPLATES, answersForArtworkTemplate } from "../src/artworkTemplates";
import { nextQuestion, type QuestionConfig } from "../src/domain";

describe("artwork templates", () => {
  it("offers 20 localized popular templates led by painting", () => {
    expect(ARTWORK_TEMPLATES).toHaveLength(20);
    expect(ARTWORK_TEMPLATES.filter((template) => template.type === "painting")).toHaveLength(18);

    const previewImages = ARTWORK_TEMPLATES.map((template) => template.previewImage);
    expect(new Set(previewImages).size).toBe(20);

    for (const template of ARTWORK_TEMPLATES) {
      expect(template.previewImage).toBe(`/previews/templates/${template.id}.webp`);
      expect(template.title["zh-Hans"]).toBeTruthy();
      expect(template.title["zh-Hant"]).toBeTruthy();
      expect(template.title.en).toBeTruthy();
      expect(template.title.ja).toBeTruthy();
    }
  });

  it("ships a unique 960 by 720 preview for every template", async () => {
    for (const template of ARTWORK_TEMPLATES) {
      const imagePath = resolve("public", template.previewImage.replace(/^\//, ""));
      const metadata = await sharp(imagePath).metadata();
      expect({ width: metadata.width, height: metadata.height, format: metadata.format }).toEqual({
        width: 960,
        height: 720,
        format: "webp",
      });
    }
  });

  it("provides a complete painting answer set and leaves only calligraphy text open", () => {
    const painting = ARTWORK_TEMPLATES.find((template) => template.type === "painting");
    const calligraphy = ARTWORK_TEMPLATES.find((template) => template.type === "calligraphy");

    expect(Object.keys(painting?.answers ?? {}).sort()).toEqual([
      "painting_brushwork",
      "painting_format",
      "painting_mood",
      "painting_palette",
      "painting_subject",
    ]);
    expect(Object.keys(calligraphy?.answers ?? {}).sort()).toEqual([
      "calligraphy_layout",
      "calligraphy_material",
      "calligraphy_script",
      "calligraphy_spirit",
    ]);
    expect(nextQuestion(
      { questions: questions as QuestionConfig["questions"] },
      answersForArtworkTemplate(calligraphy!, "zh-Hans"),
    )?.id).toBe("text");
  });
});
