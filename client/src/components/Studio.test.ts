import { describe, expect, test } from "vitest";
import { fallbackConfig, type PublicConfig } from "../api";
import { previousStudioStepUrlForState } from "./Studio";
import { optionSourceNote } from "./Studio";

const config: PublicConfig = {
  ...fallbackConfig,
  questions: {
    painting: [
      {
        id: "painting_subject",
        title: { "zh-Hans": "题材", "zh-Hant": "題材", en: "Subject" },
        options: { "zh-Hans": ["山水"], "zh-Hant": ["山水"], en: ["Landscape"] },
      },
      {
        id: "painting_style",
        title: { "zh-Hans": "风格", "zh-Hant": "風格", en: "Style" },
        options: { "zh-Hans": ["写意"], "zh-Hant": ["寫意"], en: ["Freehand"] },
      },
    ],
    calligraphy: [],
  },
};

describe("previousStudioStepUrlForState", () => {
  test("returns the previous question URL after answering a branch question", () => {
    expect(previousStudioStepUrlForState({
      config,
      answers: {
        work_type: "painting",
        painting_subject: "山水",
      },
      photoStepComplete: false,
      complexityStepComplete: false,
      hasSourcePhoto: false,
      notesFocusRequest: 0,
    })).toBe("/studio?step=question&index=0");
  });

  test("returns the photo URL from complexity or notes steps", () => {
    expect(previousStudioStepUrlForState({
      config,
      answers: {
        work_type: "painting",
        painting_subject: "山水",
        painting_style: "写意",
      },
      photoStepComplete: true,
      complexityStepComplete: false,
      hasSourcePhoto: false,
      notesFocusRequest: 0,
    })).toBe("/studio?step=photo");

    expect(previousStudioStepUrlForState({
      config,
      answers: {
        work_type: "painting",
        painting_subject: "山水",
        painting_style: "写意",
      },
      photoStepComplete: true,
      complexityStepComplete: true,
      hasSourcePhoto: false,
      notesFocusRequest: 0,
    })).toBe("/studio?step=complexity");
  });

  test("returns the work type URL after only choosing the work type", () => {
    expect(previousStudioStepUrlForState({
      config,
      answers: { work_type: "painting" },
      photoStepComplete: false,
      complexityStepComplete: false,
      hasSourcePhoto: false,
      notesFocusRequest: 0,
    })).toBe("/studio?step=work_type");
  });
});

describe("optionSourceNote", () => {
  test("returns the localized verified source note for a script option", () => {
    expect(optionSourceNote({
      id: "calligraphy_script",
      title: { "zh-Hans": "书体", "zh-Hant": "書體", en: "Script" },
      options: { "zh-Hans": ["楷书"], "zh-Hant": ["楷書"], en: ["Regular"] },
      option_source_notes: [{ "zh-Hans": "取法唐·颜真卿《多宝塔碑》", "zh-Hant": "取法唐·顏真卿《多寶塔碑》", en: "Reference: Yan Zhenqing" }]
    }, 0, "zh-Hans")).toBe("取法唐·颜真卿《多宝塔碑》");
  });
});
