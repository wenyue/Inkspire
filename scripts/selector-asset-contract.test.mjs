import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalizeSelectorAssetPath,
  collectSelectorAssets,
  registerSelectorAssetOwner,
  resolveSelectorAssetPath,
  throwSelectorAssetRealpathError,
  validateSelectorOptionContract,
  validateSelectorAssetMetadata
} from "./selector-asset-contract.mjs";
import {
  contactSheetGeometry,
  writeContactSheetOutput
} from "./build-selector-contact-sheet.mjs";

test("builds five-column contact-sheet geometry", () => {
  assert.deepEqual(contactSheetGeometry(40, 320, 240), {
    columns: 5,
    rows: 8,
    width: 1680,
    height: 2240
  });
});

test("refuses a symlink output before rendering and preserves its target", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-sheet-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sentinelPath = path.join(temporaryRoot, "sentinel.webp");
  const outputPath = path.join(temporaryRoot, "selector-options.webp");
  await writeFile(sentinelPath, "sentinel source pixels");
  try {
    await symlink(sentinelPath, outputPath, "file");
  } catch (error) {
    if (["EACCES", "EPERM", "UNKNOWN"].includes(error.code)) {
      t.skip(`symlink creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const hash = async () =>
    createHash("sha256").update(await readFile(sentinelPath)).digest("hex");
  const originalHash = await hash();
  let renderCalled = false;

  await assert.rejects(
    writeContactSheetOutput(temporaryRoot, outputPath, async () => {
      renderCalled = true;
      return Buffer.from("new pixels");
    }),
    /refusing symbolic-link contact-sheet output/
  );
  assert.equal(renderCalled, false);
  assert.equal(await hash(), originalHash);
});

test("refuses a symlink output ancestor before rendering", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-sheet-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const runtimePath = path.join(temporaryRoot, ".runtime");
  const targetPath = path.join(temporaryRoot, "source-tree");
  const reviewPath = path.join(runtimePath, "selector-review");
  const sentinelPath = path.join(targetPath, "sentinel.webp");
  const outputPath = path.join(reviewPath, "selector-options.webp");
  await mkdir(runtimePath);
  await mkdir(targetPath);
  await writeFile(sentinelPath, "source tree sentinel");
  try {
    await symlink(targetPath, reviewPath, "junction");
  } catch (error) {
    if (["EACCES", "EPERM", "UNKNOWN"].includes(error.code)) {
      t.skip(`junction creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const originalHash = createHash("sha256")
    .update(await readFile(sentinelPath))
    .digest("hex");
  let renderCalled = false;
  await assert.rejects(
    writeContactSheetOutput(temporaryRoot, outputPath, async () => {
      renderCalled = true;
      return Buffer.from("new pixels");
    }),
    /refusing symbolic-link contact-sheet ancestor/
  );

  assert.equal(renderCalled, false);
  assert.equal(
    createHash("sha256").update(await readFile(sentinelPath)).digest("hex"),
    originalHash
  );
});

test("revalidates output ancestors after rendering", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-sheet-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const runtimePath = path.join(temporaryRoot, ".runtime");
  const reviewPath = path.join(runtimePath, "selector-review");
  const displacedReviewPath = path.join(runtimePath, "original-review");
  const targetPath = path.join(temporaryRoot, "source-tree");
  const sentinelPath = path.join(targetPath, "sentinel.webp");
  const outputPath = path.join(reviewPath, "selector-options.webp");
  await mkdir(reviewPath, { recursive: true });
  await mkdir(targetPath);
  await writeFile(sentinelPath, "source tree sentinel");
  const originalHash = createHash("sha256")
    .update(await readFile(sentinelPath))
    .digest("hex");

  await assert.rejects(
    writeContactSheetOutput(temporaryRoot, outputPath, async (...rendererArguments) => {
      assert.deepEqual(rendererArguments, []);
      await rename(reviewPath, displacedReviewPath);
      await symlink(targetPath, reviewPath, "junction");
      return Buffer.from("new pixels");
    }),
    /refusing symbolic-link contact-sheet ancestor/
  );

  assert.equal(
    createHash("sha256").update(await readFile(sentinelPath)).digest("hex"),
    originalHash
  );
  assert.deepEqual(await readdir(targetPath), ["sentinel.webp"]);
});

test("writes only the renderer buffer and leaves no temporary path", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-sheet-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const reviewPath = path.join(temporaryRoot, ".runtime", "selector-review");
  const outputPath = path.join(reviewPath, "selector-options.webp");
  await mkdir(reviewPath, { recursive: true });

  await writeContactSheetOutput(temporaryRoot, outputPath, async (...rendererArguments) => {
    assert.deepEqual(rendererArguments, []);
    return Buffer.from("rendered pixels");
  });

  assert.equal((await readFile(outputPath)).toString(), "rendered pixels");
  assert.deepEqual(await readdir(reviewPath), ["selector-options.webp"]);
});

test("preserves renderer errors without leaving temporary output", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-sheet-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const reviewPath = path.join(temporaryRoot, ".runtime", "selector-review");
  const outputPath = path.join(reviewPath, "selector-options.webp");
  await mkdir(reviewPath, { recursive: true });
  const rendererError = new Error("renderer failed");

  await assert.rejects(
    writeContactSheetOutput(temporaryRoot, outputPath, async () => {
      throw rendererError;
    }),
    (error) => error === rendererError
  );
  assert.deepEqual(await readdir(reviewPath), []);
});

test("collects hero and option assets while allowing image-free script options", () => {
  const questions = {
    painting: [
      {
        id: "subject",
        preview_image: "/previews/questions/subject.webp",
        option_preview_images: [
          "/previews/options/subject-0.webp",
          "/previews/options/subject-1.webp"
        ],
        options: { "zh-Hans": ["山水", "花鸟"] }
      }
    ],
    calligraphy: [
      {
        id: "script",
        options: { "zh-Hans": ["楷书", "行书"] }
      },
      {
        id: "spirit",
        preview_image: "/previews/questions/spirit.webp",
        option_preview_images: ["/previews/options/spirit.webp"],
        options: { "zh-Hans": ["端庄"] }
      }
    ]
  };

  assert.deepEqual(
    collectSelectorAssets(
      questions,
      [
        "/previews/options/work-0.webp",
        "/previews/options/work-1.webp"
      ],
      ["script"]
    ),
    [
      {
        kind: "hero",
        questionId: "subject",
        path: "/previews/questions/subject.webp"
      },
      {
        kind: "option",
        questionId: "subject",
        optionIndex: 0,
        path: "/previews/options/subject-0.webp"
      },
      {
        kind: "option",
        questionId: "subject",
        optionIndex: 1,
        path: "/previews/options/subject-1.webp"
      },
      {
        kind: "hero",
        questionId: "spirit",
        path: "/previews/questions/spirit.webp"
      },
      {
        kind: "option",
        questionId: "spirit",
        optionIndex: 0,
        path: "/previews/options/spirit.webp"
      },
      {
        kind: "option",
        questionId: "work_type",
        optionIndex: 0,
        path: "/previews/options/work-0.webp"
      },
      {
        kind: "option",
        questionId: "work_type",
        optionIndex: 1,
        path: "/previews/options/work-1.webp"
      }
    ]
  );
});

test("rejects an unauthorized question with zero option images", () => {
  const questions = {
    calligraphy: [
      {
        id: "calligraphy_script",
        options: { "zh-Hans": ["楷书", "行书"] }
      }
    ]
  };

  assert.throws(
    () => collectSelectorAssets(questions, []),
    /calligraphy_script: expected 2 option images, found 0/
  );
});

test("accepts an explicitly allowed image-free calligraphy script question", () => {
  const questions = {
    calligraphy: [
      {
        id: "calligraphy_script",
        options: { "zh-Hans": ["楷书", "行书"] }
      }
    ]
  };

  assert.deepEqual(
    collectSelectorAssets(questions, [], ["calligraphy_script"]),
    []
  );
});

test("rejects a non-empty option image count that differs from the configured options", () => {
  const questions = {
    painting: [
      {
        id: "painting_subject",
        option_preview_images: ["/previews/options/subject.webp"],
        options: { "zh-Hans": ["山水", "花鸟"] }
      }
    ]
  };

  assert.throws(
    () => collectSelectorAssets(questions, []),
    /painting_subject: expected 2 option images, found 1/
  );
});

test("rejects option images on a question without configured options", () => {
  const questions = {
    calligraphy: [
      {
        id: "text",
        option_preview_images: ["/previews/options/unexpected.webp"]
      }
    ]
  };

  assert.throws(
    () => collectSelectorAssets(questions, []),
    /text: expected 0 option images, found 1/
  );
});

test("rejects wrong option dimensions", () => {
  assert.throws(
    () =>
      validateSelectorAssetMetadata(
        { kind: "option", path: "/previews/options/bad.webp" },
        { format: "webp", width: 300, height: 240 }
      ),
    /\/previews\/options\/bad\.webp: expected 320x240/
  );
});

test("rejects wrong hero dimensions", () => {
  assert.throws(
    () =>
      validateSelectorAssetMetadata(
        { kind: "hero", path: "/previews/questions/bad.webp" },
        { format: "webp", width: 1024, height: 512 }
      ),
    /\/previews\/questions\/bad\.webp: expected 1024x576/
  );
});

test("rejects non-WebP selector assets", () => {
  assert.throws(
    () =>
      validateSelectorAssetMetadata(
        { kind: "option", path: "/previews/options/bad.png" },
        { format: "png", width: 320, height: 240 }
      ),
    /\/previews\/options\/bad\.png: expected WebP/
  );
});

test("accepts selector assets with the expected WebP metadata", () => {
  assert.doesNotThrow(() =>
    validateSelectorAssetMetadata(
      { kind: "option", path: "/previews/options/good.webp" },
      { format: "webp", width: 320, height: 240 }
    )
  );
  assert.doesNotThrow(() =>
    validateSelectorAssetMetadata(
      { kind: "hero", path: "/previews/questions/good.webp" },
      { format: "webp", width: 1024, height: 576 }
    )
  );
});

function makeQuestion(id, optionCount, hasImages) {
  return {
    id,
    options: {
      "zh-Hans": Array.from({ length: optionCount }, (_, index) => `option-${index}`)
    },
    ...(hasImages
      ? {
          option_preview_images: Array.from(
            { length: optionCount },
            (_, index) => `/previews/options/${id}-${index}.webp`
          )
        }
      : {})
  };
}

function makeExpectedRepositoryContract() {
  const questions = {
    painting: [makeQuestion("painting_options", 37, true)],
    calligraphy: [makeQuestion("calligraphy_script", 5, false)]
  };
  const workTypeImages = [
    "/previews/options/work-0.webp",
    "/previews/options/work-1.webp",
    "/previews/options/work-2.webp"
  ];
  const assets = collectSelectorAssets(
    questions,
    workTypeImages,
    ["calligraphy_script"]
  );
  return { questions, workTypeImages, assets };
}

test("accepts the fixed 45 visual and text-only selector option contract", () => {
  const { questions, workTypeImages, assets } = makeExpectedRepositoryContract();

  assert.deepEqual(
    validateSelectorOptionContract(questions, assets, workTypeImages.length),
    {
      totalOptionCount: 45,
      visualOptionCount: 40,
      textOnlyOptionCount: 5
    }
  );
});

test("rejects changed selector option totals", () => {
  const questions = {
    painting: [makeQuestion("painting_options", 36, true)],
    calligraphy: [makeQuestion("calligraphy_script", 5, false)]
  };
  const workTypeImages = [
    "/previews/options/work-0.webp",
    "/previews/options/work-1.webp",
    "/previews/options/work-2.webp"
  ];
  const assets = collectSelectorAssets(
    questions,
    workTypeImages,
    ["calligraphy_script"]
  );

  assert.throws(
    () => validateSelectorOptionContract(questions, assets, workTypeImages.length),
    /expected 45 selector options, found 44/
  );
});

test("rejects a text-only owner other than calligraphy_script", () => {
  const questions = {
    painting: [makeQuestion("painting_options", 37, true)],
    calligraphy: [makeQuestion("other_script", 5, false)]
  };
  const workTypeImages = [
    "/previews/options/work-0.webp",
    "/previews/options/work-1.webp",
    "/previews/options/work-2.webp"
  ];
  const assets = collectSelectorAssets(questions, workTypeImages, ["other_script"]);

  assert.throws(
    () => validateSelectorOptionContract(questions, assets, workTypeImages.length),
    /expected only calligraphy_script to be text-only, found other_script/
  );
});

test("rejects lexical paths that resolve to exactly the parent of previews", () => {
  const previewsRoot = path.join("repository", "client", "public", "previews");

  assert.throws(
    () => resolveSelectorAssetPath(previewsRoot, "/previews/options/../.."),
    /path escapes client\/public\/previews/
  );
});

test("translates only asset ENOENT realpath errors to a path-specific missing error", () => {
  const missingError = Object.assign(new Error("native missing error"), {
    code: "ENOENT"
  });

  assert.throws(
    () =>
      throwSelectorAssetRealpathError(
        "/previews/options/missing.webp",
        missingError
      ),
    (error) => {
      assert.match(
        error.message,
        /\/previews\/options\/missing\.webp: selector asset file is missing/
      );
      assert.equal(error.cause, missingError);
      return true;
    }
  );
});

test("preserves non-ENOENT asset realpath errors by strict identity", () => {
  const permissionError = Object.assign(new Error("native permission error"), {
    code: "EACCES"
  });

  assert.throws(
    () =>
      throwSelectorAssetRealpathError(
        "/previews/options/inaccessible.webp",
        permissionError
      ),
    (error) => {
      assert.equal(error, permissionError);
      assert.equal(error.code, "EACCES");
      return true;
    }
  );
});

test("preserves previews-root realpath failures as native errors", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-assets-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const missingPreviewsRoot = path.join(temporaryRoot, "missing-previews");

  await assert.rejects(
    canonicalizeSelectorAssetPath(
      missingPreviewsRoot,
      "/previews/options/asset.webp"
    ),
    (error) => {
      assert.equal(error.code, "ENOENT");
      assert.equal(error.syscall, "realpath");
      assert.equal(error.cause, undefined);
      return true;
    }
  );
});

test("preserves a non-ENOENT previews-root realpath error by strict identity", async () => {
  const ioError = Object.assign(new Error("native I/O error"), { code: "EIO" });
  const failingRealpath = async () => {
    throw ioError;
  };

  await assert.rejects(
    canonicalizeSelectorAssetPath(
      path.join("repository", "client", "public", "previews"),
      "/previews/options/asset.webp",
      failingRealpath
    ),
    (error) => {
      assert.equal(error, ioError);
      assert.equal(error.code, "EIO");
      return true;
    }
  );
});

test("normalized path aliases collide as duplicate selector ownership", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-assets-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const previewsRoot = path.join(temporaryRoot, "public", "previews");
  const optionsRoot = path.join(previewsRoot, "options");
  await mkdir(optionsRoot, { recursive: true });
  await writeFile(path.join(optionsRoot, "asset.webp"), "fixture");

  const direct = await canonicalizeSelectorAssetPath(
    previewsRoot,
    "/previews/options/asset.webp"
  );
  const alias = await canonicalizeSelectorAssetPath(
    previewsRoot,
    "/previews/options/../options/asset.webp"
  );
  if (process.platform === "win32") {
    assert.equal(direct.identity, direct.filePath.toLowerCase());
  }
  const owners = new Map();
  registerSelectorAssetOwner(owners, direct.identity, {
    kind: "hero",
    questionId: "subject",
    path: "/previews/options/asset.webp"
  });

  assert.throws(
    () =>
      registerSelectorAssetOwner(owners, alias.identity, {
        kind: "option",
        questionId: "subject",
        optionIndex: 0,
        path: "/previews/options/../options/asset.webp"
      }),
    /duplicate selector asset assigned to hero subject and option subject\[0\]/
  );
});

test("symlink aliases collide as duplicate selector ownership", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-assets-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const previewsRoot = path.join(temporaryRoot, "public", "previews");
  const optionsRoot = path.join(previewsRoot, "options");
  const assetPath = path.join(optionsRoot, "asset.webp");
  const linkPath = path.join(optionsRoot, "alias.webp");
  await mkdir(optionsRoot, { recursive: true });
  await writeFile(assetPath, "fixture");
  try {
    await symlink(assetPath, linkPath, "file");
  } catch (error) {
    if (["EACCES", "EPERM", "UNKNOWN"].includes(error.code)) {
      t.skip(`symlink creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const direct = await canonicalizeSelectorAssetPath(
    previewsRoot,
    "/previews/options/asset.webp"
  );
  const alias = await canonicalizeSelectorAssetPath(
    previewsRoot,
    "/previews/options/alias.webp"
  );
  const owners = new Map();
  registerSelectorAssetOwner(owners, direct.identity, {
    kind: "hero",
    questionId: "subject",
    path: "/previews/options/asset.webp"
  });

  assert.throws(
    () =>
      registerSelectorAssetOwner(owners, alias.identity, {
        kind: "option",
        questionId: "subject",
        optionIndex: 0,
        path: "/previews/options/alias.webp"
      }),
    /duplicate selector asset assigned to hero subject and option subject\[0\]/
  );
});

test("rejects a symlink that escapes the real previews root", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "selector-assets-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const previewsRoot = path.join(temporaryRoot, "public", "previews");
  const optionsRoot = path.join(previewsRoot, "options");
  const outsidePath = path.join(temporaryRoot, "outside.webp");
  const linkPath = path.join(optionsRoot, "escape.webp");
  await mkdir(optionsRoot, { recursive: true });
  await writeFile(outsidePath, "fixture");
  try {
    await symlink(outsidePath, linkPath, "file");
  } catch (error) {
    if (["EACCES", "EPERM", "UNKNOWN"].includes(error.code)) {
      t.skip(`symlink creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(
    canonicalizeSelectorAssetPath(previewsRoot, "/previews/options/escape.webp"),
    /real path escapes client\/public\/previews/
  );
});
