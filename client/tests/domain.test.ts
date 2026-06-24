import { describe, expect, it } from "vitest";
import questions from "../../config/questions.json";
import {
  getInitialQuestion,
  isQuestionFlowComplete,
  nextQuestion,
  resultLayoutForWidth
} from "../src/domain";

const config = { questions };

describe("domain question flow", () => {
  it("starts with the work type question", () => {
    const question = getInitialQuestion(config);

    expect(question.id).toBe("work_type");
    expect(question.options["zh-Hans"]).toEqual(["国画", "书法"]);
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

  it("reports completion after all branched questions are answered", () => {
    const answers = {
      work_type: "painting",
      painting_subject: "山水",
      painting_palette: "水墨",
      painting_mood: "清雅",
      painting_composition: "竖幅",
      painting_detail: "简淡"
    };

    expect(isQuestionFlowComplete(config, answers)).toBe(true);
    expect(nextQuestion(config, answers)).toBeNull();
  });

  it("does not complete the calligraphy branch until the text is answered", () => {
    const answers = {
      work_type: "calligraphy",
      calligraphy_script: "行书",
      calligraphy_energy: "灵动",
      calligraphy_layout: "竖排",
      calligraphy_paper: "素宣",
      calligraphy_ink: "浓墨"
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
