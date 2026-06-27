import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowLeft, CheckCircle2, Ruler, X } from "lucide-react";
import {
  createProductionOrder,
  getProductionEstimate,
  type ArtworkSize,
  type Expert,
  type GenerationRecord,
  type ProductionContact,
  type ProductionEstimate,
  type ProductionOrder
} from "../api";
import type { Locale } from "../domain";

type ProductionSize = ArtworkSize & {
  labelText: Record<Locale, string>;
  hint: Record<Locale, string>;
};

type ReferenceTone = "recommended" | "neutral" | "caution";

type ReferenceLevel = {
  value: number;
  title: Record<Locale, string>;
  shortTitle: Record<Locale, string>;
  hint: Record<Locale, string>;
  tone: ReferenceTone;
};

const DEFAULT_SIZE: ArtworkSize & { labelText: Record<Locale, string>; reasonText: Record<Locale, string> } = {
  preset_id: "medium",
  label: "中幅雅作",
  width_cm: 45,
  height_cm: 68,
  reason: "常用客厅、书房尺寸，先按中幅预填。",
  labelText: { "zh-Hans": "中幅雅作", "zh-Hant": "中幅雅作", en: "Medium artwork" },
  reasonText: {
    "zh-Hans": "常用客厅、书房尺寸，先按中幅预填。",
    "zh-Hant": "常用客廳、書房尺寸，先按中幅預填。",
    en: "A common living-room or study size, prefilled as a medium artwork."
  }
};

const SIZE_OPTIONS: ProductionSize[] = [
  {
    preset_id: "small",
    label: "小幅点景",
    labelText: { "zh-Hans": "小幅点景", "zh-Hant": "小幅點景", en: "Small accent" },
    width_cm: 30,
    height_cm: 45,
    hint: { "zh-Hans": "约一张海报大小，适合玄关、书桌旁。", "zh-Hant": "約一張海報大小，適合玄關、書桌旁。", en: "Poster-like, good for entryways and desks." }
  },
  {
    preset_id: "medium",
    label: "中幅雅作",
    labelText: { "zh-Hans": "中幅雅作", "zh-Hant": "中幅雅作", en: "Medium artwork" },
    width_cm: 45,
    height_cm: 68,
    hint: { "zh-Hans": "最常用，适合书房、客厅边柜、礼赠。", "zh-Hant": "最常用，適合書房、客廳邊櫃、禮贈。", en: "Most common, good for studies, sideboards, and gifts." }
  },
  {
    preset_id: "large",
    label: "厅堂主景",
    labelText: { "zh-Hans": "厅堂主景", "zh-Hant": "廳堂主景", en: "Feature wall" },
    width_cm: 60,
    height_cm: 90,
    hint: { "zh-Hans": "更有存在感，适合沙发墙或厅堂主位。", "zh-Hant": "更有存在感，適合沙發牆或廳堂主位。", en: "More prominent, good for feature walls." }
  },
  {
    preset_id: "square_scene",
    label: "方形点景",
    labelText: { "zh-Hans": "方形点景", "zh-Hant": "方形點景", en: "Square accent" },
    width_cm: 50,
    height_cm: 50,
    hint: { "zh-Hans": "接近抱枕宽度，适合方形留白或组合陈设。", "zh-Hant": "接近抱枕寬度，適合方形留白或組合陳設。", en: "Square accent size for balanced displays." }
  },
  {
    preset_id: "landscape_scene",
    label: "横向陈设",
    labelText: { "zh-Hans": "横向陈设", "zh-Hant": "橫向陳設", en: "Landscape display" },
    width_cm: 68,
    height_cm: 45,
    hint: { "zh-Hans": "适合横向墙面、边柜上方或长桌背景。", "zh-Hant": "適合橫向牆面、邊櫃上方或長桌背景。", en: "Wide format for horizontal walls." }
  }
];

const REFERENCE_LEVELS: ReferenceLevel[] = [
  {
    value: 1,
    title: { "zh-Hans": "第1级 严格参考", "zh-Hant": "第1級 嚴格參考", en: "Level 1 Strict" },
    shortTitle: { "zh-Hans": "严格", "zh-Hant": "嚴格", en: "Strict" },
    hint: { "zh-Hans": "几乎照搬 AI 图的构图与细节，艺术家发挥空间较小，不太推荐。", "zh-Hant": "幾乎照搬 AI 圖的構圖與細節，藝術家發揮空間較小，不太推薦。", en: "Mirrors the AI work, leaving little artistic room — not advised." },
    tone: "caution"
  },
  {
    value: 2,
    title: { "zh-Hans": "第2级 主要参考", "zh-Hant": "第2級 主要參考", en: "Level 2 Close" },
    shortTitle: { "zh-Hans": "主要", "zh-Hant": "主要", en: "Close" },
    hint: { "zh-Hans": "整体贴近 AI 图，构图与色调一致，局部留给艺术家自由处理。", "zh-Hant": "整體貼近 AI 圖，構圖與色調一致，局部留給藝術家自由處理。", en: "Stays close to the AI work, with local room for artistic choices." },
    tone: "neutral"
  },
  {
    value: 3,
    title: { "zh-Hans": "第3级 布局参考", "zh-Hant": "第3級 章法參考", en: "Level 3 Layout" },
    shortTitle: { "zh-Hans": "布局", "zh-Hant": "章法", en: "Layout" },
    hint: { "zh-Hans": "保留整体布局与气势，细节交由艺术家自由发挥与提升。", "zh-Hant": "保留整體章法與氣勢，細節交由藝術家自由發揮與提升。", en: "Keeps the overall layout while artists refine the details freely." },
    tone: "recommended"
  },
  {
    value: 4,
    title: { "zh-Hans": "第4级 气质参考", "zh-Hant": "第4級 氣質參考", en: "Level 4 Mood" },
    shortTitle: { "zh-Hans": "气质", "zh-Hant": "氣質", en: "Mood" },
    hint: { "zh-Hans": "只保留画面的气质与主题，构图可由艺术家重新组织安排。", "zh-Hant": "只保留畫面的氣質與主題，構圖可由藝術家重新組織安排。", en: "Keeps only the mood and theme; artists may recompose the scene." },
    tone: "neutral"
  },
  {
    value: 5,
    title: { "zh-Hans": "第5级 自由创作", "zh-Hant": "第5級 自由創作", en: "Level 5 Free" },
    shortTitle: { "zh-Hans": "自由", "zh-Hant": "自由", en: "Free" },
    hint: { "zh-Hans": "AI 图仅作灵感参考，画面主要交给艺术家自由发挥与创作。", "zh-Hant": "AI 圖僅作靈感參考，畫面主要交給藝術家自由發揮與創作。", en: "Treats the AI work as inspiration; artists mostly create freely." },
    tone: "neutral"
  }
];

interface ProductionDialogProps {
  expert: Expert;
  supportContact?: ProductionContact;
  locale: Locale;
  record: GenerationRecord;
  title: string;
  introLabel: string;
  closeLabel: string;
  sizeLabel: string;
  estimateLabel: string;
  contactLabel: string;
  phoneLabel: string;
  wechatLabel: string;
  copyHintLabel: string;
  copiedOrderLabel: string;
  copiedWechatLabel: string;
  successTitleLabel: string;
  successIntroLabel: string;
  summaryServiceLabel: string;
  summarySizeLabel: string;
  summaryReferenceLabel: string;
  referenceRecommendedBadgeLabel: string;
  referenceCautionBadgeLabel: string;
  confirmLabel: string;
  contactPendingLabel: string;
  productionAvailable?: boolean;
  productionUnavailableLabel: string;
  onClose: () => void;
}

function text(value: Record<Locale, string>, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function customSizeLabel(locale: Locale): string {
  return locale === "en" ? "Custom size" : locale === "zh-Hant" ? "自訂尺寸" : "自定义尺寸";
}

function localizedSizeName(size: ArtworkSize, locale: Locale): string {
  if (size.preset_id === "custom") {
    return customSizeLabel(locale);
  }
  const preset = SIZE_OPTIONS.find((option) => option.preset_id === size.preset_id);
  if (preset) {
    return text(preset.labelText, locale);
  }
  if (size.preset_id === DEFAULT_SIZE.preset_id) {
    return text(DEFAULT_SIZE.labelText, locale);
  }
  return locale === "en" && /[\u3400-\u9fff]/.test(size.label) ? "Suggested size" : size.label;
}

function sizeLabel(size: ArtworkSize, locale: Locale): string {
  const qualifier = locale === "en" ? "approx." : "约";
  return `${localizedSizeName(size, locale)} · ${qualifier} ${size.width_cm} × ${size.height_cm} cm`;
}

function sizeHint(size: ArtworkSize, locale: Locale): string {
  const preset = SIZE_OPTIONS.find((option) => option.preset_id === size.preset_id);
  if (preset) {
    return text(preset.hint, locale);
  }
  if (size.preset_id === DEFAULT_SIZE.preset_id) {
    return text(DEFAULT_SIZE.reasonText, locale);
  }
  if (!size.reason) {
    return "";
  }
  return locale === "en" && /[\u3400-\u9fff]/.test(size.reason) ? "Suggested from the artwork size estimate." : size.reason;
}

function estimateSizeKey(size: ArtworkSize): string {
  return ["small", "medium", "large"].includes(size.preset_id) ? size.preset_id : "medium";
}

function scrollIntoViewIfAvailable(element: HTMLElement | null, options: ScrollIntoViewOptions): void {
  if (typeof element?.scrollIntoView === "function") {
    element.scrollIntoView(options);
  }
}

export default function ProductionDialog({
  expert,
  supportContact,
  locale,
  record,
  title,
  introLabel,
  closeLabel,
  sizeLabel: sizeSectionLabel,
  estimateLabel,
  contactLabel,
  phoneLabel,
  wechatLabel,
  copyHintLabel,
  copiedOrderLabel,
  copiedWechatLabel,
  successTitleLabel,
  successIntroLabel,
  summaryServiceLabel,
  summarySizeLabel,
  summaryReferenceLabel,
  referenceRecommendedBadgeLabel,
  referenceCautionBadgeLabel,
  confirmLabel,
  contactPendingLabel,
  productionAvailable = true,
  productionUnavailableLabel,
  onClose
}: ProductionDialogProps) {
  const inferredSize = record.recommended_artwork_size ?? DEFAULT_SIZE;
  const [selectedService, setSelectedService] = useState(expert.services[0]?.id ?? "");
  const [selectedSize, setSelectedSize] = useState<ArtworkSize>(inferredSize);
  const [draftSize, setDraftSize] = useState<ArtworkSize>(inferredSize);
  const [customWidth, setCustomWidth] = useState(String(inferredSize.width_cm));
  const [customHeight, setCustomHeight] = useState(String(inferredSize.height_cm));
  const [referenceLevel, setReferenceLevel] = useState(3);
  const [estimate, setEstimate] = useState<ProductionEstimate | null>(null);
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [page, setPage] = useState<"main" | "size">("main");
  const [error, setError] = useState("");
  const [copyToast, setCopyToast] = useState("");
  const [referenceHintMinHeight, setReferenceHintMinHeight] = useState(0);
  const dialogTitleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const contactPanelRef = useRef<HTMLDivElement | null>(null);
  const customSizeRef = useRef<HTMLDivElement | null>(null);
  const referenceHintRef = useRef<HTMLDivElement | null>(null);
  const referenceHintMeasureRef = useRef<HTMLDivElement | null>(null);
  const copyToastTimerRef = useRef<number | null>(null);
  const selectedReference = REFERENCE_LEVELS.find((level) => level.value === referenceLevel) ?? REFERENCE_LEVELS[2];
  const copyHintSuffix = locale === "en" ? ` ${copyHintLabel}` : copyHintLabel;
  const copyToClipboard = async (value: string, toastLabel: string) => {
    if (!navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (copyToastTimerRef.current !== null) {
        window.clearTimeout(copyToastTimerRef.current);
      }
      setCopyToast(toastLabel);
      copyToastTimerRef.current = window.setTimeout(() => {
        setCopyToast("");
        copyToastTimerRef.current = null;
      }, 1600);
    } catch {
      // Ignore clipboard failures; the hint remains best-effort.
    }
  };
  const contact = {
    phone: expert.phone || supportContact?.phone || "",
    wechat: expert.wechat || supportContact?.wechat || ""
  };
  const productionOpen = productionAvailable && Boolean(contact.phone || contact.wechat);
  const presetOptions = useMemo(() => {
    const hasInferred = SIZE_OPTIONS.some((option) => option.preset_id === inferredSize.preset_id);
    return hasInferred ? SIZE_OPTIONS : [inferredSize as ProductionSize, ...SIZE_OPTIONS];
  }, [inferredSize]);
  const customSelected = draftSize.preset_id === "custom";
  const customWidthValue = Number(customWidth);
  const customHeightValue = Number(customHeight);
  const customSizeValid = !customSelected || (
    Number.isFinite(customWidthValue) &&
    Number.isFinite(customHeightValue) &&
    customWidthValue > 0 &&
    customHeightValue > 0 &&
    customWidthValue <= 300 &&
    customHeightValue <= 300
  );
  const customSizeError = customSelected && !customSizeValid
    ? (locale === "en" ? "Enter valid width and height." : "请输入有效的宽高尺寸")
    : "";
  const selectedServiceDetails = expert.services.find((service) => service.id === selectedService) ?? expert.services[0];

  useEffect(() => {
    getProductionEstimate(record.id, expert.id, estimateSizeKey(selectedSize))
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [expert.id, record.id, selectedSize]);

  useEffect(() => {
    if (!order) {
      return;
    }
    scrollIntoViewIfAvailable(contactPanelRef.current, { behavior: "smooth", block: "start" });
  }, [order]);

  useEffect(() => {
    if (page !== "size" || !customSelected) {
      return;
    }
    scrollIntoViewIfAvailable(customSizeRef.current, { behavior: "smooth", block: "nearest" });
  }, [customSelected, page]);

  useLayoutEffect(() => {
    if (page !== "main" || order) {
      return;
    }
    const measureMaxReferenceHintHeight = () => {
      const measure = referenceHintMeasureRef.current;
      const hint = referenceHintRef.current;
      if (!measure || !hint) {
        return;
      }
      const width = hint.offsetWidth;
      if (width <= 0) {
        return;
      }
      measure.style.width = `${width}px`;
      let maxHeight = 0;
      for (const level of REFERENCE_LEVELS) {
        const strong = document.createElement("strong");
        strong.textContent = text(level.title, locale);
        const span = document.createElement("span");
        span.textContent = text(level.hint, locale);
        measure.replaceChildren(strong, span);
        maxHeight = Math.max(maxHeight, measure.offsetHeight);
      }
      measure.replaceChildren();
      setReferenceHintMinHeight(maxHeight);
    };
    measureMaxReferenceHintHeight();
    window.addEventListener("resize", measureMaxReferenceHintHeight);
    return () => window.removeEventListener("resize", measureMaxReferenceHintHeight);
  }, [locale, page, order]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      if (copyToastTimerRef.current !== null) {
        window.clearTimeout(copyToastTimerRef.current);
      }
      previousFocus?.focus();
    };
  }, []);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    ) ?? []).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const chooseSize = (size: ArtworkSize) => {
    setDraftSize(size);
    if (size.preset_id !== "custom") {
      setCustomWidth(String(size.width_cm));
      setCustomHeight(String(size.height_cm));
    }
  };

  const chooseCustomSize = () => {
    setDraftSize({
      preset_id: "custom",
      label: customSizeLabel(locale),
      width_cm: Number(customWidth) || selectedSize.width_cm,
      height_cm: Number(customHeight) || selectedSize.height_cm
    });
  };

  const applySize = () => {
    if (customSelected && !customSizeValid) {
      return;
    }
    const nextSize = customSelected
      ? {
        preset_id: "custom",
        label: customSizeLabel(locale),
        width_cm: Number(customWidth),
        height_cm: Number(customHeight)
      }
      : draftSize;
    setSelectedSize(nextSize);
    setOrder(null);
    setPage("main");
  };

  const confirm = async () => {
    if (!selectedService || !productionOpen) {
      return;
    }
    setError("");
    try {
      setOrder(await createProductionOrder({
        recordId: record.id,
        expertId: expert.id,
        serviceId: selectedService,
        size: selectedSize,
        referenceLevel
      }));
    } catch {
      setError(locale === "en" ? "Unable to create the order. Please try again." : "暂时无法生成单号，请稍后再试。");
    }
  };

  return (
    <div className="dialog-layer">
      <section
        className="production-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onKeyDown={onDialogKeyDown}
      >
        <div className="dialog-heading">
          <div>
            <h2 id={dialogTitleId}>{page === "size" ? (locale === "en" ? "Adjust Artwork Size" : "调整作品尺寸") : order ? successTitleLabel : title}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {page === "size" ? (
          <div className="size-adjust-panel">
            <button className="secondary-action compact-action" type="button" onClick={() => setPage("main")}>
              <ArrowLeft aria-hidden="true" size={16} />
              {locale === "en" ? "Back" : "返回"}
            </button>
            <div className="size-list" role="radiogroup" aria-label={locale === "en" ? "Artwork size presets" : "作品尺寸预设"}>
              {presetOptions.map((option) => (
                <button
                  key={option.preset_id}
                  type="button"
                  role="radio"
                  aria-checked={draftSize.preset_id === option.preset_id}
                  className={draftSize.preset_id === option.preset_id ? "size-chip selected" : "size-chip"}
                  onClick={() => chooseSize(option)}
                >
                  <strong>{sizeLabel(option, locale)}</strong>
                  <span>{sizeHint(option, locale)}</span>
                </button>
              ))}
              <div
                ref={customSizeRef}
                role="radio"
                tabIndex={0}
                aria-checked={customSelected}
                className={customSelected ? "size-chip custom-size-card selected" : "size-chip custom-size-card"}
                onClick={chooseCustomSize}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    chooseCustomSize();
                  }
                }}
              >
                <strong>{customSizeLabel(locale)}</strong>
                <span>{locale === "en" ? "Enter width and height in centimeters." : "自己输入宽和高，单位是厘米。"}</span>
                {customSelected ? (
                  <div className="custom-size-grid" onClick={(event) => event.stopPropagation()}>
                    <label>
                      {locale === "en" ? "Width cm" : locale === "zh-Hant" ? "寬度 cm" : "宽度 cm"}
                      <input aria-label={locale === "en" ? "Width cm" : locale === "zh-Hant" ? "寬度 cm" : "宽度 cm"} inputMode="decimal" value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} />
                    </label>
                    <label>
                      {locale === "en" ? "Height cm" : locale === "zh-Hant" ? "高度 cm" : "高度 cm"}
                      <input aria-label={locale === "en" ? "Height cm" : "高度 cm"} inputMode="decimal" value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
            {customSizeError ? <p className="error-line size-error">{customSizeError}</p> : null}
            <button className="primary-action" type="button" disabled={customSelected && !customSizeValid} onClick={applySize}>
              {locale === "en" ? "Use this size" : "用这个尺寸"}
            </button>
          </div>
        ) : order ? (
          <div className="production-success">
            <div className="production-success-hero">
              <CheckCircle2 aria-hidden="true" size={26} />
              <strong>{successTitleLabel}</strong>
              <p>{successIntroLabel}</p>
            </div>

            <div className="production-summary-grid">
              <div className="production-summary-card">
                <span>{summaryServiceLabel}</span>
                <strong>{selectedServiceDetails?.name[locale] ?? selectedServiceDetails?.name["zh-Hans"]}</strong>
              </div>
              <div className="production-summary-card">
                <span>{summarySizeLabel}</span>
                <strong>{sizeLabel(selectedSize, locale)}</strong>
              </div>
              <div className="production-summary-card">
                <span>{summaryReferenceLabel}</span>
                <strong>{text(selectedReference.hint, locale)}</strong>
              </div>
            </div>

            <div className="contact-panel" ref={contactPanelRef}>
              <strong>{contactLabel}</strong>
              {contact.phone ? <span>{phoneLabel}{contact.phone}</span> : null}
              {contact.wechat ? (
                <button
                  type="button"
                  className="contact-copy-action surface-clear-button"
                  onClick={() => void copyToClipboard(contact.wechat, copiedWechatLabel)}
                >
                  {wechatLabel}{contact.wechat}{copyHintSuffix}
                </button>
              ) : null}
              <button
                type="button"
                className="contact-copy-action surface-clear-button"
                onClick={() => void copyToClipboard(order.id, copiedOrderLabel)}
              >
                {locale === "en" ? `Order: ${order.id}${copyHintSuffix}` : `单号：${order.id}${copyHintSuffix}`}
              </button>
              {copyToast ? <p className="status-line copy-toast" role="status">{copyToast}</p> : null}
              {!contact.phone && !contact.wechat ? <span>{contactPendingLabel}</span> : null}
            </div>
          </div>
        ) : (
          <>
            <p className="production-intro">{introLabel}</p>
            <div className="size-section">
              <p>{sizeSectionLabel}</p>
              <div className="selected-size-panel">
                <Ruler aria-hidden="true" size={18} />
                <div>
                  <strong>{sizeLabel(selectedSize, locale)}</strong>
                  {sizeHint(selectedSize, locale) ? <span>{sizeHint(selectedSize, locale)}</span> : null}
                </div>
                <button className="secondary-action compact-action" type="button" onClick={() => {
                  setDraftSize(selectedSize);
                  setCustomWidth(String(selectedSize.width_cm));
                  setCustomHeight(String(selectedSize.height_cm));
                  setPage("size");
                }}>
                  {locale === "en" ? "Adjust" : "调整尺寸"}
                </button>
              </div>
            </div>

            <div className="service-list" role="radiogroup" aria-label={title}>
              {expert.services.map((service) => {
                const serviceEstimate = estimate?.estimates[service.id];
                return (
                  <button
                    key={service.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedService === service.id}
                    className={selectedService === service.id ? "service-card selected" : "service-card"}
                    onClick={() => {
                      setSelectedService(service.id);
                      setOrder(null);
                    }}
                  >
                    <strong>{service.name[locale] ?? service.name["zh-Hans"]}</strong>
                    <span>{service.description[locale] ?? service.description["zh-Hans"]}</span>
                    <em>
                      {estimateLabel}: {serviceEstimate?.amount ?? service.priceEstimate.base}{" "}
                      {serviceEstimate?.currency ?? service.priceEstimate.currency}
                    </em>
                  </button>
                );
              })}
            </div>

            <div className="reference-section">
              <p>{locale === "en" ? "How closely should the artist follow the AI work?" : "艺术家参考 AI 作品的程度"}</p>
              <div className="reference-list" role="radiogroup" aria-label={locale === "en" ? "Artist reference level" : "艺术家参考 AI 作品的程度"}>
                {REFERENCE_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    role="radio"
                    aria-checked={referenceLevel === level.value}
                    aria-label={text(level.title, locale)}
                    className={`reference-card reference-card-${level.tone}${referenceLevel === level.value ? " selected" : ""}`}
                    onClick={() => {
                      setReferenceLevel(level.value);
                      setOrder(null);
                    }}
                  >
                    <strong>{text(level.shortTitle, locale)}</strong>
                    {level.tone === "recommended" ? <span className="reference-badge reference-badge-recommended">{referenceRecommendedBadgeLabel}</span> : null}
                    {level.tone === "caution" ? <span className="reference-badge reference-badge-caution">{referenceCautionBadgeLabel}</span> : null}
                  </button>
                ))}
              </div>
              <div
                className="reference-hint"
                ref={referenceHintRef}
                style={referenceHintMinHeight ? { minHeight: referenceHintMinHeight } : undefined}
              >
                <strong>{text(selectedReference.title, locale)}</strong>
                <span>{text(selectedReference.hint, locale)}</span>
              </div>
              <div className="reference-hint reference-hint-measure" ref={referenceHintMeasureRef} aria-hidden="true" />
            </div>

            {!productionOpen ? (
              <div className="contact-panel" role="status">
                <strong>{productionUnavailableLabel}</strong>
                <span>{contactPendingLabel}</span>
              </div>
            ) : (
              <button className="primary-action" type="button" onClick={confirm}>
                {confirmLabel}
              </button>
            )}
            {error ? <p className="error-line" role="status">{error}</p> : null}
          </>
        )}
      </section>
    </div>
  );
}
