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
      photo: "可选：添加摆放环境照片",
      photoHint: "用于生成摆放效果图；不添加也能直接生成作品图。",
      camera: "拍照",
      album: "相册",
      skipPhoto: "不需要效果图，直接生成",
      uploadingPhoto: "正在整理照片",
      photoReady: "已提供环境图，将用于生成效果图。",
      photoUploaded: "已选照片",
      selectedPhotoPreview: "已选照片预览",
      removePhoto: "移除照片",
      notesPlaceholder: "也可以补一句想法",
      clearNotes: "清除想法",
      iterationHint: "将基于上次的主题、风格和选择继续生成，可补一句新想法。",
      continueGenerate: "基于上次生成",
      startOver: "重开画案",
      suggestionStart: "可以开始生成",
      generating: "墨色正在铺开",
      generatingWait: "墨色正在铺开，可能需要 2-3 分钟，请耐心等待。",
      generationLimit: "当前已有 2 个生成任务，请等其中一个完成后再开始。",
      back: "上一步",
      generationSummaryArtwork: "将生成作品图。",
      generationSummaryWithPreview: "将生成作品图和摆放效果图。"
    },
    suggestions: ["可以开始生成", "更雅", "留白多些", "更适合客厅", "更适合送礼", "更有诗意", "墨色淡些", "层次更丰富", "更安静", "更有气韵"],
    errors: {
      generic: "暂时无法完成，请稍后再试。",
      photoTooLarge: "照片过大，请选择较小图片或先压缩。",
      libraryOpenFailed: "作品暂时无法打开，请稍后再试。"
    },
    result: {
      artwork: "作品图",
      fusion: "效果图",
      continue: "按这张图继续调整",
      retry: "重新调整要求",
      adjust: "调整作品",
      adjustRetry: "重新生成",
      attachPhotoFusion: "添加照片生成效果图",
      addNotes: "补充要求",
      makeHint: "可先看尺寸和估价，确认意向后再联系制作。",
      failedTitle: "生成未完成",
      failedHint: "可以补充要求后再试一次，或稍后重新生成。",
      imageUnavailableTitle: "作品图暂时无法显示",
      imageUnavailableHint: "可以补充要求后再生成，或稍后从藏卷重新打开。",
      fusionUnavailableTitle: "效果图暂时无法显示",
      fusionUnavailableHint: "作品图仍可继续查看，也可以稍后重新提供环境图。"
    },
    adjust: {
      title: "调整这张作品",
      intro: "描述想调整的方向，会基于这张作品的设定重新生成一张全新作品。",
      placeholder: "例如：更清雅一点、留白更多、换成竖幅……",
      submit: "生成调整后的作品",
      submitting: "墨色正在铺开",
      back: "返回作品",
      baseLabel: "当前作品",
      emptyHint: "先写一句调整方向再生成。"
    },
    library: {
      artwork: "作品",
      fusion: "作品与效果图",
      failed: "生成未完成",
      openRecord: "查看作品",
      removeFavorite: "移出藏卷",
      removeFavoriteShort: "移出",
      removeConfirmTitle: "从藏卷移出？",
      removeConfirmHint: "作品记录不会删除。",
      removeConfirmCancel: "取消",
      removeConfirmAction: "移出"
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
      ctaStart: "去生成作品",
      ctaWithRecord: "用当前作品咨询雅匠",
      productionUnavailable: "暂未开放制作咨询"
    },
    production: {
      title: "制作作品",
      intro: "先调整规格、选择服务和参考程度；估价仅作参考，确认后生成单号和联系方式。",
      size: "规格",
      estimate: "估算",
      contact: "联系后沟通具体事项",
      phone: "电话：",
      wechat: "微信：",
      copyHint: "（点击拷贝）",
      copiedOrder: "已拷贝单号",
      copiedWechat: "已拷贝微信",
      successTitle: "制作意向已记录",
      successIntro: "已保存当前规格与参考要求，接下来可直接联系沟通制作细节。",
      summaryService: "制作方式",
      summarySize: "制作规格",
      summaryReference: "参考程度",
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
      photo: "可選：加入擺放環境照片",
      photoHint: "用於生成擺放效果圖；不加入也能直接生成作品圖。",
      camera: "拍照",
      album: "相簿",
      skipPhoto: "不需要效果圖，直接生成",
      uploadingPhoto: "正在整理照片",
      photoReady: "已提供環境圖，將用於生成效果圖。",
      photoUploaded: "已選照片",
      selectedPhotoPreview: "已選照片預覽",
      removePhoto: "移除照片",
      notesPlaceholder: "也可以補一句想法",
      clearNotes: "清除想法",
      iterationHint: "將基於上次的主題、風格和選擇繼續生成，可補一句新想法。",
      continueGenerate: "基於上次生成",
      startOver: "重開畫案",
      suggestionStart: "可以開始生成",
      generating: "墨色正在鋪開",
      generatingWait: "墨色正在鋪開，可能需要 2-3 分鐘，請耐心等待。",
      generationLimit: "目前已有 2 個生成任務，請等其中一個完成後再開始。",
      back: "上一步",
      generationSummaryArtwork: "將生成作品圖。",
      generationSummaryWithPreview: "將生成作品圖和擺放效果圖。"
    },
    suggestions: ["可以開始生成", "更雅", "留白多些", "更適合客廳", "更適合送禮", "更有詩意", "墨色淡些", "層次更豐富", "更安靜", "更有氣韻"],
    errors: {
      generic: "暫時無法完成，請稍後再試。",
      photoTooLarge: "照片過大，請選擇較小圖片或先壓縮。",
      libraryOpenFailed: "作品暫時無法打開，請稍後再試。"
    },
    result: {
      artwork: "作品圖",
      fusion: "效果圖",
      continue: "按這張圖繼續調整",
      retry: "重新調整要求",
      adjust: "調整作品",
      adjustRetry: "重新生成",
      attachPhotoFusion: "加入擺放照片生成效果圖",
      addNotes: "補充要求",
      makeHint: "可先看尺寸和估價，確認意向後再聯絡製作。",
      failedTitle: "生成未完成",
      failedHint: "可以補充要求後再試一次，或稍後重新生成。",
      imageUnavailableTitle: "作品圖暫時無法顯示",
      imageUnavailableHint: "可以補充要求後再生成，或稍後從藏卷重新打開。",
      fusionUnavailableTitle: "效果圖暫時無法顯示",
      fusionUnavailableHint: "作品圖仍可繼續查看，也可以稍後重新提供環境圖。"
    },
    adjust: {
      title: "調整這張作品",
      intro: "描述想調整的方向，會基於這張作品的設定重新生成一張全新作品。",
      placeholder: "例如：更清雅一點、留白更多、換成豎幅……",
      submit: "生成調整後的作品",
      submitting: "墨色正在鋪開",
      back: "返回作品",
      baseLabel: "目前作品",
      emptyHint: "先寫一句調整方向再生成。"
    },
    library: {
      artwork: "作品",
      fusion: "作品與效果圖",
      failed: "生成未完成",
      openRecord: "查看作品",
      removeFavorite: "移出藏卷",
      removeFavoriteShort: "移出",
      removeConfirmTitle: "從藏卷移出？",
      removeConfirmHint: "作品記錄不會刪除。",
      removeConfirmCancel: "取消",
      removeConfirmAction: "移出"
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
      ctaStart: "去生成作品",
      ctaWithRecord: "用目前作品諮詢雅匠",
      productionUnavailable: "暫未開放製作諮詢"
    },
    production: {
      title: "製作作品",
      intro: "先調整規格、選擇服務和參考程度；估價僅作參考，確認後生成單號和聯絡方式。",
      size: "規格",
      estimate: "估算",
      contact: "聯絡後溝通具體事項",
      phone: "電話：",
      wechat: "微信：",
      copyHint: "（點擊拷貝）",
      copiedOrder: "已拷貝單號",
      copiedWechat: "已拷貝微信",
      successTitle: "製作意向已記錄",
      successIntro: "已保存目前規格與參考要求，接下來可直接聯絡溝通製作細節。",
      summaryService: "製作方式",
      summarySize: "製作規格",
      summaryReference: "參考程度",
      close: "關閉",
      confirm: "確認製作意向"
    }
  },
  en: {
    language: { label: "Language" },
    studio: {
      title: "Inkspire",
      subtitle: "Chinese painting and calligraphy in a garden scroll",
      photo: "Optional: add a placement photo",
      photoHint: "Use it to generate a room preview. You can skip it and create artwork now.",
      camera: "Camera",
      album: "Album",
      skipPhoto: "No preview photo, generate artwork",
      uploadingPhoto: "Preparing photo",
      photoReady: "Environment image added. It will be used to generate a preview.",
      photoUploaded: "Selected photo",
      selectedPhotoPreview: "Selected photo preview",
      removePhoto: "Remove photo",
      notesPlaceholder: "Add one more direction",
      clearNotes: "Clear notes",
      iterationHint: "Generate from your last subject, style, and choices. Add one new direction if needed.",
      continueGenerate: "Generate from last choices",
      startOver: "Start over",
      suggestionStart: "Start generating",
      generating: "Ink is unfolding",
      generatingWait: "Ink is unfolding. This may take 2-3 minutes. Please wait.",
      generationLimit: "You already have 2 generation tasks. Please wait for one to finish.",
      back: "Back",
      generationSummaryArtwork: "Artwork image will be generated.",
      generationSummaryWithPreview: "Artwork and placement preview will be generated."
    },
    suggestions: ["Start generating", "More refined", "More blank space", "For living room", "For gifting", "More poetic", "Lighter ink", "Richer layers", "Calmer", "More lively energy"],
    errors: {
      generic: "Unable to complete this right now. Please try again.",
      photoTooLarge: "Photo is too large. Choose a smaller image or compress it first.",
      libraryOpenFailed: "This artwork cannot be opened right now. Please try again later."
    },
    result: {
      artwork: "Artwork",
      fusion: "Preview",
      continue: "Adjust from this artwork",
      retry: "Adjust request again",
      adjust: "Adjust artwork",
      adjustRetry: "Generate again",
      attachPhotoFusion: "Add a placement photo for preview",
      addNotes: "Add notes",
      makeHint: "Preview size and estimate first; contact follows after confirming intent.",
      failedTitle: "Generation did not finish",
      failedHint: "Add a note and try again, or regenerate later.",
      imageUnavailableTitle: "Artwork cannot be shown right now",
      imageUnavailableHint: "Add notes and generate again, or reopen it from Library later.",
      fusionUnavailableTitle: "Preview cannot be shown right now",
      fusionUnavailableHint: "The artwork can still be viewed. You can add a room photo again later."
    },
    adjust: {
      title: "Adjust this artwork",
      intro: "Describe the direction you want. A brand-new artwork is generated from this one's settings.",
      placeholder: "e.g. more refined, more blank space, switch to a vertical format…",
      submit: "Generate the adjusted artwork",
      submitting: "Ink is unfolding",
      back: "Back to artwork",
      baseLabel: "Current artwork",
      emptyHint: "Write an adjustment direction first."
    },
    library: {
      artwork: "Artwork",
      fusion: "Artwork and preview",
      failed: "Generation did not finish",
      openRecord: "View artwork",
      removeFavorite: "Remove from Library",
      removeFavoriteShort: "Remove",
      removeConfirmTitle: "Remove from Library?",
      removeConfirmHint: "The artwork record will not be deleted.",
      removeConfirmCancel: "Cancel",
      removeConfirmAction: "Remove"
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
      ctaStart: "Create artwork",
      ctaWithRecord: "Consult with current artwork",
      productionUnavailable: "Production consultation is not open yet"
    },
    production: {
      title: "Make Artwork",
      intro: "Adjust size, service, and reference level first. Estimates are indicative; confirmation creates an order number and contact details.",
      size: "Size",
      estimate: "Estimate",
      contact: "Contact the artisan to confirm details",
      phone: "Phone: ",
      wechat: "WeChat: ",
      copyHint: "(click to copy)",
      copiedOrder: "Copied order number",
      copiedWechat: "Copied WeChat",
      successTitle: "Production request recorded",
      successIntro: "Your selected size and reference direction are saved. You can now contact the artisan directly.",
      summaryService: "Service",
      summarySize: "Size",
      summaryReference: "Reference level",
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
