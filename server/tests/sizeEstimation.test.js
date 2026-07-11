const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SIZE,
  normalizeGenerationComplexity,
  resolveOrientation,
  sizeFromComplexityAndAspectRatio,
  normalizeArtworkSizeCandidate,
  estimateFromEnvironment
} = require("../src/sizeEstimation");

test("uses neutral density language for the environment fallback recommendation", () => {
  assert.equal(DEFAULT_SIZE.label, "环境估算备用尺寸");
  assert.equal(DEFAULT_SIZE.reason, "环境图片 AI 尺寸估算不可用时，按均衡疏密与竖幅比例提供备用参考。");
});

test("normalizes generation complexity with medium fallback", () => {
  assert.equal(normalizeGenerationComplexity("small"), "small");
  assert.equal(normalizeGenerationComplexity("medium"), "medium");
  assert.equal(normalizeGenerationComplexity("large"), "large");
  assert.equal(normalizeGenerationComplexity("huge"), "medium");
  assert.equal(normalizeGenerationComplexity(undefined), "medium");
});

test("resolves orientation from notes before question answers", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_format: "横幅" },
      conversationNotes: "最后改成竖幅，更适合挂起来"
    }),
    { orientation: "portrait", source: "notes" }
  );
});

test("resolves full orientation priority from notes, answers, artwork aspect, then default", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_composition_orientation: "landscape" },
      conversationNotes: "最后改成竖幅",
      aspectRatio: 1.8
    }),
    { orientation: "portrait", source: "notes" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_composition_orientation: "landscape" },
      aspectRatio: 0.6
    }),
    { orientation: "landscape", source: "question" }
  );
  assert.deepEqual(resolveOrientation({ aspectRatio: 0.75 }), { orientation: "portrait", source: "artwork_aspect" });
  assert.deepEqual(resolveOrientation(), { orientation: "portrait", source: "default" });
});

test("falls through an unknown artwork format to the artwork aspect", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_format: "unsupported" },
      aspectRatio: 1.8
    }),
    { orientation: "landscape", source: "artwork_aspect" }
  );
});

test("maps stable question orientation answers and keeps subject Landscape out of orientation", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: {
        work_type: "painting",
        painting_subject: "Landscape",
        painting_composition_orientation: "unknown"
      },
      conversationNotes: ""
    }),
    { orientation: "portrait", source: "default" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: {
        work_type: "painting",
        painting_format: { id: "horizontal", orientation: "landscape" }
      }
    }),
    { orientation: "landscape", source: "question" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "calligraphy", calligraphy_layout_orientation: "landscape" }
    }),
    { orientation: "landscape", source: "question" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "calligraphy", calligraphy_layout: { id: "plaque" } }
    }),
    { orientation: "landscape", source: "question" }
  );
});

test("uses artwork format orientation mapping for localized painting and calligraphy answers", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_format: "Fan" }
    }),
    { orientation: "landscape", source: "question" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "calligraphy", calligraphy_layout: "Album" }
    }),
    { orientation: "square", source: "question" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "calligraphy", calligraphy_layout: "Plaque" }
    }),
    { orientation: "landscape", source: "question" }
  );
});

test("does not accept negated orientation phrases as positive intent", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_format: "立轴" },
      conversationNotes: "不要横幅"
    }),
    { orientation: "portrait", source: "question" }
  );
});

test("computes production size from target area and aspect ratio", () => {
  const size = sizeFromComplexityAndAspectRatio({
    generationComplexity: "medium",
    aspectRatio: 2 / 3,
    orientation: "portrait"
  });
  assert.equal(size.preset_id, "complexity_medium");
  assert.equal(size.width_cm, 45);
  assert.equal(size.height_cm, 70);
  assert.equal(typeof size.label, "string");
  assert.equal(typeof size.reason, "string");
});

test("describes generated size presets through density and open-space language", () => {
  const small = sizeFromComplexityAndAspectRatio({ generationComplexity: "small" });
  const medium = sizeFromComplexityAndAspectRatio({ generationComplexity: "medium" });
  const large = sizeFromComplexityAndAspectRatio({ generationComplexity: "large" });

  assert.equal(small.label, "疏朗参考尺寸");
  assert.equal(small.reason, "按画面疏密与比例估算，适合作为疏朗布局制作参考。");
  assert.equal(medium.label, "均衡参考尺寸");
  assert.equal(medium.reason, "按画面疏密、虚实与比例估算，适合作为均衡布局制作参考。");
  assert.equal(large.label, "繁密参考尺寸");
  assert.equal(large.reason, "按画面疏密与比例估算，层次繁密但仍保留清楚气口与虚处。");
});

test("keeps square sizes square and rounds to 5cm", () => {
  const size = sizeFromComplexityAndAspectRatio({
    generationComplexity: "medium",
    aspectRatio: 1.05,
    orientation: "square"
  });
  assert.equal(size.width_cm, size.height_cm);
  assert.equal(size.width_cm % 5, 0);
});

test("normalizes AI artwork size candidates and enforces orientation", () => {
  assert.deepEqual(normalizeArtworkSizeCandidate({
    preset_id: "ai_scene",
    label: "环境估算",
    width_cm: 80,
    height_cm: 45,
    reason: "按客厅墙面估算"
  }, "portrait"), {
    preset_id: "ai_scene",
    label: "环境估算",
    width_cm: 45,
    height_cm: 80,
    reason: "按客厅墙面估算"
  });
  assert.deepEqual(normalizeArtworkSizeCandidate({
    width_cm: 52,
    height_cm: 52
  }, "portrait"), {
    preset_id: "ai_scene",
    label: "环境估算尺寸",
    width_cm: 50,
    height_cm: 55
  });
  assert.deepEqual(normalizeArtworkSizeCandidate({
    width_cm: 52,
    height_cm: 52
  }, "landscape"), {
    preset_id: "ai_scene",
    label: "环境估算尺寸",
    width_cm: 55,
    height_cm: 50
  });
  assert.equal(normalizeArtworkSizeCandidate({ width_cm: 0, height_cm: 50 }, "portrait"), null);
});

test("environment estimation normalizes AI result and enforces final orientation", async () => {
  const result = await estimateFromEnvironment({
    runner: async ({ stage, prompt, record }) => {
      assert.equal(stage, "size_estimation");
      assert.equal(prompt, "estimate this room");
      assert.equal(record.id, "record-estimate");
      return {
        text: JSON.stringify({
          generation_complexity: "large",
          recommended_artwork_size: {
            preset_id: "wall-fit",
            label: "客厅主墙",
            width_cm: 95,
            height_cm: 55,
            reason: "按沙发背景墙比例估算"
          }
        })
      };
    },
    prompt: "estimate this room",
    record: { id: "record-estimate" },
    resolvedOrientation: { orientation: "portrait", source: "question" }
  });

  assert.deepEqual(result, {
    generation_complexity: "large",
    recommended_artwork_size: {
      preset_id: "environment_estimate_large",
      label: "繁密参考尺寸",
      width_cm: 55,
      height_cm: 95,
      reason: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合繁密布局与作品幅式，同时保留清楚气口与虚处。"
    }
  });
});

test("environment estimation normalizes physical size to the target artwork canvas ratio", async () => {
  const result = await estimateFromEnvironment({
    runner: async () => ({
      json: {
        generation_complexity: "medium",
        recommended_artwork_size: {
          width_cm: 70,
          height_cm: 45
        }
      }
    }),
    record: { id: "record-handscroll" },
    resolvedOrientation: { orientation: "landscape", source: "question" },
    targetCanvas: { width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape" }
  });

  assert.deepEqual(result.recommended_artwork_size, {
    preset_id: "environment_estimate_medium",
    label: "均衡参考尺寸",
    width_cm: 80,
    height_cm: 40,
    reason: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合均衡疏密与作品幅式。"
  });
});

test("environment estimation falls back to medium and existing size on AI failure", async () => {
  const fallbackSize = {
    preset_id: "existing",
    label: "现有尺寸",
    width_cm: 40,
    height_cm: 60,
    reason: "用户已有建议"
  };

  const result = await estimateFromEnvironment({
    runner: async () => {
      throw new Error("estimation unavailable");
    },
    record: { id: "record-fallback" },
    resolvedOrientation: { orientation: "portrait", source: "default" },
    fallbackSize
  });

  assert.deepEqual(result, {
    generation_complexity: "medium",
    recommended_artwork_size: fallbackSize
  });
});

test("artwork environment fallback sizes use the same target canvas ratio after runner failure", async () => {
  const handscroll = await estimateFromEnvironment({
    runner: async () => {
      throw new Error("estimation unavailable");
    },
    record: { id: "record-handscroll-fallback" },
    resolvedOrientation: { orientation: "landscape", source: "question" },
    targetCanvas: { width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape" },
    fallbackSize: {
      preset_id: "existing",
      label: "现有尺寸",
      width_cm: 70,
      height_cm: 45
    }
  });
  const square = await estimateFromEnvironment({
    runner: async () => {
      throw new Error("estimation unavailable");
    },
    record: { id: "record-square-fallback" },
    resolvedOrientation: { orientation: "square", source: "runtime_fallback" },
    targetCanvas: { width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" }
  });

  assert.deepEqual(handscroll.recommended_artwork_size, {
    preset_id: "existing",
    label: "现有尺寸",
    width_cm: 80,
    height_cm: 40
  });
  assert.equal(square.recommended_artwork_size.width_cm, square.recommended_artwork_size.height_cm);
  assert.equal(square.recommended_artwork_size.preset_id, "environment_fallback_medium_square");
  assert.equal(square.recommended_artwork_size.label, "均衡参考尺寸");
  assert.equal(square.recommended_artwork_size.reason, "环境图片尺寸估算不可用，按均衡疏密与作品幅式提供备用参考。");
});

test("environment estimation can preserve fallback complexity on failure", async () => {
  const result = await estimateFromEnvironment({
    runner: async () => {
      throw new Error("estimation unavailable");
    },
    record: { id: "record-small-fallback" },
    resolvedOrientation: { orientation: "portrait", source: "default" },
    fallbackComplexity: "small"
  });

  assert.equal(result.generation_complexity, "small");
});
