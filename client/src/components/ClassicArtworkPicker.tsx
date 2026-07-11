import { ChevronLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ClassicArtwork } from "../api";
import type { Locale, LocalizedText } from "../domain";

interface ClassicArtworkPickerProps {
  artworks: ClassicArtwork[];
  locale: Locale;
  onSelect: (artwork: ClassicArtwork) => void;
}

const PAGE_SIZE = 12;

const verifiedCuration: Record<string, Partial<ClassicArtwork>> = {
  "中国-han-gan-night-shining-white-39901": {
    title: { "zh-Hans": "照夜白图", "zh-Hant": "照夜白圖", en: "Night-Shining White" },
    artist: { "zh-Hans": "传 唐 · 韩幹", "zh-Hant": "傳 唐 · 韓幹", en: "Attributed to Han Gan, Tang dynasty" },
    period: { "zh-Hans": "约 750 年", "zh-Hant": "約 750 年", en: "ca. 750" },
    category: "宫廷/风俗",
    reference_focus: "参考其克制线描、墨色层次与骏马形神，转化为新的绘画作品，不复制原作题跋与收藏印记。",
    description: {
      "zh-Hans": "唐代画马名作，以克制的线描与墨色表现骏马形神。卷本，纸本水墨。",
      "zh-Hant": "唐代畫馬名作，以克制的線描與墨色表現駿馬形神。卷本，紙本水墨。",
      en: "A Tang-dynasty horse painting noted for restrained line and ink. Handscroll; ink on paper."
    }
  },
  "中国-unidentified-artist-emperor-xuanzong-s-flight-to-shu-40055": {
    title: { "zh-Hans": "明皇幸蜀图", "zh-Hant": "明皇幸蜀圖", en: "Emperor Xuanzong's Flight to Shu" },
    artist: { "zh-Hans": "南宋 · 佚名", "zh-Hant": "南宋 · 佚名", en: "Unidentified artist, Southern Song" },
    period: { "zh-Hans": "12 世纪中叶", "zh-Hant": "12 世紀中葉", en: "mid-12th century" },
    category: "山水",
    reference_focus: "参考其青绿山水的层峦、路径与行旅叙事构图，转化为新的绘画作品，不直接复制原作。",
    description: {
      "zh-Hans": "以青绿山水组织人物行旅，层峦与路径的经营尤其可观。轴，绢本设色描金。",
      "zh-Hant": "以青綠山水組織人物行旅，層巒與路徑的經營尤其可觀。軸，絹本設色描金。",
      en: "A blue-and-green landscape organizing a traveling party through layered peaks and paths. Hanging scroll; color and gold on silk."
    }
  },
  "中国-qu-ding-summer-mountains-39915": {
    title: { "zh-Hans": "夏山图", "zh-Hant": "夏山圖", en: "Summer Mountains" },
    artist: { "zh-Hans": "传 北宋 · 屈鼎", "zh-Hant": "傳 北宋 · 屈鼎", en: "Attributed to Qu Ding, Northern Song" },
    period: { "zh-Hans": "约 1050 年", "zh-Hant": "約 1050 年", en: "ca. 1050" },
    category: "山水",
    reference_focus: "参考其高远层次、云气水岸与全景山水经营，转化为新的绘画作品，不直接复制原作。",
    description: {
      "zh-Hans": "北宋全景山水体系的代表性作品之一，以高远层次、云气与水岸展开长卷。卷，绢本水墨设色。",
      "zh-Hant": "北宋全景山水體系的代表性作品之一，以高遠層次、雲氣與水岸展開長卷。卷，絹本水墨設色。",
      en: "A panoramic Northern Song landscape unfolding lofty peaks, mist, and riverbanks. Handscroll; ink and color on silk."
    }
  },
  "中国-ni-zan-woods-and-valleys-of-mount-yu-45636": {
    title: { "zh-Hans": "虞山林壑图", "zh-Hant": "虞山林壑圖", en: "Woods and Valleys of Mount Yu" },
    artist: { "zh-Hans": "元 · 倪瓒", "zh-Hant": "元 · 倪瓚", en: "Ni Zan, Yuan dynasty" },
    period: { "zh-Hans": "1372 年", "zh-Hant": "1372 年", en: "1372" },
    category: "山水",
    reference_focus: "参考其疏简笔墨、隔岸式构图与大片留白，转化为新的绘画作品，不直接复制原作。",
    description: {
      "zh-Hans": "以疏简笔墨、隔岸式构图与大片留白写虞山清景。轴，纸本水墨。",
      "zh-Hant": "以疏簡筆墨、隔岸式構圖與大片留白寫虞山清景。軸，紙本水墨。",
      en: "A spare Mount Yu landscape using separated banks, dry brushwork, and generous blank space. Hanging scroll; ink on paper."
    }
  }
};

const curatedIds = Object.keys(verifiedCuration);

function localizedText(value: LocalizedText, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function curatedArtwork(artwork: ClassicArtwork): ClassicArtwork {
  const verified = verifiedCuration[artwork.id];
  if (verified) return { ...artwork, ...verified };
  return {
    ...artwork,
    category: "",
    description: {
      "zh-Hans": "此件尚未完成中文策展核验，暂保留馆藏原始题名、作者与年代。",
      "zh-Hant": "此件尚未完成中文策展核驗，暫保留館藏原始題名、作者與年代。",
      en: "This work retains its source-catalogue title, artist, and date pending curatorial verification."
    },
    reference_focus: "仅参考所选馆藏图像中实际可见的构图、笔墨与设色关系，生成新的绘画作品；不采用未经核验的题材分类，不直接复制原作。"
  };
}

function labels(locale: Locale) {
  if (locale === "en") return { heading: "East Asian painting through the ages", back: "Back", all: "Full catalogue · original titles", search: "Search title, artist, period, or region", more: "See more works", select: "Use this artwork", empty: "No matching works", source: "The Metropolitan Museum of Art · Open Access", featured: "Verified selection", raw: "Source catalogue · not yet curated", artist: "Artist", date: "Date", region: "Region", collection: "Collection" };
  if (locale === "zh-Hant") return { heading: "東亞歷代繪畫", back: "上一步", all: "全部館藏 · 保留原題", search: "搜尋作品、作者、年代或地域", more: "再看一批", select: "選擇此作品", empty: "未找到相符作品", source: "大都會藝術博物館 · 開放取用", featured: "核驗精選", raw: "館藏原始編目 · 尚未策展核驗", artist: "作者", date: "年代", region: "地域", collection: "館藏線索" };
  return { heading: "东亚历代绘画", back: "上一步", all: "全部馆藏 · 保留原题", search: "搜索作品、作者、年代或地域", more: "再看一批", select: "选择此作品", empty: "未找到相符作品", source: "大都会艺术博物馆 · 开放获取", featured: "核验精选", raw: "馆藏原始编目 · 尚未策展核验", artist: "作者", date: "年代", region: "地域", collection: "馆藏线索" };
}

function categoryLabel(category: string, locale: Locale): string {
  if (locale === "zh-Hant") return ({ "山水": "山水", "花鸟": "花鳥", "人物": "人物", "佛道": "佛道", "宫廷/风俗": "宮廷／風俗", "日本绘画": "日本繪畫", "朝鲜绘画": "朝鮮繪畫" } as Record<string, string>)[category] ?? category;
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
    const objectId = sourceNote.match(/object\s+(\d+)/i)?.[1];
    if (!objectId) return labels(locale).source;
    const objectLabel = locale === "en" ? `Object ${objectId}` : locale === "zh-Hant" ? `藏品 ${objectId}` : `藏品 ${objectId}`;
    return `${labels(locale).source} · ${objectLabel}`;
  }
  return locale === "en" ? "See the original record for collection source" : locale === "zh-Hant" ? "館藏來源見原始記錄" : "馆藏来源见原始记录";
}

export default function ClassicArtworkPicker({ artworks, locale, onSelect }: ClassicArtworkPickerProps) {
  const [query, setQuery] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState("");
  const text = labels(locale);
  const curated = useMemo(() => artworks.map(curatedArtwork).sort((a, b) => {
    const aIndex = curatedIds.indexOf(a.id);
    const bIndex = curatedIds.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  }), [artworks]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return curated.filter((artwork) => {
      if (featuredOnly && !curatedIds.includes(artwork.id)) return false;
      if (!needle) return true;
      return [artwork.title, artwork.artist, artwork.period, artwork.region]
        .flatMap((value) => Object.values(value)).concat(regionLabel(artwork.region, locale), artwork.source_note)
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [curated, featuredOnly, locale, query]);
  const visibleArtworks = filtered.slice(0, limit);
  const selected = curated.find((artwork) => artwork.id === selectedId) ?? null;

  if (selected) {
    const title = localizedText(selected.title, locale);
    return <div className="classic-picker classic-detail">
      <button className="back-action classic-back" type="button" onClick={() => setSelectedId("")}><ChevronLeft aria-hidden="true" size={16} />{text.back}</button>
      <img className="classic-detail-image" src={selected.image} alt={title} />
      <div className="classic-detail-copy">
        <p className="classic-kicker">{curatedIds.includes(selected.id) ? text.featured : text.raw}</p>
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
      return <button key={artwork.id} className="classic-card" type="button" onClick={() => setSelectedId(artwork.id)}>
        <img src={artwork.thumbnail || artwork.image} alt={title} loading="lazy" />
        <span className="classic-card-copy"><strong>{title}</strong><span>{localizedText(artwork.artist, locale)}</span><span>{localizedText(artwork.period, locale)} · {regionLabel(artwork.region, locale)}{artwork.category ? ` · ${categoryLabel(artwork.category, locale)}` : ""}</span><small>{sourceLabel(artwork.source_note, locale)}</small></span>
      </button>;
    })}</div> : <p className="classic-empty" role="status" aria-live="polite">{text.empty}</p>}
    {visibleArtworks.length < filtered.length ? <button className="classic-more secondary-action" type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{text.more}{locale === "en" ? ` (${filtered.length - visibleArtworks.length})` : `（${filtered.length - visibleArtworks.length}）`}</button> : null}
  </div>;
}
