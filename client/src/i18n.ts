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
      photoUploaded: "已选照片",
      selectedPhotoPreview: "已选照片预览",
      removePhoto: "移除照片",
      notesPlaceholder: "也可以补一句想法",
      iterationHint: "将基于上次的主题、风格和选择继续生成，可补一句新想法。",
      continueGenerate: "基于上次生成",
      startOver: "重开画案",
      suggestionStart: "可以开始生成",
      generating: "墨色正在铺开",
      back: "上一步"
    },
    suggestions: ["可以开始生成", "更清雅一点", "留白更多", "更适合挂在客厅", "更适合送礼", "加一点诗意"],
    errors: { generic: "暂时无法完成，请稍后再试。" },
    result: {
      artwork: "作品图",
      fusion: "融合图",
      continue: "继续生成",
      attachPhotoFusion: "补图生成融合图",
      addNotes: "补充要求",
      makeHint: "可先看尺寸和估价，确认意向后再联系制作。",
      failedTitle: "生成未完成",
      failedHint: "可以补充要求后再试一次，或稍后重新生成。",
      imageUnavailableTitle: "作品图暂时无法显示",
      imageUnavailableHint: "可以补充要求后再生成，或稍后从藏卷重新打开。",
      fusionUnavailableTitle: "融合图暂时无法显示",
      fusionUnavailableHint: "作品图仍可继续查看，也可以稍后重新补图。"
    },
    library: {
      artwork: "作品",
      fusion: "作品与融合图",
      failed: "生成未完成",
      removeFavorite: "移出藏卷"
    },
    empty: {
      library: "藏卷还空着",
      libraryHint: "喜欢的画案或生成作品会收在这里。",
      libraryAction: "去画案看看"
    },
    experts: {
      title: "雅匠",
      contactPending: "联系方式待确认",
      serviceHeading: "可咨询方向",
      extraServiceName: "装裱与落地咨询",
      extraServiceDescription: "确认尺寸、材质和制作路径，适合送礼或空间陈设。",
      expectation: "价格按需求评估",
      sampleHeading: "风格样张",
      currentWork: "当前作品",
      currentWorkPreview: "当前作品预览",
      ctaStart: "提交创作需求",
      ctaWithRecord: "用当前作品咨询雅匠"
    },
    production: {
      title: "制作作品",
      intro: "先调整规格、选择服务和参考程度；估价仅作参考，确认后生成单号和联系方式。",
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
      photoUploaded: "已選照片",
      selectedPhotoPreview: "已選照片預覽",
      removePhoto: "移除照片",
      notesPlaceholder: "也可以補一句想法",
      iterationHint: "將基於上次的主題、風格和選擇繼續生成，可補一句新想法。",
      continueGenerate: "基於上次生成",
      startOver: "重開畫案",
      suggestionStart: "可以開始生成",
      generating: "墨色正在鋪開",
      back: "上一步"
    },
    suggestions: ["可以開始生成", "更清雅一點", "留白更多", "更適合掛在客廳", "更適合送禮", "加一點詩意"],
    errors: { generic: "暫時無法完成，請稍後再試。" },
    result: {
      artwork: "作品圖",
      fusion: "融合圖",
      continue: "繼續生成",
      attachPhotoFusion: "補圖生成融合圖",
      addNotes: "補充要求",
      makeHint: "可先看尺寸和估價，確認意向後再聯絡製作。",
      failedTitle: "生成未完成",
      failedHint: "可以補充要求後再試一次，或稍後重新生成。",
      imageUnavailableTitle: "作品圖暫時無法顯示",
      imageUnavailableHint: "可以補充要求後再生成，或稍後從藏卷重新打開。",
      fusionUnavailableTitle: "融合圖暫時無法顯示",
      fusionUnavailableHint: "作品圖仍可繼續查看，也可以稍後重新補圖。"
    },
    library: {
      artwork: "作品",
      fusion: "作品與融合圖",
      failed: "生成未完成",
      removeFavorite: "移出藏卷"
    },
    empty: {
      library: "藏卷還空著",
      libraryHint: "喜歡的畫案或生成作品會收在這裡。",
      libraryAction: "去畫案看看"
    },
    experts: {
      title: "雅匠",
      contactPending: "聯絡方式待確認",
      serviceHeading: "可諮詢方向",
      extraServiceName: "裝裱與落地諮詢",
      extraServiceDescription: "確認尺寸、材質和製作路徑，適合送禮或空間陳設。",
      expectation: "價格按需求評估",
      sampleHeading: "風格樣張",
      currentWork: "目前作品",
      currentWorkPreview: "目前作品預覽",
      ctaStart: "提交創作需求",
      ctaWithRecord: "用目前作品諮詢雅匠"
    },
    production: {
      title: "製作作品",
      intro: "先調整規格、選擇服務和參考程度；估價僅作參考，確認後生成單號和聯絡方式。",
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
      photoUploaded: "Selected photo",
      selectedPhotoPreview: "Selected photo preview",
      removePhoto: "Remove photo",
      notesPlaceholder: "Add one more direction",
      iterationHint: "Generate from your last subject, style, and choices. Add one new direction if needed.",
      continueGenerate: "Generate from last choices",
      startOver: "Start over",
      suggestionStart: "Start generating",
      generating: "Ink is unfolding",
      back: "Back"
    },
    suggestions: ["Start generating", "Make it more refined", "Add more blank space", "Fit a living room", "Better for gifting", "Add poetic feeling"],
    errors: { generic: "Unable to complete this right now. Please try again." },
    result: {
      artwork: "Artwork",
      fusion: "Fusion",
      continue: "Generate again",
      attachPhotoFusion: "Add photo for fusion",
      addNotes: "Add notes",
      makeHint: "Preview size and estimate first; contact follows after confirming intent.",
      failedTitle: "Generation did not finish",
      failedHint: "Add a note and try again, or regenerate later.",
      imageUnavailableTitle: "Artwork cannot be shown right now",
      imageUnavailableHint: "Add notes and generate again, or reopen it from Library later.",
      fusionUnavailableTitle: "Fusion cannot be shown right now",
      fusionUnavailableHint: "The artwork can still be viewed. You can add a photo again later."
    },
    library: {
      artwork: "Artwork",
      fusion: "Artwork and fusion",
      failed: "Generation did not finish",
      removeFavorite: "Remove"
    },
    empty: {
      library: "Library is empty",
      libraryHint: "Saved drafts and generated artworks will appear here.",
      libraryAction: "Go to Studio"
    },
    experts: {
      title: "Artisans",
      contactPending: "Contact details pending",
      serviceHeading: "Consultation directions",
      extraServiceName: "Framing and production advice",
      extraServiceDescription: "Clarify size, material, and production path for gifting or interiors.",
      expectation: "Pricing is assessed by request",
      sampleHeading: "Style samples",
      currentWork: "Current artwork",
      currentWorkPreview: "Current artwork preview",
      ctaStart: "Submit a creative request",
      ctaWithRecord: "Consult with current artwork"
    },
    production: {
      title: "Make Artwork",
      intro: "Adjust size, service, and reference level first. Estimates are indicative; confirmation creates an order number and contact details.",
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
