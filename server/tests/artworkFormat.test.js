const test = require("node:test");
const assert = require("node:assert/strict");
const {
  orientationForArtworkAnswers,
  orientationForArtworkFormat,
  resolveArtworkCanvas,
  resolveArtworkCanvasTuple
} = require("../src/artworkFormat");

const PORTRAIT = { width: 1024, height: 1536, aspectRatio: "2:3", orientation: "portrait" };
const LANDSCAPE = { width: 1536, height: 1024, aspectRatio: "3:2", orientation: "landscape" };
const SQUARE = { width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" };
const HANDSCROLL = { width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape" };

const paintingFormats = [
  ["立轴", PORTRAIT], ["立軸", PORTRAIT], ["Hanging Scroll", PORTRAIT], ["掛軸", PORTRAIT],
  ["横幅", LANDSCAPE], ["橫幅", LANDSCAPE], ["Horizontal", LANDSCAPE], ["横長", LANDSCAPE],
  ["斗方", SQUARE], ["斗方", SQUARE], ["Square", SQUARE], ["方形", SQUARE],
  ["手卷", HANDSCROLL], ["手卷", HANDSCROLL], ["Handscroll", HANDSCROLL], ["手巻", HANDSCROLL],
  ["扇面", LANDSCAPE], ["扇面", LANDSCAPE], ["Fan", LANDSCAPE]
];
const calligraphyFormats = [
  ["立轴", PORTRAIT], ["立軸", PORTRAIT], ["Hanging Scroll", PORTRAIT], ["掛軸", PORTRAIT],
  ["横幅", LANDSCAPE], ["橫幅", LANDSCAPE], ["Horizontal", LANDSCAPE], ["横長", LANDSCAPE],
  ["斗方", SQUARE], ["斗方", SQUARE], ["Square", SQUARE], ["方形", SQUARE],
  ["手卷", HANDSCROLL], ["手卷", HANDSCROLL], ["Handscroll", HANDSCROLL], ["手巻", HANDSCROLL],
  ["册页", SQUARE], ["冊頁", SQUARE], ["Album", SQUARE], ["画冊", SQUARE]
];
const formatCases = [
  ...paintingFormats.map(([format, canvas]) => ({
    format,
    canvas,
    answers: { work_type: "painting", painting_format: format }
  })),
  ...calligraphyFormats.map(([format, canvas]) => ({
    format,
    canvas,
    answers: { work_type: "calligraphy", calligraphy_layout: format }
  }))
];

test("maps localized painting and calligraphy formats to orientation and immutable canvas", () => {
  for (const { answers, format, canvas: expectedCanvas } of formatCases) {
    const label = `${answers.work_type}: ${format}`;
    assert.equal(orientationForArtworkFormat(format), expectedCanvas.orientation, label);
    assert.equal(orientationForArtworkAnswers(answers), expectedCanvas.orientation, label);
    const canvas = resolveArtworkCanvas({ answers });
    assert.deepEqual(canvas, expectedCanvas, label);
    assert.equal(Object.isFrozen(canvas), true, label);
  }
});

test("uses calligraphy format answers and portrait fallback", () => {
  assert.deepEqual(
    resolveArtworkCanvas({
      answers: { work_type: "calligraphy", calligraphy_layout: "冊頁" }
    }),
    SQUARE
  );
  assert.equal(orientationForArtworkFormat("unsupported"), "unknown");
  assert.deepEqual(
    resolveArtworkCanvas({ answers: { work_type: "painting", painting_format: "unsupported" } }),
    PORTRAIT
  );
  assert.deepEqual(
    resolveArtworkCanvas({
      answers: { work_type: "painting", painting_format: "unsupported" },
      fallbackCanvas: { width: 1200, height: 800, aspectRatio: "3:2" }
    }),
    { width: 1200, height: 800, aspectRatio: "3:2", orientation: "landscape" }
  );
});

test("resolved orientation overrides the answer while landscape handscroll keeps 2:1", () => {
  assert.deepEqual(
    resolveArtworkCanvas({
      answers: { work_type: "painting", painting_format: "横幅" },
      resolvedOrientation: "square"
    }),
    SQUARE
  );
  assert.deepEqual(
    resolveArtworkCanvas({
      answers: { work_type: "calligraphy", calligraphy_layout: "Handscroll" },
      resolvedOrientation: "landscape"
    }),
    HANDSCROLL
  );
});

test("resolves one canvas tuple with notes, format, legacy, and runtime fallback precedence", () => {
  assert.deepEqual(
    resolveArtworkCanvasTuple({
      answers: { work_type: "painting" },
      resolvedOrientation: "portrait",
      orientationSource: "default",
      fallbackCanvas: SQUARE
    }),
    { orientation: "square", source: "runtime_fallback", canvas: SQUARE }
  );
  assert.deepEqual(
    resolveArtworkCanvasTuple({
      answers: {
        work_type: "painting",
        painting_format: "Handscroll",
        painting_composition_orientation: "portrait"
      },
      resolvedOrientation: "portrait",
      orientationSource: "question"
    }),
    { orientation: "landscape", source: "question", canvas: HANDSCROLL }
  );
  assert.deepEqual(
    resolveArtworkCanvasTuple({
      answers: { work_type: "painting", painting_format: "Handscroll" },
      resolvedOrientation: "square",
      orientationSource: "notes"
    }),
    { orientation: "square", source: "notes", canvas: SQUARE }
  );
});
