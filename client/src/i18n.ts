import type { Locale } from "./domain";

export type Dictionary = Record<string, unknown>;
export type Dictionaries = Partial<Record<Locale, Dictionary>>;

const CLIENT_OVERRIDES: Dictionaries = {
  "zh-Hans": {
    language: { label: "语言" },
    tabs: { experts: "雅匠" },
    studio: {
      title: "墨起",
      subtitle: "园林卷轴里的书画生成",
      photo: "照片可选",
      camera: "拍照",
      album: "相册",
      skipPhoto: "先不放照片",
      uploadingPhoto: "正在整理照片",
      photoReady: "照片已准备，将生成融合图",
      notesPlaceholder: "也可以补一句想法",
      suggestionStart: "可以开始生成",
      generating: "墨色正在铺开"
    },
    suggestions: ["可以开始生成", "更清雅一点", "留白更多", "更适合挂在客厅", "更适合送礼", "加一点诗意"],
    errors: { generic: "暂时无法完成，请稍后再试。" },
    result: {
      artwork: "作品图",
      fusion: "融合图",
      continue: "继续生成",
      attachPhotoFusion: "补图生成融合图",
      addNotes: "补充要求",
      failedTitle: "生成未完成",
      failedHint: "可以补充要求后再试一次，或稍后重新生成。"
    },
    library: {
      artwork: "作品",
      fusion: "作品与融合图",
      failed: "生成未完成",
      removeFavorite: "移出藏卷"
    },
    empty: { library: "还没有收藏作品" },
    experts: { title: "雅匠", contactPending: "联系方式待确认" },
    production: {
      title: "制作作品",
      size: "规格",
      estimate: "估算",
      contact: "联系后沟通具体事项",
      phone: "电话：",
      wechat: "微信：",
      close: "关闭",
      confirm: "确认制作意向"
    }
  },
  "zh-Hant": {
    language: { label: "語言" },
    tabs: { experts: "雅匠" },
    studio: {
      title: "墨起",
      subtitle: "園林卷軸裡的書畫生成",
      photo: "照片可選",
      camera: "拍照",
      album: "相簿",
      skipPhoto: "先不放照片",
      uploadingPhoto: "正在整理照片",
      photoReady: "照片已準備，將生成融合圖",
      notesPlaceholder: "也可以補一句想法",
      suggestionStart: "可以開始生成",
      generating: "墨色正在鋪開"
    },
    suggestions: ["可以開始生成", "更清雅一點", "留白更多", "更適合掛在客廳", "更適合送禮", "加一點詩意"],
    errors: { generic: "暫時無法完成，請稍後再試。" },
    result: {
      artwork: "作品圖",
      fusion: "融合圖",
      continue: "繼續生成",
      attachPhotoFusion: "補圖生成融合圖",
      addNotes: "補充要求",
      failedTitle: "生成未完成",
      failedHint: "可以補充要求後再試一次，或稍後重新生成。"
    },
    library: {
      artwork: "作品",
      fusion: "作品與融合圖",
      failed: "生成未完成",
      removeFavorite: "移出藏卷"
    },
    empty: { library: "還沒有收藏作品" },
    experts: { title: "雅匠", contactPending: "聯絡方式待確認" },
    production: {
      title: "製作作品",
      size: "規格",
      estimate: "估算",
      contact: "聯絡後溝通具體事項",
      phone: "電話：",
      wechat: "微信：",
      close: "關閉",
      confirm: "確認製作意向"
    }
  },
  en: {
    language: { label: "Language" },
    studio: {
      title: "Inkspire",
      subtitle: "Chinese painting and calligraphy in a garden scroll",
      photo: "Photo optional",
      camera: "Camera",
      album: "Album",
      skipPhoto: "Skip photo",
      uploadingPhoto: "Preparing photo",
      photoReady: "Photo ready for fusion",
      notesPlaceholder: "Add one more direction",
      suggestionStart: "Start generating",
      generating: "Ink is unfolding"
    },
    suggestions: ["Start generating", "Make it more refined", "Add more blank space", "Fit a living room", "Better for gifting", "Add poetic feeling"],
    errors: { generic: "Unable to complete this right now. Please try again." },
    result: {
      artwork: "Artwork",
      fusion: "Fusion",
      continue: "Generate again",
      attachPhotoFusion: "Add photo for fusion",
      addNotes: "Add notes",
      failedTitle: "Generation did not finish",
      failedHint: "Add a note and try again, or regenerate later."
    },
    library: {
      artwork: "Artwork",
      fusion: "Artwork and fusion",
      failed: "Generation did not finish",
      removeFavorite: "Remove"
    },
    empty: { library: "No saved artworks yet" },
    experts: { title: "Artisans", contactPending: "Contact details pending" },
    production: {
      title: "Make Artwork",
      size: "Size",
      estimate: "Estimate",
      contact: "Contact the artisan to confirm details",
      phone: "Phone: ",
      wechat: "WeChat: ",
      close: "Close",
      confirm: "Confirm production"
    }
  }
};

function mergeDictionary(base: Dictionary = {}, override: Dictionary = {}): Dictionary {
  const result: Dictionary = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeDictionary(current, value)
      : value;
  }
  return result;
}

function isPlainObject(value: unknown): value is Dictionary {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lookup(dictionary: Dictionary | undefined, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!isPlainObject(current)) {
      return undefined;
    }
    return current[part];
  }, dictionary);
}

export function normalizeDictionaries(dictionaries: Dictionaries): Dictionaries {
  return {
    "zh-Hans": mergeDictionary(dictionaries["zh-Hans"], CLIENT_OVERRIDES["zh-Hans"]),
    "zh-Hant": mergeDictionary(dictionaries["zh-Hant"], CLIENT_OVERRIDES["zh-Hant"]),
    en: mergeDictionary(dictionaries.en, CLIENT_OVERRIDES.en)
  };
}

export function createTranslator(locale: Locale, dictionaries: Dictionaries) {
  const normalized = normalizeDictionaries(dictionaries);
  return (key: string): string => {
    const active = lookup(normalized[locale], key);
    const fallback = lookup(normalized["zh-Hans"], key);
    const value = typeof active === "string" ? active : fallback;
    return typeof value === "string" ? value : key;
  };
}

export function createListTranslator(locale: Locale, dictionaries: Dictionaries) {
  const normalized = normalizeDictionaries(dictionaries);
  return (key: string): string[] => {
    const active = lookup(normalized[locale], key);
    const fallback = lookup(normalized["zh-Hans"], key);
    if (Array.isArray(active) && active.every((item) => typeof item === "string")) {
      return active;
    }
    if (Array.isArray(fallback) && fallback.every((item) => typeof item === "string")) {
      return fallback;
    }
    return [];
  };
}
