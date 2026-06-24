import { describe, expect, it } from "vitest";
import en from "../../config/i18n/en.json";
import zhHans from "../../config/i18n/zh-Hans.json";
import zhHant from "../../config/i18n/zh-Hant.json";
import { createListTranslator, createTranslator } from "../src/i18n";

const dictionaries = {
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
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
    expect(t("studio.subtitle")).toBe("Chinese painting and calligraphy in a garden scroll");
    expect(t("result.continue")).toBe("Generate again");
    expect(t("production.confirm")).toBe("Confirm production");
  });

  it("uses locale-specific default suggestion lists", () => {
    const zhHantList = createListTranslator("zh-Hant", dictionaries);
    const enList = createListTranslator("en", dictionaries);

    expect(zhHantList("suggestions")[0]).toBe("可以開始生成");
    expect(enList("suggestions")[0]).toBe("Start generating");
  });
});
