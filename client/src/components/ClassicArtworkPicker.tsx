import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { ClassicArtwork } from "../api";
import type { Locale } from "../domain";

interface ClassicArtworkPickerProps {
  artworks: ClassicArtwork[];
  locale: Locale;
  onBack: () => void;
  onSelect: (artwork: ClassicArtwork) => void;
}

function localizedText(value: Record<string, string>, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function categoryLabel(category: string, locale: Locale): string {
  if (locale !== "en") {
    return category;
  }
  const labels: Record<string, string> = {
    "山水": "Landscape",
    "花鸟": "Birds and Flowers",
    "人物": "Figures",
    "佛道": "Buddhist and Daoist",
    "宫廷/风俗": "Court and Genre",
    "日本绘画": "Japanese Painting",
    "朝鲜绘画": "Korean Painting"
  };
  return labels[category] ?? category;
}

function allLabel(locale: Locale): string {
  return locale === "en" ? "All" : "全部";
}

function selectLabel(locale: Locale): string {
  if (locale === "en") return "Use this artwork";
  if (locale === "zh-Hant") return "選擇此作品";
  return "选择此作品";
}

function headingLabel(locale: Locale): string {
  if (locale === "en") return "Choose a classic artwork";
  if (locale === "zh-Hant") return "選擇古代名作";
  return "选择古代名作";
}

function backLabel(locale: Locale): string {
  if (locale === "en") return "Back";
  if (locale === "zh-Hant") return "上一步";
  return "上一步";
}

export default function ClassicArtworkPicker({ artworks, locale, onBack, onSelect }: ClassicArtworkPickerProps) {
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const categories = useMemo(
    () => Array.from(new Set(artworks.map((artwork) => artwork.category))).filter(Boolean),
    [artworks]
  );
  const visibleArtworks = category ? artworks.filter((artwork) => artwork.category === category) : artworks;
  const selected = artworks.find((artwork) => artwork.id === selectedId) ?? null;

  if (selected) {
    const title = localizedText(selected.title, locale);
    const artist = localizedText(selected.artist, locale);
    const period = localizedText(selected.period, locale);
    const region = localizedText(selected.region, locale);
    return (
      <div className="classic-picker classic-detail">
        <button className="back-action classic-back" type="button" onClick={() => setSelectedId("")}>
          <ChevronLeft aria-hidden="true" size={16} />
          {backLabel(locale)}
        </button>
        <img className="classic-detail-image" src={selected.image} alt={title} />
        <div className="classic-detail-copy">
          <p className="classic-meta">
            {[artist, period, region, categoryLabel(selected.category, locale)].filter(Boolean).join(" · ")}
          </p>
          <h2>{title}</h2>
          <p>{localizedText(selected.description, locale)}</p>
          <button className="primary-action" type="button" onClick={() => onSelect(selected)}>
            {selectLabel(locale)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="classic-picker">
      <div className="classic-picker-header">
        <button className="back-action classic-back" type="button" onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={16} />
          {backLabel(locale)}
        </button>
        <h2>{headingLabel(locale)}</h2>
      </div>
      <div className="classic-category-row" aria-label={headingLabel(locale)}>
        <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>
          {allLabel(locale)}
        </button>
        {categories.map((item) => (
          <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
            {categoryLabel(item, locale)}
          </button>
        ))}
      </div>
      <div className="classic-masonry">
        {visibleArtworks.map((artwork) => {
          const title = localizedText(artwork.title, locale);
          return (
            <button key={artwork.id} className="classic-card" type="button" onClick={() => setSelectedId(artwork.id)}>
              <img src={artwork.thumbnail || artwork.image} alt={title} loading="lazy" />
              <span className="classic-card-copy">
                <strong>{title}</strong>
                <span>{localizedText(artwork.artist, locale)} · {localizedText(artwork.period, locale)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
