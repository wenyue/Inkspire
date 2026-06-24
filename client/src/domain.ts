export type Locale = "zh-Hans" | "zh-Hant" | "en";
export type WorkType = "painting" | "calligraphy";
export type ResultLayout = "stacked" | "split";

export type LocalizedText = Record<string, string>;

export interface Question {
  id: string;
  applies_to?: string[];
  input_type?: "choice" | "textarea";
  preview_image?: string | LocalizedText;
  option_preview_images?: string[];
  preview_prompt?: string | LocalizedText;
  title: LocalizedText;
  placeholder?: LocalizedText;
  helper_text?: LocalizedText;
  submit_label?: LocalizedText;
  options?: Record<string, string[]>;
  default_option?: string;
}

export interface QuestionConfig {
  questions: {
    painting: Question[];
    calligraphy: Question[];
  };
}

export type Answers = Record<string, string>;

export const WORK_TYPE_QUESTION: Question = {
  id: "work_type",
  preview_image: "/previews/questions/work-type.webp",
  option_preview_images: [
    "/previews/options/work-type-0-painting.webp",
    "/previews/options/work-type-1-calligraphy.webp"
  ],
  preview_prompt: {
    "zh-Hans": "选择国画或书法创作方向",
    "zh-Hant": "選擇國畫或書法創作方向",
    en: "Preview the artwork direction"
  },
  title: {
    "zh-Hans": "先定作品类型",
    "zh-Hant": "先定作品類型",
    en: "Choose the work type"
  },
  options: {
    "zh-Hans": ["国画", "书法"],
    "zh-Hant": ["國畫", "書法"],
    en: ["Painting", "Calligraphy"]
  }
};

export function optionValueForQuestion(question: Question, option: string, locale: Locale): string {
  if (question.id !== "work_type") {
    return option;
  }

  const index = question.options[locale]?.indexOf(option) ?? -1;
  return index === 1 ? "calligraphy" : "painting";
}

export function getInitialQuestion(_config: QuestionConfig): Question {
  return WORK_TYPE_QUESTION;
}

export function workTypeFromAnswers(answers: Answers): WorkType | null {
  return answers.work_type === "painting" || answers.work_type === "calligraphy"
    ? answers.work_type
    : null;
}

export function questionsForAnswers(config: QuestionConfig, answers: Answers): Question[] {
  const workType = workTypeFromAnswers(answers);
  return workType ? config.questions[workType] ?? [] : [];
}

export function nextQuestion(config: QuestionConfig, answers: Answers): Question | null {
  const workType = workTypeFromAnswers(answers);
  if (!workType) {
    return WORK_TYPE_QUESTION;
  }

  return (config.questions[workType] ?? []).find((question) => !answers[question.id]) ?? null;
}

export function isQuestionFlowComplete(config: QuestionConfig, answers: Answers): boolean {
  return Boolean(workTypeFromAnswers(answers)) && nextQuestion(config, answers) === null;
}

export function resultLayoutForWidth(width: number): ResultLayout {
  return width >= 700 ? "split" : "stacked";
}

export function imageUrl(path?: string | null): string {
  return path ? `/api/records/${path}` : "";
}
