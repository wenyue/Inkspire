import {
  ARTWORK_TEMPLATES,
  localizedTemplateText,
  type ArtworkTemplate,
} from "../artworkTemplates";
import type { Locale } from "../domain";

interface ArtworkTemplatePickerProps {
  locale: Locale;
  onSelect: (template: ArtworkTemplate) => void;
}

function pickerText(locale: Locale) {
  if (locale === "en") {
    return { heading: "Choose a popular template", painting: "Painting templates (18)", calligraphy: "Calligraphy templates (2)" };
  }
  if (locale === "ja") {
    return { heading: "人気テンプレートを選ぶ", painting: "絵画テンプレート（18）", calligraphy: "書道テンプレート（2）" };
  }
  if (locale === "zh-Hant") {
    return { heading: "選擇一個熱門模板", painting: "繪畫模板（18）", calligraphy: "書法模板（2）" };
  }
  return { heading: "选择一个热门模板", painting: "绘画模板（18）", calligraphy: "书法模板（2）" };
}

function TemplateGroup({
  label,
  locale,
  templates,
  onSelect,
}: {
  label: string;
  locale: Locale;
  templates: ArtworkTemplate[];
  onSelect: (template: ArtworkTemplate) => void;
}) {
  return (
    <fieldset className="template-group" aria-label={label}>
      <legend>{label}</legend>
      <div className="template-grid">
        {templates.map((template) => {
          const title = localizedTemplateText(template.title, locale);
          return (
            <button key={template.id} type="button" onClick={() => onSelect(template)}>
              <img className="template-preview-image" src={template.previewImage} alt={title} />
              <span className="template-card-copy">
                <strong>{title}</strong>
                <span>
                  {Object.values(template.answers)
                    .map((value) => localizedTemplateText(value, locale))
                    .join(" · ")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ArtworkTemplatePicker({ locale, onSelect }: ArtworkTemplatePickerProps) {
  const labels = pickerText(locale);
  const paintingTemplates = ARTWORK_TEMPLATES.filter((template) => template.type === "painting");
  const calligraphyTemplates = ARTWORK_TEMPLATES.filter((template) => template.type === "calligraphy");

  return (
    <div className="template-picker">
      <h2>{labels.heading}</h2>
      <TemplateGroup label={labels.painting} locale={locale} templates={paintingTemplates} onSelect={onSelect} />
      <TemplateGroup label={labels.calligraphy} locale={locale} templates={calligraphyTemplates} onSelect={onSelect} />
    </div>
  );
}
