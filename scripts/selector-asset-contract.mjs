import { realpath } from "node:fs/promises";
import path from "node:path";

export function collectSelectorAssets(
  questions,
  workTypeOptionImages,
  allowedTextOnlyQuestionIds = []
) {
  const assets = [];
  const allowedTextOnlyQuestions = new Set(allowedTextOnlyQuestionIds);

  for (const branch of Object.values(questions)) {
    for (const question of branch) {
      if (typeof question.preview_image === "string") {
        assets.push({
          kind: "hero",
          questionId: question.id,
          path: question.preview_image
        });
      }

      const optionCount = question.options?.["zh-Hans"]?.length ?? 0;
      const optionImages = question.option_preview_images ?? [];
      const isAllowedTextOnlyQuestion = allowedTextOnlyQuestions.has(question.id);
      if (
        (optionImages.length > 0 && optionImages.length !== optionCount) ||
        (optionCount > 0 &&
          optionImages.length === 0 &&
          !isAllowedTextOnlyQuestion)
      ) {
        throw new Error(
          `${question.id}: expected ${optionCount} option images, found ${optionImages.length}`
        );
      }

      optionImages.forEach((path, optionIndex) => {
        assets.push({
          kind: "option",
          questionId: question.id,
          optionIndex,
          path
        });
      });
    }
  }

  workTypeOptionImages.forEach((path, optionIndex) => {
    assets.push({
      kind: "option",
      questionId: "work_type",
      optionIndex,
      path
    });
  });

  return assets;
}

export function validateSelectorOptionContract(
  questions,
  assets,
  workTypeOptionCount
) {
  const optionQuestions = Object.values(questions)
    .flat()
    .map((question) => ({
      id: question.id,
      optionCount: question.options?.["zh-Hans"]?.length ?? 0,
      imageCount: question.option_preview_images?.length ?? 0
    }))
    .filter((question) => question.optionCount > 0);
  const textOnlyQuestions = optionQuestions.filter(
    (question) => question.imageCount === 0
  );
  const configuredOptionCount = optionQuestions.reduce(
    (count, question) => count + question.optionCount,
    0
  );
  const totalOptionCount = configuredOptionCount + workTypeOptionCount;
  const visualOptionCount = assets.filter((asset) => asset.kind === "option").length;
  const textOnlyOptionCount = textOnlyQuestions.reduce(
    (count, question) => count + question.optionCount,
    0
  );

  if (totalOptionCount !== 45) {
    throw new Error(`expected 45 selector options, found ${totalOptionCount}`);
  }
  if (visualOptionCount !== 40) {
    throw new Error(`expected 40 visual selector options, found ${visualOptionCount}`);
  }
  if (textOnlyOptionCount !== 5) {
    throw new Error(`expected 5 text-only script options, found ${textOnlyOptionCount}`);
  }
  if (
    textOnlyQuestions.length !== 1 ||
    textOnlyQuestions[0].id !== "calligraphy_script"
  ) {
    const owners = textOnlyQuestions.map((question) => question.id).join(", ") || "none";
    throw new Error(
      `expected only calligraphy_script to be text-only, found ${owners}`
    );
  }
  if (textOnlyQuestions[0].optionCount !== 5) {
    throw new Error(
      `expected calligraphy_script to have 5 text-only options, found ${textOnlyQuestions[0].optionCount}`
    );
  }

  return { totalOptionCount, visualOptionCount, textOnlyOptionCount };
}

function isOutsideRoot(relativePath) {
  return (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}

export function resolveSelectorAssetPath(previewsRoot, assetPath) {
  if (!assetPath.startsWith("/previews/")) {
    throw new Error(`${assetPath}: expected an asset path under /previews/`);
  }

  const resolvedPath = path.resolve(
    previewsRoot,
    assetPath.slice("/previews/".length).replaceAll("/", path.sep)
  );
  if (isOutsideRoot(path.relative(previewsRoot, resolvedPath))) {
    throw new Error(`${assetPath}: path escapes client/public/previews`);
  }

  return resolvedPath;
}

export async function canonicalizeSelectorAssetPath(
  previewsRoot,
  assetPath,
  realpathImpl = realpath
) {
  const resolvedPath = resolveSelectorAssetPath(previewsRoot, assetPath);
  const realPreviewsRoot = await realpathImpl(previewsRoot);

  let realAssetPath;
  try {
    realAssetPath = await realpathImpl(resolvedPath);
  } catch (error) {
    throwSelectorAssetRealpathError(assetPath, error);
  }

  if (isOutsideRoot(path.relative(realPreviewsRoot, realAssetPath))) {
    throw new Error(`${assetPath}: real path escapes client/public/previews`);
  }

  return {
    filePath: realAssetPath,
    identity: process.platform === "win32" ? realAssetPath.toLowerCase() : realAssetPath
  };
}

export function throwSelectorAssetRealpathError(assetPath, error) {
  if (error.code === "ENOENT") {
    throw new Error(`${assetPath}: selector asset file is missing`, { cause: error });
  }
  throw error;
}

function describeOwner(asset) {
  if (asset.kind === "hero") {
    return `hero ${asset.questionId}`;
  }
  return `option ${asset.questionId}[${asset.optionIndex}]`;
}

export function registerSelectorAssetOwner(ownersByIdentity, identity, asset) {
  const previousOwner = ownersByIdentity.get(identity);
  if (previousOwner) {
    throw new Error(
      `${asset.path}: duplicate selector asset assigned to ${previousOwner} and ${describeOwner(asset)}`
    );
  }
  ownersByIdentity.set(identity, describeOwner(asset));
}

export function validateSelectorAssetMetadata(asset, metadata) {
  const expected =
    asset.kind === "hero"
      ? { width: 1024, height: 576 }
      : { width: 320, height: 240 };

  if (metadata.format !== "webp") {
    throw new Error(`${asset.path}: expected WebP, found ${metadata.format ?? "unknown format"}`);
  }

  if (metadata.width !== expected.width || metadata.height !== expected.height) {
    throw new Error(
      `${asset.path}: expected ${expected.width}x${expected.height}, found ${metadata.width}x${metadata.height}`
    );
  }
}
