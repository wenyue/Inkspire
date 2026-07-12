import { Search } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ClassicArtwork } from "../api";
import type { Locale, LocalizedText } from "../domain";

interface ClassicArtworkPickerProps {
  artworks: ClassicArtwork[];
  locale: Locale;
  selectedArtworkId?: string;
  onSelectedArtworkIdChange?: (artworkId: string) => void;
  onSelect: (artwork: ClassicArtwork) => void;
}

const PAGE_SIZE = 12;

const featuredIds = [
  "中国-han-gan-night-shining-white-39901",
  "中国-unidentified-artist-emperor-xuanzong-s-flight-to-shu-40055",
  "中国-qu-ding-summer-mountains-39915",
  "中国-ni-zan-woods-and-valleys-of-mount-yu-45636"
];

function localizedText(value: LocalizedText, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function labels(locale: Locale) {
  if (locale === "en") return { heading: "East Asian painting through the ages", back: "Back", all: "Full curated catalogue", search: "Search title, artist, period, or region", more: "See more works", select: "Use this artwork", empty: "No matching works", source: "The Metropolitan Museum of Art", featured: "Curated selection", artist: "Artist", date: "Date", region: "Region", collection: "Collection" };
  if (locale === "ja") return { heading: "歴代の東アジア絵画", back: "戻る", all: "すべての選定作品", search: "作品名、作者、年代、地域を検索", more: "さらに表示", select: "この作品を使う", empty: "一致する作品がありません", source: "メトロポリタン美術館", featured: "セレクション", artist: "作者", date: "年代", region: "地域", collection: "所蔵" };
  if (locale === "zh-Hant") return { heading: "東亞歷代繪畫", back: "上一步", all: "全部策展館藏", search: "搜尋作品、作者、年代或地域", more: "再看一批", select: "選擇此作品", empty: "未找到相符作品", source: "大都會藝術博物館", featured: "策展精選", artist: "作者", date: "年代", region: "地域", collection: "館藏" };
  return { heading: "东亚历代绘画", back: "上一步", all: "全部策展馆藏", search: "搜索作品、作者、年代或地域", more: "再看一批", select: "选择此作品", empty: "未找到相符作品", source: "大都会艺术博物馆", featured: "策展精选", artist: "作者", date: "年代", region: "地域", collection: "馆藏" };
}

function categoryLabel(category: string, locale: Locale): string {
  if (locale === "zh-Hant") return ({ "山水": "山水", "花鸟": "花鳥", "人物": "人物", "佛道": "佛道", "宫廷/风俗": "宮廷／風俗", "日本绘画": "日本繪畫", "朝鲜绘画": "朝鮮繪畫" } as Record<string, string>)[category] ?? category;
  if (locale === "ja") return ({ "山水": "山水", "花鸟": "花鳥", "人物": "人物", "佛道": "仏教・道教", "宫廷/风俗": "宮廷・風俗", "日本绘画": "日本絵画", "朝鲜绘画": "朝鮮絵画" } as Record<string, string>)[category] ?? category;
  if (locale !== "en") return category;
  return ({ "山水": "Landscape", "花鸟": "Birds and Flowers", "人物": "Figures", "佛道": "Buddhist and Daoist", "宫廷/风俗": "Court and Genre", "日本绘画": "Japanese Painting", "朝鲜绘画": "Korean Painting" } as Record<string, string>)[category] ?? category;
}

function regionLabel(region: LocalizedText, locale: Locale): string {
  const value = localizedText(region, locale);
  if (locale !== "zh-Hant") return value;
  return ({ "中国": "中國", "韩国": "韓國" } as Record<string, string>)[value] ?? value;
}

function sourceLabel(sourceNote: string, locale: Locale): string {
  if (/Metropolitan Museum of Art/i.test(sourceNote)) {
    return labels(locale).source;
  }
  return locale === "en" ? "Collection institution listed in the source record" : locale === "ja" ? "所蔵機関は出典記録を参照" : locale === "zh-Hant" ? "館藏機構見原始記錄" : "馆藏机构见原始记录";
}

export default function ClassicArtworkPicker({
  artworks,
  locale,
  selectedArtworkId,
  onSelectedArtworkIdChange,
  onSelect
}: ClassicArtworkPickerProps) {
  const [query, setQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [internalSelectedArtworkId, setInternalSelectedArtworkId] = useState("");
  const listScrollPositionRef = useRef<number | null>(null);
  const scrollSurfaceRef = useRef<HTMLElement | null>(null);
  const text = labels(locale);
  const curated = useMemo(() => [...artworks].sort((a, b) => {
    const aIndex = featuredIds.indexOf(a.id);
    const bIndex = featuredIds.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  }), [artworks]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return curated.filter((artwork) => {
      if (featuredOnly && !featuredIds.includes(artwork.id)) return false;
      if (!needle) return true;
      return [artwork.title, artwork.artist, artwork.period, artwork.region]
        .flatMap((value) => Object.values(value)).concat(regionLabel(artwork.region, locale), artwork.source_note)
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [curated, featuredOnly, locale, query]);
  const visibleArtworks = filtered.slice(0, limit);
  const currentSelectedArtworkId = selectedArtworkId ?? internalSelectedArtworkId;
  const selected = curated.find((artwork) => artwork.id === currentSelectedArtworkId) ?? null;

  useLayoutEffect(() => {
    if (currentSelectedArtworkId || listScrollPositionRef.current === null || !scrollSurfaceRef.current) {
      return;
    }
    scrollSurfaceRef.current.scrollTop = listScrollPositionRef.current;
    listScrollPositionRef.current = null;
  }, [currentSelectedArtworkId]);

  if (selected) {
    const title = localizedText(selected.title, locale);
    return <div className="classic-picker classic-detail">
      <img className="classic-detail-image" src={selected.image} alt={title} />
      <div className="classic-detail-copy">
        <h2>{title}</h2>
        <dl className="classic-facts">
          <div><dt>{text.artist}</dt><dd>{localizedText(selected.artist, locale)}</dd></div>
          <div><dt>{text.date}</dt><dd>{localizedText(selected.period, locale)}</dd></div>
          <div><dt>{text.region}</dt><dd>{regionLabel(selected.region, locale)}{selected.category ? ` · ${categoryLabel(selected.category, locale)}` : ""}</dd></div>
          <div><dt>{text.collection}</dt><dd>{sourceLabel(selected.source_note, locale)}</dd></div>
        </dl>
        <p>{localizedText(selected.description, locale)}</p>
        <button className="primary-action" type="button" onClick={() => onSelect(selected)}>{text.select}</button>
      </div>
    </div>;
  }

  return <div className="classic-picker">
    <label className="classic-search"><Search aria-hidden="true" size={17} /><input type="search" value={query} placeholder={text.search} aria-label={text.search} onChange={(event) => { setQuery(event.target.value); setFeaturedOnly(false); setLimit(PAGE_SIZE); }} /></label>
    <div className="classic-category-row" aria-label={text.heading}>
      <button type="button" aria-pressed={featuredOnly} onClick={() => { setFeaturedOnly(true); setQuery(""); setLimit(PAGE_SIZE); }}>{text.featured}</button>
      <button type="button" aria-pressed={!featuredOnly} onClick={() => { setFeaturedOnly(false); setLimit(PAGE_SIZE); }}>{text.all}</button>
    </div>
    {visibleArtworks.length ? <div className="classic-masonry">{visibleArtworks.map((artwork) => {
      const title = localizedText(artwork.title, locale);
      return <button key={artwork.id} className="classic-card" type="button" onClick={(event) => {
        const scrollSurface = event.currentTarget.closest<HTMLElement>(".main-surface");
        scrollSurfaceRef.current = scrollSurface;
        listScrollPositionRef.current = scrollSurface?.scrollTop ?? 0;
        setInternalSelectedArtworkId(artwork.id);
        onSelectedArtworkIdChange?.(artwork.id);
      }}>
        <img src={artwork.thumbnail || artwork.image} alt={title} loading="lazy" />
        <span className="classic-card-copy"><strong>{title}</strong><span>{localizedText(artwork.artist, locale)}</span><span>{localizedText(artwork.period, locale)} · {regionLabel(artwork.region, locale)}{artwork.category ? ` · ${categoryLabel(artwork.category, locale)}` : ""}</span><small>{sourceLabel(artwork.source_note, locale)}</small></span>
      </button>;
    })}</div> : <p className="classic-empty" role="status" aria-live="polite">{text.empty}</p>}
    {visibleArtworks.length < filtered.length ? <button className="classic-more secondary-action" type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{text.more}{locale === "en" ? ` (${filtered.length - visibleArtworks.length})` : `（${filtered.length - visibleArtworks.length}）`}</button> : null}
  </div>;
}
