import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputDir = path.join(root, "client", "public", "classic-artworks");
const manifestPath = path.join(root, "config", "classic-artworks.json");
const userAgent = "InkspireClassicArtworkBuilder/0.1 (local development)";
const targetTotal = 100;
const targets = [
  {
    region: "中国",
    target: 80,
    queries: [
      "Chinese painting",
      "Chinese landscape painting",
      "Chinese handscroll",
      "Chinese hanging scroll",
      "Chinese album leaf",
      "Chinese fan painting",
      "Chinese Buddhist painting",
      "Chinese figure painting",
      "Chinese flower bird painting"
    ]
  },
  {
    region: "日本",
    target: 18,
    queries: ["Japanese painting", "Japanese screen painting", "Japanese hanging scroll", "Japanese handscroll", "Japanese album leaf"]
  },
  {
    region: "韩国",
    target: 2,
    queries: ["Korean painting", "Korean hanging scroll", "Korean album leaf"]
  }
];

const excludedWords = [
  "calligraphy",
  "inscription",
  "sutra",
  "manuscript",
  "poem",
  "poems",
  "poetry",
  "discourse",
  "treatise",
  "thousand-character",
  "ceramic",
  "porcelain",
  "bowl",
  "jar",
  "vase",
  "textile",
  "robe",
  "sculpture",
  "statue",
  "print",
  "woodblock",
  "photograph",
  "book",
  "letter",
  "table",
  "furniture"
];

const paintingWords = [
  "painting",
  "hanging scroll",
  "handscroll",
  "album leaf",
  "fan",
  "screen",
  "ink",
  "color on silk",
  "color on paper",
  "gold on paper",
  "silk",
  "paper"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`Request failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`Image request failed ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function slugify(parts) {
  const source = parts.filter(Boolean).join("-").toLowerCase();
  return source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 84);
}

function isAncientPainting(object, region) {
  if (!object?.primaryImageSmall) return false;
  if (object.isPublicDomain === false) return false;
  const haystack = [
    object.title,
    object.objectName,
    object.classification,
    object.medium,
    object.objectDate,
    object.culture
  ].filter(Boolean).join(" ").toLowerCase();
  if (excludedWords.some((word) => haystack.includes(word))) return false;
  if (!paintingWords.some((word) => haystack.includes(word))) return false;
  if (object.objectBeginDate && Number(object.objectBeginDate) > 1900) return false;
  if (object.objectEndDate && Number(object.objectEndDate) > 1920) return false;
  const culture = String(object.culture || "").toLowerCase();
  if (region === "中国" && culture && !culture.includes("china")) return false;
  if (region === "日本" && culture && !culture.includes("japan")) return false;
  if (region === "韩国" && culture && !culture.includes("korea")) return false;
  return true;
}

function periodFor(region, object) {
  const date = object.objectDate || "";
  if (date) return date;
  const year = Number(object.objectBeginDate || 0);
  if (!year) return "古代";
  if (region === "中国") {
    if (year < 907) return "唐及以前";
    if (year < 1279) return "宋";
    if (year < 1368) return "元";
    if (year < 1644) return "明";
    return "清";
  }
  if (region === "日本") {
    if (year < 1336) return "镰仓及以前";
    if (year < 1573) return "室町";
    if (year < 1603) return "安土桃山";
    return "江户";
  }
  return year < 1392 ? "高丽" : "朝鲜王朝";
}

function categoryFor(region, object) {
  if (region === "日本") return "日本绘画";
  if (region === "韩国") return "朝鲜绘画";
  const text = [object.title, object.medium, object.classification].filter(Boolean).join(" ").toLowerCase();
  if (/landscape|mountain|river|stream|snow|spring|summer|autumn|winter/.test(text)) return "山水";
  if (/flower|bird|bamboo|plum|lotus|orchid|insect|fish|peach|rose|hibiscus|animal/.test(text)) return "花鸟";
  if (/buddha|bodhisattva|luohan|lohan|arhat|daoist|taoist|immortal|monk|patriarch/.test(text)) return "佛道";
  if (/court|palace|tribute|garden|banquet|horse|groom|beaut|portrait|figure|lady|woman|scholar|sage/.test(text)) return "人物";
  return "宫廷/风俗";
}

function descriptionFor({ title, artist, period, region, category }) {
  const subject = category === "日本绘画" || category === "朝鲜绘画" ? "东亚绘画" : category;
  return `${title}为${period}${region}绘画作品，作者${artist || "佚名"}。作品适合作为${subject}方向的参考，重点借鉴构图经营、笔墨层次、设色关系和整体气韵，并在生成时转化为新的绘画作品。`;
}

function referenceFocusFor({ category }) {
  const base = category === "日本绘画" || category === "朝鲜绘画"
    ? "参考其画面章法、线描节奏、设色关系和东亚绘画气韵"
    : `参考其${category}题材的构图、笔墨、设色和气韵`;
  return `${base}，生成新的绘画作品，不直接复制原作。`;
}

async function searchObjectIds(query) {
  const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&departmentId=6&q=${encodeURIComponent(query)}`;
  const payload = await fetchJson(url);
  return Array.isArray(payload.objectIDs) ? payload.objectIDs : [];
}

async function loadObject(id) {
  return fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
}

async function writeImages(id, url) {
  const buffer = await fetchBuffer(url);
  const imagePath = path.join(outputDir, `${id}.webp`);
  const thumbPath = path.join(outputDir, `${id}-thumb.webp`);
  const prepared = sharp(buffer).rotate().trim({ background: "#ffffff", threshold: 10 });
  const metadata = await prepared.metadata();
  if (!metadata.width || !metadata.height || metadata.width < 240 || metadata.height < 240) {
    throw new Error("image too small");
  }
  await sharp(buffer)
    .rotate()
    .trim({ background: "#ffffff", threshold: 10 })
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .modulate({ saturation: 0.96, brightness: 1.01 })
    .webp({ quality: 86 })
    .toFile(imagePath);
  await sharp(buffer)
    .rotate()
    .trim({ background: "#ffffff", threshold: 10 })
    .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
    .modulate({ saturation: 0.96, brightness: 1.01 })
    .webp({ quality: 82 })
    .toFile(thumbPath);
}

function recordFromObject({ object, id, region, category, period }) {
  const title = object.title || `Artwork ${object.objectID}`;
  const artist = object.artistDisplayName || "佚名";
  return {
    id,
    title: {
      "zh-Hans": title,
      "zh-Hant": title,
      en: title
    },
    artist: {
      "zh-Hans": artist,
      "zh-Hant": artist,
      en: artist === "佚名" ? "Anonymous" : artist
    },
    period: {
      "zh-Hans": period,
      "zh-Hant": period,
      en: period
    },
    region: {
      "zh-Hans": region,
      "zh-Hant": region,
      en: region === "中国" ? "China" : region === "日本" ? "Japan" : "Korea"
    },
    category,
    description: {
      "zh-Hans": descriptionFor({ title, artist, period, region, category }),
      "zh-Hant": descriptionFor({ title, artist, period, region, category }),
      en: `${title} is an ancient ${region === "中国" ? "Chinese" : "East Asian"} painting. It is used as a reference for composition, brushwork, color, spatial rhythm, and atmosphere while generating a new artwork.`
    },
    image: `/classic-artworks/${id}.webp`,
    thumbnail: `/classic-artworks/${id}-thumb.webp`,
    reference_focus: referenceFocusFor({ category }),
    source_note: `Metropolitan Museum of Art Open Access object ${object.objectID}; processed as artwork-only WebP with light trim and tone normalization.`
  };
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const records = [];
  const usedObjectIds = new Set();
  const usedIds = new Set();

  for (const target of targets) {
    let added = 0;
    const candidateIds = [];
    for (const query of target.queries) {
      console.log(`Searching ${target.region}: ${query}`);
      const ids = await searchObjectIds(query);
      candidateIds.push(...ids);
      await sleep(150);
    }

    for (const objectId of candidateIds) {
      if (added >= target.target || records.length >= targetTotal) break;
      if (usedObjectIds.has(objectId)) continue;
      usedObjectIds.add(objectId);
      let object;
      try {
        object = await loadObject(objectId);
      } catch (error) {
        console.warn(`Skipping ${objectId}: ${error.message}`);
        continue;
      }
      if (!isAncientPainting(object, target.region)) continue;
      const category = categoryFor(target.region, object);
      const period = periodFor(target.region, object);
      let id = slugify([target.region, object.artistDisplayName || "anonymous", object.title, object.objectID]);
      let suffix = 2;
      while (!id || usedIds.has(id)) {
        id = `${id || `artwork-${object.objectID}`}-${suffix}`;
        suffix += 1;
      }
      try {
        await writeImages(id, object.primaryImage || object.primaryImageSmall);
      } catch (error) {
        console.warn(`Skipping ${object.title}: ${error.message}`);
        continue;
      }
      usedIds.add(id);
      records.push(recordFromObject({ object, id, region: target.region, category, period }));
      added += 1;
      console.log(`${records.length}/${targetTotal} ${target.region}: ${object.title}`);
      await sleep(120);
    }
  }

  if (records.length < targetTotal) {
    throw new Error(`Only built ${records.length} records`);
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(records.slice(0, targetTotal), null, 2)}\n`);
  console.log(`Built ${targetTotal} classic painting records.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
