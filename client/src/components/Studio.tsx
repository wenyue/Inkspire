import { Camera, ImagePlus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFusion, createGeneration, uploadPhoto, type GenerationRecord, type PublicConfig } from "../api";
import {
  getInitialQuestion,
  isQuestionFlowComplete,
  nextQuestion,
  optionValueForQuestion,
  questionsForAnswers,
  type Answers,
  type Locale,
  type Question,
  type WorkType
} from "../domain";

const STUDIO_DRAFT_KEY = "inkspire.studioDraft.v1";

interface StudioDraft {
  answers?: Answers;
  conversationNotes?: string;
  sourcePhotoPath?: string;
  selectedPhotoName?: string;
  recommendedArtworkSize?: GenerationRecord["recommended_artwork_size"];
}

interface StudioProps {
  config: PublicConfig;
  locale: Locale;
  t: (key: string) => string;
  list: (key: string) => string[];
  onResult: (record: GenerationRecord) => void;
  resultSlot: React.ReactNode;
  notesFocusRequest?: number;
  hasResult?: boolean;
  onStartOver?: () => void;
}

function localizedText(value: Record<string, string>, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function localizedPreviewText(question: Question, locale: Locale): string {
  if (question.id !== "work_type") {
    return localizedText(question.title, locale);
  }
  const preview = question.preview_prompt;
  if (preview && typeof preview === "object") {
    return localizedText(preview, locale);
  }
  if (locale === "zh-Hans" && preview) {
    return preview;
  }
  return localizedText(question.title, locale);
}

function localizedPreviewImage(question: Question, locale: Locale): string {
  const image = question.preview_image;
  if (image && typeof image === "object") {
    return localizedText(image, locale);
  }
  if (typeof image === "string" && image.length > 0) {
    return image;
  }
  return question.id.startsWith("calligraphy") ? "/previews/calligraphy-script.svg" : "/previews/painting-subject.svg";
}

function questionOptions(question: Question, locale: Locale): string[] {
  return question.options?.[locale] ?? question.options?.["zh-Hans"] ?? [];
}

function optionPreviewImage(question: Question, index: number, locale: Locale): string {
  return question.option_preview_images?.[index] ?? localizedPreviewImage(question, locale);
}

function optionPreviewFallback(question: Question, option: string, index: number): string {
  if (question.id === "calligraphy_script") {
    return ["楷", "行", "草", "墨"][index] ?? "墨";
  }
  return option.trim().charAt(0) || "墨";
}

function continueLabel(locale: Locale): string {
  if (locale === "en") {
    return "Continue";
  }
  if (locale === "zh-Hant") {
    return "繼續";
  }
  return "继续";
}

function readStudioDraft(): StudioDraft {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STUDIO_DRAFT_KEY);
    return raw ? JSON.parse(raw) as StudioDraft : {};
  } catch {
    return {};
  }
}

function writeStudioDraft(draft: StudioDraft) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
}

function revokePhotoPreview(url: string) {
  if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

function progressLabel(step: number, total: number, locale: Locale): string {
  if (locale === "en") {
    return `Step ${step} / ${total}`;
  }
  if (locale === "zh-Hant") {
    return `第 ${step} / ${total} 步`;
  }
  return `第 ${step} / ${total} 步`;
}

function progressStepOnly(step: number, locale: Locale): string {
  if (locale === "en") {
    return `Step ${step}`;
  }
  return `第 ${step} 步`;
}

function expectedInitialStepTotal(config: PublicConfig): number | null {
  const totals = [config.questions.painting.length, config.questions.calligraphy.length]
    .filter((total) => total > 0)
    .map((total) => total + 1);
  return totals.length > 0 && totals.every((total) => total === totals[0]) ? totals[0] : null;
}

export function getProgressLabel(config: PublicConfig, answers: Answers, locale: Locale): string {
  const workType = answers.work_type;
  if (!workType) {
    const initialTotal = expectedInitialStepTotal(config);
    return initialTotal ? progressLabel(1, initialTotal, locale) : progressStepOnly(1, locale);
  }
  const total = 1 + questionsForAnswers(config, answers).length;
  const currentQuestion = nextQuestion(config, answers);
  const branchQuestions = questionsForAnswers(config, answers);
  const step = currentQuestion
    ? branchQuestions.findIndex((item) => item.id === currentQuestion.id) + 2
    : total;
  return progressLabel(step, total, locale);
}

export default function Studio({
  config,
  locale,
  t,
  list,
  onResult,
  resultSlot,
  notesFocusRequest = 0,
  hasResult = false,
  onStartOver
}: StudioProps) {
  const [answers, setAnswers] = useState<Answers>(() => readStudioDraft().answers ?? {});
  const [conversationNotes, setConversationNotes] = useState(() => readStudioDraft().conversationNotes ?? "");
  const [sourcePhotoPath, setSourcePhotoPath] = useState(() => readStudioDraft().sourcePhotoPath ?? "");
  const [selectedPhotoName, setSelectedPhotoName] = useState(() => readStudioDraft().selectedPhotoName ?? "");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoPreviewFailed, setPhotoPreviewFailed] = useState(false);
  const [recommendedArtworkSize, setRecommendedArtworkSize] = useState<GenerationRecord["recommended_artwork_size"]>(
    () => readStudioDraft().recommendedArtworkSize ?? null
  );
  const [textQuestionDraft, setTextQuestionDraft] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const question = useMemo(() => {
    if (!answers.work_type) {
      return getInitialQuestion(config);
    }
    return nextQuestion(config, answers);
  }, [answers, config]);
  const complete = isQuestionFlowComplete(config, answers);
  const suggestions = list("suggestions");
  const canGoBack = Boolean(answers.work_type);
  const showCreationPanel = !hasResult || notesFocusRequest > 0;
  const showPhotoPanel = !answers.work_type || !question;
  const isIteratingResult = complete && notesFocusRequest > 0;

  useEffect(() => {
    writeStudioDraft({
      answers,
      conversationNotes,
      sourcePhotoPath,
      selectedPhotoName,
      recommendedArtworkSize
    });
  }, [answers, conversationNotes, sourcePhotoPath, selectedPhotoName, recommendedArtworkSize]);

  useEffect(() => () => {
    revokePhotoPreview(photoPreviewUrl);
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (notesFocusRequest <= 0 || !complete) {
      return;
    }
    notesRef.current?.focus();
    if (typeof notesRef.current?.scrollIntoView === "function") {
      notesRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [complete, notesFocusRequest]);

  useEffect(() => {
    if (question?.input_type === "textarea") {
      setTextQuestionDraft(answers[question.id] ?? "");
      return;
    }
    setTextQuestionDraft("");
  }, [answers, question?.id, question?.input_type]);

  const answerQuestion = (option: string) => {
    if (!question) {
      return;
    }
    const value = optionValueForQuestion(question, option, locale);
    setAnswers((current) => ({ ...current, [question.id]: value }));
  };

  const answerTextQuestion = () => {
    if (!question) {
      return;
    }
    const value = textQuestionDraft.trim();
    if (!value) {
      return;
    }
    setAnswers((current) => ({ ...current, [question.id]: value }));
  };

  const goBack = () => {
    setAnswers((current) => {
      const questionIds = ["work_type", ...questionsForAnswers(config, current).map((item) => item.id)];
      const lastAnsweredId = [...questionIds].reverse().find((id) => current[id]);
      if (!lastAnsweredId) {
        return current;
      }
      const nextAnswers = { ...current };
      delete nextAnswers[lastAnsweredId];
      return nextAnswers;
    });
    setError("");
  };

  const onPhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploading(true);
    setError("");
    try {
      const upload = await uploadPhoto(file);
      const previewUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : "";
      setSourcePhotoPath(upload.source_photo_path);
      setSelectedPhotoName(file.name);
      setPhotoPreviewFailed(false);
      setPhotoPreviewUrl((current) => {
        revokePhotoPreview(current);
        return previewUrl;
      });
      setRecommendedArtworkSize(upload.recommended_artwork_size ?? null);
    } catch {
      setError(t("errors.generic"));
    } finally {
      input.value = "";
      setIsUploading(false);
    }
  };

  const removePhoto = () => {
    setSourcePhotoPath("");
    setSelectedPhotoName("");
    setPhotoPreviewFailed(false);
    setPhotoPreviewUrl((current) => {
      revokePhotoPreview(current);
      return "";
    });
    setRecommendedArtworkSize(null);
    setError("");
  };

  const resetStudioDraft = () => {
    setAnswers({});
    setConversationNotes("");
    setTextQuestionDraft("");
    removePhoto();
    onStartOver?.();
  };

  const generate = async (note?: string) => {
    const type = answers.work_type as WorkType | undefined;
    if (!type) {
      return;
    }
    setIsGenerating(true);
    setError("");
    try {
      const payload = await createGeneration({
        type,
        answers,
        conversationNotes: note || conversationNotes,
        source_photo_path: sourcePhotoPath,
        recommended_artwork_size: recommendedArtworkSize ?? null
      });
      const record = payload.record ?? payload;
      onResult(record);
      if (record.status === "failed") {
        return;
      }
      if (sourcePhotoPath && record.id) {
        try {
          onResult(await createFusion(record.id));
        } catch {
          setError(t("errors.generic"));
        }
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="studio">
      {showCreationPanel ? (
        <>
          <div className="scroll-question">
            <div className="question-toolbar">
              <span>{getProgressLabel(config, answers, locale)}</span>
              {canGoBack ? (
                <button className="back-action" type="button" onClick={goBack}>
                  {t("studio.back")}
                </button>
              ) : null}
            </div>
            {question ? (
              <>
                <div className="preview-ink">
                  <img
                    className="question-preview-image"
                    src={localizedPreviewImage(question, locale)}
                    alt={localizedPreviewText(question, locale)}
                  />
                </div>
                <h2>{localizedText(question.title, locale)}</h2>
                {question.input_type === "textarea" ? (
                  <div className="text-question">
                    <textarea
                      aria-label={localizedText(question.title, locale)}
                      value={textQuestionDraft}
                      onChange={(event) => setTextQuestionDraft(event.target.value)}
                      placeholder={question.placeholder ? localizedText(question.placeholder, locale) : localizedText(question.title, locale)}
                    />
                    {question.helper_text ? <p>{localizedText(question.helper_text, locale)}</p> : null}
                    <button type="button" className="primary-action" disabled={!textQuestionDraft.trim()} onClick={answerTextQuestion}>
                      {question.submit_label ? localizedText(question.submit_label, locale) : continueLabel(locale)}
                    </button>
                  </div>
                ) : (
                  <div className="option-grid">
                    {questionOptions(question, locale).map((option, index) => (
                      <button key={option} type="button" onClick={() => answerQuestion(option)}>
                        <span className="option-preview-frame" aria-hidden="true">
                          <span className="option-preview-fallback">{optionPreviewFallback(question, option, index)}</span>
                          <img
                            className="option-preview-image"
                            src={optionPreviewImage(question, index, locale)}
                            alt=""
                            aria-hidden="true"
                          />
                        </span>
                        <span className="option-label">{option}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="conversation-panel">
                <h2>{t("studio.notesPlaceholder")}</h2>
                {isIteratingResult ? <p className="iteration-hint">{t("studio.iterationHint")}</p> : null}
                <textarea
                  ref={notesRef}
                  value={conversationNotes}
                  onChange={(event) => setConversationNotes(event.target.value)}
                  placeholder={t("studio.notesPlaceholder")}
                />
                <div className="suggestion-row">
                  {suggestions.map((suggestion, index) => {
                    const isStartSuggestion = index === 0;
                    if (isIteratingResult && isStartSuggestion) {
                      return null;
                    }
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        className={isStartSuggestion ? "primary-chip" : ""}
                        onClick={() => generate(isStartSuggestion ? undefined : suggestion)}
                      >
                        {suggestion}
                      </button>
                    );
                  })}
                </div>
                <div className="conversation-actions">
                  <button className="primary-action" type="button" disabled={!complete || isGenerating} onClick={() => generate()}>
                    {isGenerating ? t("studio.generating") : isIteratingResult ? t("studio.continueGenerate") : t("buttons.generate")}
                  </button>
                  {isIteratingResult ? (
                    <button className="secondary-action compact-action restart-action" type="button" onClick={resetStudioDraft}>
                      <RotateCcw aria-hidden="true" size={16} />
                      {t("studio.startOver")}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {showPhotoPanel ? (
            <>
              {isUploading ? <p className="status-line" role="status">{t("studio.uploadingPhoto")}</p> : null}
              {!isUploading ? (
                sourcePhotoPath ? (
                <div className="selected-photo-panel">
                  {photoPreviewUrl && !photoPreviewFailed ? (
                    <img
                      className="selected-photo-preview"
                      src={photoPreviewUrl}
                      alt={t("studio.selectedPhotoPreview")}
                      onError={() => setPhotoPreviewFailed(true)}
                    />
                  ) : (
                    <div className="selected-photo-placeholder" aria-hidden="true">
                      <ImagePlus size={20} />
                    </div>
                  )}
                  <div className="selected-photo-copy">
                    <p className="status-line" role="status">{t("studio.photoReady")}</p>
                    <span>{selectedPhotoName || t("studio.photoUploaded")}</span>
                  </div>
                  <button className="selected-photo-remove" type="button" onClick={removePhoto}>
                    <X aria-hidden="true" size={16} />
                    {t("studio.removePhoto")}
                  </button>
                </div>
                ) : (
                <div className="photo-strip" aria-label={t("studio.photo")}>
                  <span>{t("studio.photo")}</span>
                  <label>
                    <ImagePlus aria-hidden="true" size={16} />
                    {t("studio.album")}
                    <input type="file" accept="image/*" onChange={onPhotoChange} />
                  </label>
                  <label>
                    <Camera aria-hidden="true" size={16} />
                    {t("studio.camera")}
                    <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange} />
                  </label>
                </div>
                )
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {error ? <p className="error-line">{error}</p> : null}
      {resultSlot}
    </section>
  );
}
