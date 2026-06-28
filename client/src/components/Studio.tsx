import { Camera, ImagePlus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  isGenerationLimitError,
  isPhotoTooLargeError,
  uploadPhoto,
  type GenerationComplexity,
  type GenerationJob,
  type GenerationRecord,
  type PublicConfig
} from "../api";
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
  photoStepComplete?: boolean;
  generationComplexity?: GenerationComplexity;
  complexityStepComplete?: boolean;
}

type StudioStepQuery =
  | { step: "work_type" }
  | { step: "question"; index: number }
  | { step: "photo" }
  | { step: "complexity" }
  | { step: "notes" };

interface StudioProps {
  config: PublicConfig;
  locale: Locale;
  t: (key: string) => string;
  list: (key: string) => string[];
  onStartGeneration: (payload: {
    type: WorkType;
    answers: Answers;
    conversationNotes: string;
    source_photo_path?: string;
    recommended_artwork_size?: GenerationRecord["recommended_artwork_size"];
    generation_complexity?: GenerationComplexity;
    origin_tab?: "studio";
    operation?: "create";
  }) => Promise<void>;
  activeJobs?: GenerationJob[];
  resultSlot: React.ReactNode;
  notesFocusRequest?: number;
  iterationRecord?: GenerationRecord | null;
  hasResult?: boolean;
  onStartOver?: () => void;
  studioResetRequest?: number;
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

function montagePreviewImages(question: Question, locale: Locale): string[] {
  const images = (question.option_preview_images ?? [])
    .filter((src): src is string => typeof src === "string" && src.length > 0)
    .filter((src) => !src.includes("inkspire-decide"));
  return images.length > 0 ? images : [localizedPreviewImage(question, locale)];
}

function optionPreviewFallback(question: Question, option: string, index: number): string {
  if (question.id === "calligraphy_script") {
    return ["◆", "●", "◇", "◎"][index] ?? "◆";
  }
  return ["◆", "●", "◇", "◎"][index] ?? "◆";
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

function maxInputBytes(config: PublicConfig): number {
  const configuredMb = Number(config.image?.maxInputSizeMb ?? 10);
  const maxInputSizeMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 10;
  return maxInputSizeMb * 1024 * 1024;
}

function openNestedFileInput(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  event.currentTarget.querySelector("input")?.click();
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
  const totals = [
    config.questions.painting.length,
    config.questions.calligraphy.length,
  ]
    .filter((total) => total > 0)
    .map((total) => total + 2);
  return totals.length > 0 && totals.every((total) => total === totals[0]) ? totals[0] : null;
}

function generationJobLabel(job: GenerationJob, locale: Locale): string {
  const stage = job.stage === "fusion_render"
    ? (locale === "en" ? "preview" : "效果图")
    : (locale === "en" ? "artwork" : "作品图");
  return job.title ? `${job.title} ${stage}` : stage;
}

function answersFromRecord(record: GenerationRecord, fallback: Answers): Answers {
  return {
    ...fallback,
    ...(record.answers ?? {}),
    work_type: record.type
  };
}

function studioStepUrlForState(
  config: PublicConfig,
  answers: Answers,
  photoStepComplete: boolean,
  complexityStepComplete: boolean,
  hasSourcePhoto: boolean,
): string {
  if (!answers.work_type) {
    return "/studio?step=work_type";
  }
  const currentQuestion = nextQuestion(config, answers);
  if (currentQuestion) {
    const branchQuestions = questionsForAnswers(config, answers);
    const questionIndex = Math.max(0, branchQuestions.findIndex((item) => item.id === currentQuestion.id));
    return `/studio?step=question&index=${questionIndex}`;
  }
  if (!photoStepComplete) {
    return "/studio?step=photo";
  }
  return hasSourcePhoto || complexityStepComplete ? "/studio?step=notes" : "/studio?step=complexity";
}

function readStudioStepQuery(search: string): StudioStepQuery | null {
  const params = new URLSearchParams(search);
  const step = params.get("step");
  if (step === "work_type" || step === "photo" || step === "complexity" || step === "notes") {
    return { step };
  }
  if (step === "question") {
    const index = Number(params.get("index") ?? "0");
    return { step, index: Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0 };
  }
  return null;
}

function trimAnswersForStudioQuestion(config: PublicConfig, answers: Answers, index: number): Answers {
  if (!answers.work_type) {
    return answers;
  }
  const branchQuestions = questionsForAnswers(config, answers);
  const keepIds = new Set(["work_type", ...branchQuestions.slice(0, index).map((item) => item.id)]);
  const nextAnswers = { ...answers };
  for (const question of branchQuestions) {
    if (!keepIds.has(question.id)) {
      delete nextAnswers[question.id];
    }
  }
  return nextAnswers;
}

export function getProgressLabel(config: PublicConfig, answers: Answers, locale: Locale): string {
  const workType = answers.work_type;
  if (!workType) {
    const initialTotal = expectedInitialStepTotal(config);
    return initialTotal ? progressLabel(1, initialTotal, locale) : progressStepOnly(1, locale);
  }
  const total = 1 + questionsForAnswers(config, answers).length + 1;
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
  onStartGeneration,
  activeJobs = [],
  resultSlot,
  notesFocusRequest = 0,
  iterationRecord = null,
  hasResult = false,
  onStartOver,
  studioResetRequest = 0
}: StudioProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Answers>(() => readStudioDraft().answers ?? {});
  const [conversationNotes, setConversationNotes] = useState(() => readStudioDraft().conversationNotes ?? "");
  const [sourcePhotoPath, setSourcePhotoPath] = useState(() => readStudioDraft().sourcePhotoPath ?? "");
  const [selectedPhotoName, setSelectedPhotoName] = useState(() => readStudioDraft().selectedPhotoName ?? "");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoPreviewFailed, setPhotoPreviewFailed] = useState(false);
  const [photoStepComplete, setPhotoStepComplete] = useState(
    () => readStudioDraft().photoStepComplete ?? false,
  );
  const [generationComplexity, setGenerationComplexity] = useState<GenerationComplexity | undefined>(
    () => readStudioDraft().generationComplexity
  );
  const [complexityStepComplete, setComplexityStepComplete] = useState(
    () => readStudioDraft().complexityStepComplete ?? false,
  );
  const [recommendedArtworkSize, setRecommendedArtworkSize] = useState<GenerationRecord["recommended_artwork_size"]>(
    () => readStudioDraft().recommendedArtworkSize ?? null
  );
  const [textQuestionDraft, setTextQuestionDraft] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingGeneration, setIsSubmittingGeneration] = useState(false);
  const [error, setError] = useState("");
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingPhotoSelection = useRef<{ file: File; input: HTMLInputElement } | null>(null);
  const pendingPhotoTimer = useRef<number | null>(null);

  const question = useMemo(() => {
    if (!answers.work_type) {
      return getInitialQuestion(config);
    }
    return nextQuestion(config, answers);
  }, [answers, config]);
  const complete = isQuestionFlowComplete(config, answers);
  const suggestions = list("suggestions");
  const noteSuggestions = suggestions.slice(1);
  const canGoBack = Boolean(answers.work_type);
  const showPhotoStep = complete && !photoStepComplete;
  const showComplexityStep = complete
    && photoStepComplete
    && !sourcePhotoPath
    && !complexityStepComplete
    && notesFocusRequest <= 0;
  const showConversationStep = complete && photoStepComplete && !showComplexityStep;
  const showCreationPanel = !hasResult || notesFocusRequest > 0;
  const isIteratingResult = showConversationStep && notesFocusRequest > 0;
  const studioActiveJobs = activeJobs.filter((job) => (job.origin_tab ?? "studio") === "studio");
  const generationLimitReached = studioActiveJobs.length > 0;
  const generationSummary = sourcePhotoPath
    ? t("studio.generationSummaryWithPreview")
    : t("studio.generationSummaryArtwork");

  useEffect(() => {
    writeStudioDraft({
      answers,
      conversationNotes,
      sourcePhotoPath,
      selectedPhotoName,
      recommendedArtworkSize,
      photoStepComplete,
      generationComplexity,
      complexityStepComplete,
    });
  }, [
    answers,
    conversationNotes,
    sourcePhotoPath,
    selectedPhotoName,
    recommendedArtworkSize,
    photoStepComplete,
    generationComplexity,
    complexityStepComplete,
  ]);

  useEffect(() => () => {
    revokePhotoPreview(photoPreviewUrl);
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (studioResetRequest <= 0) {
      return;
    }
    setAnswers({});
    setConversationNotes("");
    setSourcePhotoPath("");
    setSelectedPhotoName("");
    setTextQuestionDraft("");
    setRecommendedArtworkSize(null);
    setPhotoStepComplete(false);
    setGenerationComplexity(undefined);
    setComplexityStepComplete(false);
    setPhotoPreviewFailed(false);
    setPhotoPreviewUrl((current) => {
      revokePhotoPreview(current);
      return "";
    });
    setError("");
  }, [studioResetRequest]);

  useEffect(() => {
    if (notesFocusRequest <= 0 || !iterationRecord) {
      return;
    }
    setAnswers((current) => answersFromRecord(iterationRecord, current));
    setConversationNotes("");
    setSourcePhotoPath(iterationRecord.source_photo_path ?? "");
    setSelectedPhotoName("");
    setPhotoPreviewFailed(false);
    setPhotoPreviewUrl((current) => {
      revokePhotoPreview(current);
      return "";
    });
    setRecommendedArtworkSize(iterationRecord.recommended_artwork_size ?? null);
    setPhotoStepComplete(true);
    setGenerationComplexity(undefined);
    setComplexityStepComplete(true);
    setError("");
  }, [iterationRecord, notesFocusRequest]);

  useEffect(() => {
    if (notesFocusRequest <= 0 || !showConversationStep) {
      return;
    }
    notesRef.current?.focus();
    if (typeof notesRef.current?.scrollIntoView === "function") {
      notesRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [notesFocusRequest, showConversationStep]);

  useEffect(() => {
    if (question?.input_type === "textarea") {
      setTextQuestionDraft(answers[question.id] ?? "");
      return;
    }
    setTextQuestionDraft("");
  }, [answers, question?.id, question?.input_type]);

  useEffect(() => {
    const studioStep = readStudioStepQuery(location.search);
    if (!studioStep) {
      return;
    }
    setError("");
    if (studioStep.step === "work_type") {
      setAnswers({});
      setPhotoStepComplete(false);
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      return;
    }
    if (studioStep.step === "question") {
      setAnswers((current) => trimAnswersForStudioQuestion(config, current, studioStep.index));
      setPhotoStepComplete(false);
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      return;
    }
    if (studioStep.step === "photo") {
      setPhotoStepComplete(false);
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      return;
    }
    if (studioStep.step === "complexity") {
      setPhotoStepComplete(true);
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      return;
    }
    setPhotoStepComplete(true);
    setComplexityStepComplete(true);
  }, [config, location.search]);

  const answerQuestion = (option: string) => {
    if (!question) {
      return;
    }
    const value = optionValueForQuestion(question, option, locale);
    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);
    navigate(studioStepUrlForState(config, nextAnswers, false, false, false));
  };

  const answerTextQuestion = () => {
    if (!question) {
      return;
    }
    const value = textQuestionDraft.trim();
    if (!value) {
      return;
    }
    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);
    navigate(studioStepUrlForState(config, nextAnswers, false, false, false));
  };

  const goToPreviousStudioStep = () => {
    if (showConversationStep && !sourcePhotoPath && complexityStepComplete && notesFocusRequest <= 0) {
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      setError("");
      return;
    }
    if (photoStepComplete) {
      setPhotoStepComplete(false);
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      setError("");
      return;
    }
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

  const goBack = () => {
    if (readStudioStepQuery(location.search) && typeof window !== "undefined") {
      goToPreviousStudioStep();
      window.history.back();
      return;
    }
    goToPreviousStudioStep();
  };

  useEffect(() => () => {
    if (pendingPhotoTimer.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pendingPhotoTimer.current);
    }
  }, []);

  const applySelectedPhoto = async (file: File, input: HTMLInputElement) => {
    if (file.size > maxInputBytes(config)) {
      input.value = "";
      setError(t("errors.photoTooLarge"));
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
      setPhotoStepComplete(false);
      setGenerationComplexity(undefined);
      setComplexityStepComplete(false);
      setPhotoPreviewUrl((current) => {
        revokePhotoPreview(current);
        return previewUrl;
      });
      setRecommendedArtworkSize(upload.recommended_artwork_size ?? null);
    } catch (error) {
      setError(isPhotoTooLargeError(error) ? t("errors.photoTooLarge") : t("errors.generic"));
    } finally {
      input.value = "";
      setIsUploading(false);
    }
  };

  const onPhotoChange = (event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    pendingPhotoSelection.current = { file, input };
    if (pendingPhotoTimer.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pendingPhotoTimer.current);
    }
    if (typeof window === "undefined") {
      void applySelectedPhoto(file, input);
      return;
    }
    pendingPhotoTimer.current = window.setTimeout(() => {
      pendingPhotoTimer.current = null;
      const selection = pendingPhotoSelection.current;
      pendingPhotoSelection.current = null;
      if (selection) {
        void applySelectedPhoto(selection.file, selection.input);
      }
    }, 0);
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
    setGenerationComplexity(undefined);
    setComplexityStepComplete(false);
    setError("");
  };

  const skipPhotoStep = () => {
    setPhotoStepComplete(true);
    setGenerationComplexity(undefined);
    setComplexityStepComplete(false);
    setError("");
    navigate(studioStepUrlForState(config, answers, true, false, false));
  };

  const continueFromPhotoStep = () => {
    if (!sourcePhotoPath) {
      return;
    }
    setPhotoStepComplete(true);
    setGenerationComplexity(undefined);
    setComplexityStepComplete(true);
    setError("");
    navigate(studioStepUrlForState(config, answers, true, true, true));
  };

  const selectGenerationComplexity = (complexity: GenerationComplexity) => {
    setGenerationComplexity(complexity);
    setComplexityStepComplete(true);
    setError("");
    navigate(studioStepUrlForState(config, answers, true, true, false));
  };

  const resetStudioDraft = () => {
    setAnswers({});
    setConversationNotes("");
    setTextQuestionDraft("");
    setPhotoStepComplete(false);
    setGenerationComplexity(undefined);
    setComplexityStepComplete(false);
    removePhoto();
    onStartOver?.();
  };

  const generate = async (note?: string) => {
    const type = answers.work_type as WorkType | undefined;
    if (!type) {
      return;
    }
    if (readStudioStepQuery(location.search)) {
      navigate("/studio", { replace: true });
    }
    setIsSubmittingGeneration(true);
    setError("");
    try {
      await onStartGeneration({
        type,
        answers,
        conversationNotes: note || conversationNotes,
        source_photo_path: sourcePhotoPath,
        recommended_artwork_size: recommendedArtworkSize ?? null,
        generation_complexity: sourcePhotoPath ? undefined : generationComplexity ?? "medium",
        origin_tab: "studio",
        operation: "create"
      });
    } catch (caught) {
      setError(isGenerationLimitError(caught) ? t("studio.generationLimit") : t("errors.generic"));
    } finally {
      setIsSubmittingGeneration(false);
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
                  <div
                    className="preview-montage"
                    data-count={montagePreviewImages(question, locale).length}
                    aria-hidden="true"
                  >
                    {montagePreviewImages(question, locale).map((src, index) => (
                      <img
                        key={`${src}-${index}`}
                        className="montage-tile"
                        src={src}
                        alt=""
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
                <h2>{localizedText(question.title, locale)}</h2>
                {question.input_type === "textarea" ? (
                  <div className="text-question">
                    <textarea
                      aria-label={localizedText(question.title, locale)}
                      value={textQuestionDraft}
                      onChange={(event) =>
                        setTextQuestionDraft(event.target.value)
                      }
                      placeholder={
                        question.placeholder
                          ? localizedText(question.placeholder, locale)
                          : localizedText(question.title, locale)
                      }
                    />
                    {question.helper_text ? (
                      <p>{localizedText(question.helper_text, locale)}</p>
                    ) : null}
                    <button
                      type="button"
                      className="primary-action"
                      disabled={!textQuestionDraft.trim()}
                      onClick={answerTextQuestion}
                    >
                      {question.submit_label
                        ? localizedText(question.submit_label, locale)
                        : continueLabel(locale)}
                    </button>
                  </div>
                ) : (
                  <div className="option-grid">
                    {questionOptions(question, locale).map((option, index) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => answerQuestion(option)}
                      >
                        <span
                          className="option-preview-frame"
                          aria-hidden="true"
                        >
                          <span className="option-preview-fallback">
                            {optionPreviewFallback(question, option, index)}
                          </span>
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
            ) : showPhotoStep ? (
              <div className="photo-step">
                <h2>{t("studio.photo")}</h2>
                <p className="photo-step-hint">{t("studio.photoHint")}</p>
                {isUploading ? (
                  <p className="status-line" role="status">
                    {t("studio.uploadingPhoto")}
                  </p>
                ) : null}
                {!isUploading && sourcePhotoPath ? (
                  <>
                    <div className="selected-photo-panel">
                      {photoPreviewUrl && !photoPreviewFailed ? (
                        <img
                          className="selected-photo-preview"
                          src={photoPreviewUrl}
                          alt={t("studio.selectedPhotoPreview")}
                          onError={() => setPhotoPreviewFailed(true)}
                        />
                      ) : (
                        <div
                          className="selected-photo-placeholder"
                          aria-hidden="true"
                        >
                          <ImagePlus size={20} />
                        </div>
                      )}
                      <div className="selected-photo-copy">
                        <p className="status-line" role="status">
                          {t("studio.photoReady")}
                        </p>
                        <span>
                          {selectedPhotoName || t("studio.photoUploaded")}
                        </span>
                      </div>
                      <button
                        className="selected-photo-remove"
                        type="button"
                        onClick={removePhoto}
                      >
                        <X aria-hidden="true" size={16} />
                        {t("studio.removePhoto")}
                      </button>
                    </div>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={continueFromPhotoStep}
                    >
                      {continueLabel(locale)}
                    </button>
                  </>
                ) : null}
                {!isUploading && !sourcePhotoPath ? (
                  <div
                    className="photo-step-actions"
                    aria-label={t("studio.photo")}
                  >
                    <label tabIndex={0} onKeyDown={openNestedFileInput}>
                      <ImagePlus aria-hidden="true" size={16} />
                      {t("studio.album")}
                      <input
                        type="file"
                        accept="image/*"
                        tabIndex={-1}
                        onChange={onPhotoChange}
                      />
                    </label>
                    <label tabIndex={0} onKeyDown={openNestedFileInput}>
                      <Camera aria-hidden="true" size={16} />
                      {t("studio.camera")}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        tabIndex={-1}
                        onInput={onPhotoChange}
                        onChange={onPhotoChange}
                      />
                    </label>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={generationLimitReached}
                      onClick={skipPhotoStep}
                    >
                      {t("studio.skipPhoto")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : showComplexityStep ? (
              <div className="conversation-panel">
                <h2>{t("studio.complexityTitle")}</h2>
                <p className="generation-summary">{t("studio.complexityHint")}</p>
                <div className="option-grid">
                  {([
                    ["small", t("studio.complexitySmall"), t("studio.complexitySmallHint")],
                    ["medium", t("studio.complexityMedium"), t("studio.complexityMediumHint")],
                    ["large", t("studio.complexityLarge"), t("studio.complexityLargeHint")],
                  ] as Array<[GenerationComplexity, string, string]>).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => selectGenerationComplexity(value)}
                    >
                      <span className="option-preview-frame" aria-hidden="true">
                        <span className="option-preview-fallback">
                          {value === "small" ? "简" : value === "medium" ? "衡" : "丰"}
                        </span>
                      </span>
                      <span>
                        <span className="option-label">{label}</span>
                        <span>{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="conversation-panel">
                <h2>{t("studio.notesPlaceholder")}</h2>
                {isIteratingResult ? (
                  <p className="iteration-hint">{t("studio.iterationHint")}</p>
                ) : null}
                <div className="conversation-note-shell">
                  <textarea
                    ref={notesRef}
                    aria-label={t("studio.notesPlaceholder")}
                    value={conversationNotes}
                    onChange={(event) => setConversationNotes(event.target.value)}
                    placeholder={t("studio.notesPlaceholder")}
                  />
                  {conversationNotes ? (
                    <button
                      type="button"
                      className="conversation-note-clear surface-clear-button"
                      aria-label={t("studio.clearNotes")}
                      onClick={() => setConversationNotes("")}
                    >
                      <X aria-hidden="true" size={14} />
                    </button>
                  ) : null}
                </div>
                <p className="generation-summary">{generationSummary}</p>
                <div className="suggestion-row">
                  {noteSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setConversationNotes(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <div className="conversation-actions">
                  <button
                    className="primary-action"
                    type="button"
                    disabled={!complete || isSubmittingGeneration || generationLimitReached}
                    onClick={() => generate()}
                  >
                    {isSubmittingGeneration ? t("studio.generating") : isIteratingResult ? t("studio.continueGenerate") : t("buttons.generate")}
                  </button>
                  {isIteratingResult ? (
                    <button
                      className="secondary-action compact-action restart-action"
                      type="button"
                      onClick={resetStudioDraft}
                    >
                      <RotateCcw aria-hidden="true" size={16} />
                      {t("studio.startOver")}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}

      {studioActiveJobs.length > 0 ? (
        <p className="status-line generation-status" role="status">
          {generationLimitReached ? t("studio.generationLimit") : t("studio.generatingWait")}
          <span>{studioActiveJobs.map((job) => generationJobLabel(job, locale)).join(" · ")}</span>
        </p>
      ) : null}
      {error ? <p className="error-line">{error}</p> : null}
      {resultSlot}
    </section>
  );
}
