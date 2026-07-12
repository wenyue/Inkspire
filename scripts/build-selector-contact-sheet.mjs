import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import {
  canonicalizeSelectorAssetPath,
  collectSelectorAssets
} from "./selector-asset-contract.mjs";

const COLUMN_COUNT = 5;
const HORIZONTAL_PADDING = 16;
const LABEL_HEIGHT = 40;
const WORK_TYPE_OPTIONS = [
  {
    label: "国画",
    path: "/previews/options/work-type-0-painting.webp"
  },
  {
    label: "书法",
    path: "/previews/options/work-type-1-calligraphy.webp"
  },
  {
    label: "从历代名作取意",
    path: "/previews/options/work-type-2-classics.webp"
  }
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const previewsRoot = path.join(repositoryRoot, "client", "public", "previews");
const questionsPath = path.join(repositoryRoot, "config", "questions.json");
const reviewDirectory = path.join(repositoryRoot, ".runtime", "selector-review");

export function contactSheetGeometry(count, tileWidth, tileHeight) {
  const columns = COLUMN_COUNT;
  const rows = Math.ceil(count / columns);

  return {
    columns,
    rows,
    width: columns * (tileWidth + HORIZONTAL_PADDING),
    height: rows * (tileHeight + LABEL_HEIGHT)
  };
}

function pathSegmentsWithinRoot(trustedRoot, targetPath) {
  const absoluteRoot = path.resolve(trustedRoot);
  const absoluteTarget = path.resolve(targetPath);
  const relativePath = path.relative(absoluteRoot, absoluteTarget);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`contact-sheet path escapes trusted root: ${absoluteTarget}`);
  }

  return {
    absoluteRoot,
    segments: relativePath === "" ? [] : relativePath.split(path.sep)
  };
}

function validateDirectoryStats(directoryPath, stats) {
  if (stats.isSymbolicLink()) {
    throw new Error(`refusing symbolic-link contact-sheet ancestor: ${directoryPath}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`refusing non-directory contact-sheet ancestor: ${directoryPath}`);
  }
}

async function validateContactSheetAncestors(trustedRoot, outputParent) {
  const { absoluteRoot, segments } = pathSegmentsWithinRoot(trustedRoot, outputParent);
  let currentPath = absoluteRoot;
  validateDirectoryStats(currentPath, await lstat(currentPath));

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    validateDirectoryStats(currentPath, await lstat(currentPath));
  }
}

async function ensureTrustedOutputDirectory(trustedRoot, outputParent) {
  const { absoluteRoot, segments } = pathSegmentsWithinRoot(trustedRoot, outputParent);
  let currentPath = absoluteRoot;
  validateDirectoryStats(currentPath, await lstat(currentPath));

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    let stats;
    try {
      stats = await lstat(currentPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      try {
        await mkdir(currentPath);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") {
          throw mkdirError;
        }
      }
      stats = await lstat(currentPath);
    }
    validateDirectoryStats(currentPath, stats);
  }
}

async function validateContactSheetOutputTarget(trustedRoot, outputPath) {
  const outputParent = path.dirname(path.resolve(outputPath));
  await validateContactSheetAncestors(trustedRoot, outputParent);

  let outputStats;
  try {
    outputStats = await lstat(outputPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (outputStats.isSymbolicLink()) {
    throw new Error(`refusing symbolic-link contact-sheet output: ${outputPath}`);
  }
  if (!outputStats.isFile()) {
    throw new Error(`refusing non-regular contact-sheet output: ${outputPath}`);
  }
}

async function removeTemporaryOutput(temporaryPath) {
  await rm(temporaryPath, {
    force: true,
    recursive: true,
    maxRetries: 3,
    retryDelay: 20
  });
}

function isSameFile(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

export async function writeContactSheetOutput(trustedRoot, outputPath, renderToBuffer) {
  const absoluteOutputPath = path.resolve(outputPath);
  await validateContactSheetOutputTarget(trustedRoot, absoluteOutputPath);

  const renderedBuffer = await renderToBuffer();
  if (!Buffer.isBuffer(renderedBuffer)) {
    throw new Error("contact-sheet renderer must return a Buffer");
  }

  await validateContactSheetOutputTarget(trustedRoot, absoluteOutputPath);

  const temporaryPath = path.join(
    path.dirname(absoluteOutputPath),
    `.${path.basename(absoluteOutputPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let temporaryFile;
  let operationError;

  try {
    temporaryFile = await open(temporaryPath, "wx");
    await temporaryFile.writeFile(renderedBuffer);
    await temporaryFile.sync();
    const ownedStats = await temporaryFile.stat({ bigint: true });
    await temporaryFile.close();
    temporaryFile = undefined;

    await validateContactSheetOutputTarget(trustedRoot, absoluteOutputPath);
    const temporaryStats = await lstat(temporaryPath, { bigint: true });
    if (
      temporaryStats.isSymbolicLink() ||
      !temporaryStats.isFile() ||
      !isSameFile(ownedStats, temporaryStats)
    ) {
      throw new Error(`contact-sheet renderer did not produce a regular file: ${temporaryPath}`);
    }
    await rename(temporaryPath, absoluteOutputPath);
  } catch (error) {
    operationError = error;
  }

  if (temporaryFile) {
    try {
      await temporaryFile.close();
    } catch (closeError) {
      operationError ??= closeError;
    }
  }
  try {
    await removeTemporaryOutput(temporaryPath);
  } catch (cleanupError) {
    operationError ??= cleanupError;
  }

  if (operationError) {
    throw operationError;
  }
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function labelSvg(asset, label, tileWidth) {
  const identifier = `${asset.questionId}[${asset.optionIndex}]`;
  const fontSize = tileWidth <= 100 ? 8 : 12;

  return Buffer.from(`
    <svg width="${tileWidth}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { font-family: "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; fill: #302b25; }
      </style>
      <text x="0" y="${fontSize + 2}" font-size="${fontSize}" textLength="${Math.max(tileWidth - 2, 1)}" lengthAdjust="spacingAndGlyphs">${escapeXml(identifier)}</text>
      <text x="0" y="${fontSize * 2 + 8}" font-size="${fontSize}">${escapeXml(label)}</text>
    </svg>
  `, "utf8");
}

function configuredLabels(questions) {
  const labels = new Map();
  for (const question of Object.values(questions).flat()) {
    question.options?.["zh-Hans"]?.forEach((label, optionIndex) => {
      labels.set(`${question.id}:${optionIndex}`, label);
    });
  }
  WORK_TYPE_OPTIONS.forEach(({ label }, optionIndex) => {
    labels.set(`work_type:${optionIndex}`, label);
  });
  return labels;
}

async function buildSheet(optionAssets, labels, tileWidth, tileHeight, outputPath) {
  const geometry = contactSheetGeometry(optionAssets.length, tileWidth, tileHeight);
  const composites = [];

  for (const [index, asset] of optionAssets.entries()) {
    const row = Math.floor(index / geometry.columns);
    const column = index % geometry.columns;
    const left = column * (tileWidth + HORIZONTAL_PADDING) + HORIZONTAL_PADDING / 2;
    const top = row * (tileHeight + LABEL_HEIGHT);
    const canonicalAsset = await canonicalizeSelectorAssetPath(previewsRoot, asset.path);
    const label = labels.get(`${asset.questionId}:${asset.optionIndex}`);
    if (typeof label !== "string") {
      throw new Error(`${asset.questionId}[${asset.optionIndex}]: missing zh-Hans option label`);
    }

    composites.push({
      input: await sharp(canonicalAsset.filePath)
        .resize(tileWidth, tileHeight, { fit: "fill" })
        .toBuffer(),
      left,
      top
    });
    composites.push({
      input: labelSvg(asset, label, tileWidth),
      left,
      top: top + tileHeight
    });
  }

  await writeContactSheetOutput(repositoryRoot, outputPath, async () =>
    sharp({
      create: {
        width: geometry.width,
        height: geometry.height,
        channels: 3,
        background: "#f3eee3"
      }
    })
      .composite(composites)
      .webp({ quality: 90 })
      .toBuffer()
  );
}

async function buildContactSheets() {
  const questions = JSON.parse(await readFile(questionsPath, "utf8"));
  const assets = collectSelectorAssets(
    questions,
    WORK_TYPE_OPTIONS.map(({ path: assetPath }) => assetPath),
    ["calligraphy_script"]
  );
  const optionAssets = assets.filter((asset) => asset.kind === "option");
  if (optionAssets.length !== 40) {
    throw new Error(`expected 40 visual selector options, found ${optionAssets.length}`);
  }

  const labels = configuredLabels(questions);
  const outputs = [
    {
      tileWidth: 320,
      tileHeight: 240,
      outputPath: path.join(reviewDirectory, "selector-options-320x240.webp")
    },
    {
      tileWidth: 100,
      tileHeight: 75,
      outputPath: path.join(reviewDirectory, "selector-options-100x75.webp")
    }
  ];

  await ensureTrustedOutputDirectory(repositoryRoot, reviewDirectory);
  for (const output of outputs) {
    await buildSheet(
      optionAssets,
      labels,
      output.tileWidth,
      output.tileHeight,
      output.outputPath
    );
    console.log(path.resolve(output.outputPath));
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await buildContactSheets();
}
