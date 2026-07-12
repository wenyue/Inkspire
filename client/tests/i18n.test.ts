import { describe, expect, it } from "vitest";
import en from "../../config/i18n/en.json";
import ja from "../../config/i18n/ja.json";
import zhHans from "../../config/i18n/zh-Hans.json";
import zhHant from "../../config/i18n/zh-Hant.json";
import { createListTranslator, createTranslator } from "../src/i18n";

const dictionaries = {
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ja,
  en
};

describe("i18n", () => {
  it("uses refined zh-Hans tab labels", () => {
    const t = createTranslator("zh-Hans", dictionaries);

    expect(t("tabs.studio")).toBe("画案");
    expect(t("tabs.library")).toBe("藏卷");
    expect(t("tabs.experts")).toBe("雅匠");
  });

  it("has non-empty zh-Hant and en translations for the same keys", () => {
    const zhHantTranslator = createTranslator("zh-Hant", dictionaries);
    const enTranslator = createTranslator("en", dictionaries);

    for (const key of ["tabs.studio", "tabs.library", "tabs.experts"]) {
      expect(zhHantTranslator(key)).not.toHaveLength(0);
      expect(enTranslator(key)).not.toHaveLength(0);
    }
  });

  it("describes the metadata retained by an empty library in every locale", () => {
    expect(createTranslator("zh-Hans", dictionaries)("empty.libraryDetail")).toBe("藏卷会保留题名、形制与疏密线索。");
    expect(createTranslator("zh-Hant", dictionaries)("empty.libraryDetail")).toBe("藏卷會保留題名、形制與疏密線索。");
    expect(createTranslator("en", dictionaries)("empty.libraryDetail")).toBe("The library retains each title, format, and density note.");
  });

  it("localizes the artwork route loading boundary", () => {
    expect(createTranslator("zh-Hans", dictionaries)("result.loading")).toBe("正在打开作品…");
    expect(createTranslator("zh-Hant", dictionaries)("result.loading")).toBe("正在打開作品…");
    expect(createTranslator("en", dictionaries)("result.loading")).toBe("Opening artwork…");
    expect(createTranslator("ja", dictionaries)("result.loading")).toBe("作品を開いています…");
  });

  it("provides Japanese navigation and creation copy", () => {
    const translate = createTranslator("ja", dictionaries);

    expect(translate("language.label")).toBe("言語");
    expect(translate("tabs.studio")).toBe("創作");
    expect(translate("tabs.library")).toBe("作品集");
    expect(translate("studio.subtitle")).toBe("中国画と書道の創作アシスタント");
  });

  it("falls back to zh-Hans when a key is missing from the active locale", () => {
    const t = createTranslator("en", {
      "zh-Hans": { custom: { label: "默认文案" } },
      en: {}
    });

    expect(t("custom.label")).toBe("默认文案");
  });

  it("uses client overrides for English runtime labels", () => {
    const t = createTranslator("en", dictionaries);

    expect(t("studio.title")).toBe("Inkspire");
    expect(t("studio.subtitle")).toBe("Chinese painting and calligraphy creation assistant");
    expect(t("result.continue")).toBe("Adjust from this artwork");
    expect(t("production.confirm")).toBe("Confirm production");
  });

  it("uses precise brand and mobile discovery copy in every locale", () => {
    const zhHansTranslator = createTranslator("zh-Hans", dictionaries);
    const zhHantTranslator = createTranslator("zh-Hant", dictionaries);
    const enTranslator = createTranslator("en", dictionaries);

    expect(zhHansTranslator("studio.subtitle")).toBe("国画与书法创作辅助");
    expect(zhHantTranslator("studio.subtitle")).toBe("國畫與書法創作輔助");
    expect(enTranslator("studio.subtitle")).toBe("Chinese painting and calligraphy creation assistant");
    expect(zhHansTranslator("experts.sampleHint")).toBe("左右滑动查看更多作品");
    expect(zhHantTranslator("experts.sampleHint")).toBe("左右滑動查看更多作品");
    expect(enTranslator("experts.sampleHint")).toBe("Swipe sideways to see more works");
  });

  it("localizes every image viewer control in all supported locales", () => {
    const zhHansTranslator = createTranslator("zh-Hans", dictionaries);
    const zhHantTranslator = createTranslator("zh-Hant", dictionaries);
    const enTranslator = createTranslator("en", dictionaries);

    expect([
      zhHansTranslator("imageViewer.back"),
      zhHansTranslator("imageViewer.error"),
      zhHansTranslator("imageViewer.gestureHint"),
      zhHansTranslator("imageViewer.resetZoom"),
      zhHansTranslator("imageViewer.controls"),
      zhHansTranslator("imageViewer.zoomOut"),
      zhHansTranslator("imageViewer.reset"),
      zhHansTranslator("imageViewer.zoomIn")
    ]).toEqual(["返回", "图片暂时无法查看", "双指缩放 · 双击放大", "重置缩放", "图片缩放控制", "缩小", "重置", "放大"]);
    expect(zhHantTranslator("imageViewer.back")).toBe("返回");
    expect(zhHantTranslator("imageViewer.error")).toBe("圖片暫時無法查看");
    expect(zhHantTranslator("imageViewer.gestureHint")).toBe("雙指縮放 · 雙擊放大");
    expect(enTranslator("imageViewer.back")).toBe("Back");
    expect(enTranslator("imageViewer.error")).toBe("Image is temporarily unavailable");
    expect(enTranslator("imageViewer.gestureHint")).toBe("Pinch to zoom · Double-tap to enlarge");
    expect(enTranslator("imageViewer.zoomOut")).toBe("Zoom out");
    expect(enTranslator("imageViewer.reset")).toBe("Reset");
    expect(enTranslator("imageViewer.zoomIn")).toBe("Zoom in");
  });

  it("describes generation choices as density and openness in every locale", () => {
    const zhHansTranslator = createTranslator("zh-Hans", dictionaries);
    const zhHantTranslator = createTranslator("zh-Hant", dictionaries);
    const enTranslator = createTranslator("en", dictionaries);

    expect([
      zhHansTranslator("studio.complexityTitle"),
      zhHansTranslator("studio.complexityHint"),
      zhHansTranslator("studio.complexitySmall"),
      zhHansTranslator("studio.complexitySmallHint"),
      zhHansTranslator("studio.complexityMedium"),
      zhHansTranslator("studio.complexityMediumHint"),
      zhHansTranslator("studio.complexityLarge"),
      zhHansTranslator("studio.complexityLargeHint")
    ]).toEqual([
      "希望画面如何安排疏密？",
      "没有环境照片时，疏密与虚实会帮助墨起估算画面信息量和制作尺寸。",
      "疏朗",
      "主体集中，虚处充分，保留清楚气口。",
      "均衡",
      "主次明确，疏密相间。",
      "繁密",
      "层次丰富但仍保留虚处，不填满画面。"
    ]);
    expect([
      zhHantTranslator("studio.complexityTitle"),
      zhHantTranslator("studio.complexityHint"),
      zhHantTranslator("studio.complexitySmall"),
      zhHantTranslator("studio.complexitySmallHint"),
      zhHantTranslator("studio.complexityMedium"),
      zhHantTranslator("studio.complexityMediumHint"),
      zhHantTranslator("studio.complexityLarge"),
      zhHantTranslator("studio.complexityLargeHint")
    ]).toEqual([
      "希望畫面如何安排疏密？",
      "沒有環境照片時，疏密與虛實會幫助墨起估算畫面資訊量和製作尺寸。",
      "疏朗",
      "主體集中，虛處充分，保留清楚氣口。",
      "均衡",
      "主次明確，疏密相間。",
      "繁密",
      "層次豐富但仍保留虛處，不填滿畫面。"
    ]);
    expect([
      enTranslator("studio.complexityTitle"),
      enTranslator("studio.complexityHint"),
      enTranslator("studio.complexitySmall"),
      enTranslator("studio.complexitySmallHint"),
      enTranslator("studio.complexityMedium"),
      enTranslator("studio.complexityMediumHint"),
      enTranslator("studio.complexityLarge"),
      enTranslator("studio.complexityLargeHint")
    ]).toEqual([
      "How should density and openness be balanced?",
      "Without a placement photo, the balance between dense detail and open space helps Inkspire estimate visual information and production size.",
      "Open",
      "The subject stays focused, with generous open space and clear breathing room.",
      "Balanced",
      "A clear hierarchy alternates dense passages with open space.",
      "Dense",
      "Rich layers preserve open passages rather than filling the entire composition."
    ]);
  });

  it("uses distinct locale-specific painting and calligraphy suggestion lists", () => {
    const zhHansList = createListTranslator("zh-Hans", dictionaries);
    const zhHantList = createListTranslator("zh-Hant", dictionaries);
    const enList = createListTranslator("en", dictionaries);

    expect(zhHansList("suggestions.painting")).toEqual([
      "可以开始生成",
      "主次更明确",
      "留白再多些",
      "干湿层次更清楚",
      "气口更通透",
      "设色更克制",
      "节奏更从容",
      "按墙面陈设调整幅式比例",
      "减少装饰性效果"
    ]);
    expect(zhHansList("suggestions.calligraphy")).toEqual([
      "可以开始生成",
      "正文更醒目",
      "行气更贯通",
      "结字更从容",
      "调整字距与行距",
      "提按更分明",
      "枯润变化更克制",
      "章法更稳定",
      "按陈设尺寸调整行列"
    ]);
    expect(zhHantList("suggestions.painting")).toEqual([
      "可以開始生成",
      "主次更明確",
      "留白再多些",
      "乾濕層次更清楚",
      "氣口更通透",
      "設色更克制",
      "節奏更從容",
      "按牆面陳設調整幅式比例",
      "減少裝飾性效果"
    ]);
    expect(zhHantList("suggestions.calligraphy")).toEqual([
      "可以開始生成",
      "正文更醒目",
      "行氣更貫通",
      "結字更從容",
      "調整字距與行距",
      "提按更分明",
      "枯潤變化更克制",
      "章法更穩定",
      "按陳設尺寸調整行列"
    ]);
    expect(enList("suggestions.painting")).toEqual([
      "Start generating",
      "Clarify the focal hierarchy",
      "Leave more open space",
      "Clarify wet-dry ink layers",
      "Open up the breathing space",
      "Restrain the color palette",
      "Use a more measured rhythm",
      "Adjust the format to the wall",
      "Reduce decorative effects"
    ]);
    expect(enList("suggestions.calligraphy")).toEqual([
      "Start generating",
      "Make the main text more prominent",
      "Strengthen the flow between lines",
      "Use more composed character structures",
      "Refine character and line spacing",
      "Clarify pressure modulation",
      "Restrain dry-wet variation",
      "Stabilize the overall layout",
      "Adjust rows and columns to display size"
    ]);

    for (const list of [
      zhHansList("suggestions.painting"),
      zhHansList("suggestions.calligraphy"),
      zhHantList("suggestions.painting"),
      zhHantList("suggestions.calligraphy"),
      enList("suggestions.painting"),
      enList("suggestions.calligraphy")
    ]) {
      expect(list).toHaveLength(9);
      expect(list).not.toEqual(expect.arrayContaining([
        "更雅",
        "更有诗意",
        "更有气韵",
        "更有詩意",
        "更有氣韻",
        "More refined",
        "More poetic",
        "More lively energy",
        "更适合作为礼赠",
        "更適合作為禮贈",
        "Better suited as a gift"
      ]));
    }

    expect(zhHansList("suggestions.calligraphy")).not.toEqual(expect.arrayContaining(["气口更通透", "设色更克制"]));
    expect(zhHantList("suggestions.calligraphy")).not.toEqual(expect.arrayContaining(["氣口更通透", "設色更克制"]));
    expect(enList("suggestions.calligraphy")).not.toEqual(expect.arrayContaining(["Open up the breathing space", "Restrain the color palette"]));
  });

  it("provides localized recoverable generation failure copy", () => {
    const translators = [
      createTranslator("zh-Hans", dictionaries),
      createTranslator("zh-Hant", dictionaries),
      createTranslator("en", dictionaries)
    ];
    const keys = [
      "generationFailure.classicReference.title",
      "generationFailure.classicReference.hint",
      "generationFailure.classicReference.action",
      "generationFailure.calligraphyReview.title",
      "generationFailure.calligraphyReview.hint",
      "generationFailure.calligraphyReview.status",
      "generationFailure.calligraphyReview.action",
      "generationFailure.retryError"
    ];

    for (const translate of translators) {
      for (const key of keys) {
        expect(translate(key)).not.toBe(key);
        expect(translate(key).trim()).not.toHaveLength(0);
      }
    }
  });
});
