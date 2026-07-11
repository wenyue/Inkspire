import { describe, expect, it } from "vitest";
import questions from "../../config/questions.json";
import {
  getInitialQuestion,
  isClassicReferenceComplete,
  isChoosingClassicReference,
  isQuestionFlowComplete,
  nextQuestion,
  optionValueForQuestion,
  type QuestionConfig,
  resultLayoutForWidth
} from "../src/domain";

const config: QuestionConfig = { questions: questions as QuestionConfig["questions"] };

describe("domain question flow", () => {
  it("starts with the work type question", () => {
    const question = getInitialQuestion(config);

    expect(question.id).toBe("work_type");
    expect(question.title["zh-Hans"]).toBe("先定创作方向");
    expect(question.title.en).toBe("Choose a creative direction");
    expect(question.options?.["zh-Hans"]).toEqual(["国画", "书法", "从历代名作取意"]);
    expect(question.options?.en).toEqual(["Painting", "Calligraphy", "Draw from Masterworks"]);
  });

  it("maps the third work type option to the classic reference picker", () => {
    const question = getInitialQuestion(config);

    expect(optionValueForQuestion(question, "从历代名作取意", "zh-Hans")).toBe("classic_reference");
    expect(optionValueForQuestion(question, "Draw from Masterworks", "en")).toBe("classic_reference");
  });

  it("shows only painting follow-up questions after choosing painting", () => {
    const answers = { work_type: "painting" };
    const question = nextQuestion(config, answers);

    expect(question?.id).toBe("painting_subject");
    expect(question?.id.startsWith("calligraphy")).toBe(false);
  });

  it("shows only calligraphy follow-up questions after choosing calligraphy", () => {
    const answers = { work_type: "calligraphy" };
    const question = nextQuestion(config, answers);

    expect(question?.id).toBe("text");
    expect(question?.id.startsWith("painting")).toBe(false);
  });

  it("asks for the calligraphy text before style choices", () => {
    const answers = { work_type: "calligraphy", text: "年年有余" };
    const question = nextQuestion(config, answers);

    expect(question?.id).toBe("calligraphy_script");
  });

  it("does not ask painting style questions while choosing a classic reference", () => {
    const answers = { work_type: "classic_reference" };

    expect(isChoosingClassicReference(answers)).toBe(true);
    expect(nextQuestion(config, answers)).toBeNull();
    expect(isQuestionFlowComplete(config, answers)).toBe(false);
  });

  it("treats a selected classic reference as a completed painting branch", () => {
    const answers = {
      work_type: "painting",
      creation_mode: "classic_reference",
      classic_artwork_id: "flowering-branches"
    };

    expect(isClassicReferenceComplete(answers)).toBe(true);
    expect(nextQuestion(config, answers)).toBeNull();
    expect(isQuestionFlowComplete(config, answers)).toBe(true);
  });

  it("reports completion after all branched questions are answered", () => {
    const answers = {
      work_type: "painting",
      painting_subject: "山水",
      painting_brushwork: "写意",
      painting_palette: "水墨",
      painting_mood: "清雅",
      painting_format: "立轴"
    };

    expect(isQuestionFlowComplete(config, answers)).toBe(true);
    expect(nextQuestion(config, answers)).toBeNull();
  });

  it("does not complete the calligraphy branch until the text is answered", () => {
    const answers = {
      work_type: "calligraphy",
      calligraphy_script: "行书",
      calligraphy_spirit: "俊逸",
      calligraphy_layout: "立轴",
      calligraphy_material: "素宣"
    };

    expect(isQuestionFlowComplete(config, answers)).toBe(false);
    expect(nextQuestion(config, answers)?.id).toBe("text");
  });

  it("uses stacked result layout below 700px and split layout at 700px or wider", () => {
    expect(resultLayoutForWidth(390)).toBe("stacked");
    expect(resultLayoutForWidth(699)).toBe("stacked");
    expect(resultLayoutForWidth(700)).toBe("split");
  });
});
