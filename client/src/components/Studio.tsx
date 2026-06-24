import { Camera, ImagePlus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFusion, createGeneration, uploadPhoto, type GenerationRecord, type PublicConfig } from "../api";
import {
  getInitialQuestion,
  isQuestionFlowComplete,
  nextQuestion,
  optionValueForQuestion,
  type Answers,
  type Locale,
  type Question,
  type WorkType
} from "../domain";

interface StudioProps {
  config: PublicConfig;
  locale: Locale;
  t: (key: string) => string;
  list: (key: string) => string[];
  onResult: (record: GenerationRecord) => void;
  resultSlot: React.ReactNode;
  notesFocusRequest?: number;
}

function localizedText(value: Record<string, string>, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function localizedPreviewText(question: Question, locale: Locale): string {
  const preview = question.preview_prompt;
  if (preview && typeof preview === "object") {
    return localizedText(preview, locale);
  }
  if (locale === "zh-Hans" && preview) {
    return preview;
  }
  return localizedText(question.title, locale);
}

function questionOptions(question: Question, locale: Locale): string[] {
  return question.options[locale] ?? question.options["zh-Hans"] ?? [];
}

function previewClassName(questionId: string, index: number): string {
  const family = questionId.startsWith("calligraphy") ? "calligraphy" : "painting";
  return `option-preview ${family}-preview preview-${index % 4}`;
}

export default function Studio({ config, locale, t, list, onResult, resultSlot, notesFocusRequest = 0 }: StudioProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const [conversationNotes, setConversationNotes] = useState("");
  const [sourcePhotoPath, setSourcePhotoPath] = useState("");
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

  useEffect(() => {
    if (notesFocusRequest <= 0 || !complete) {
      return;
    }
    notesRef.current?.focus();
    if (typeof notesRef.current?.scrollIntoView === "function") {
      notesRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [complete, notesFocusRequest]);

  const answerQuestion = (option: string) => {
    if (!question) {
      return;
    }
    const value = optionValueForQuestion(question, option, locale);
    setAnswers((current) => ({ ...current, [question.id]: value }));
  };

  const onPhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploading(true);
    setError("");
    try {
      const upload = await uploadPhoto(file);
      setSourcePhotoPath(upload.source_photo_path);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setIsUploading(false);
    }
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
        source_photo_path: sourcePhotoPath
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
      <div className="studio-header">
        <div>
          <h1>{t("studio.title")}</h1>
          <p>{t("studio.subtitle")}</p>
        </div>
        <Sparkles aria-hidden="true" size={22} />
      </div>

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
        <button
          type="button"
          onClick={() => {
            setSourcePhotoPath("");
            setError("");
          }}
        >
          {t("studio.skipPhoto")}
        </button>
      </div>
      {isUploading ? <p className="status-line" role="status">{t("studio.uploadingPhoto")}</p> : null}
      {!isUploading && sourcePhotoPath ? <p className="status-line" role="status">{t("studio.photoReady")}</p> : null}

      <div className="scroll-question">
        {question ? (
          <>
            <div className="preview-ink" aria-hidden="true">
              <span>{localizedPreviewText(question, locale)}</span>
            </div>
            <h2>{localizedText(question.title, locale)}</h2>
            <div className="option-grid">
              {questionOptions(question, locale).map((option, index) => (
                <button key={option} type="button" onClick={() => answerQuestion(option)}>
                  <span className={previewClassName(question.id, index)} aria-hidden="true" />
                  <span className="option-label">{option}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="conversation-panel">
            <h2>{t("studio.notesPlaceholder")}</h2>
            <textarea
              ref={notesRef}
              value={conversationNotes}
              onChange={(event) => setConversationNotes(event.target.value)}
              placeholder={t("studio.notesPlaceholder")}
            />
            <div className="suggestion-row">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  className={index === 0 ? "primary-chip" : ""}
                  onClick={() => generate(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <button className="primary-action" type="button" disabled={!complete || isGenerating} onClick={() => generate()}>
              {isGenerating ? t("studio.generating") : t("buttons.generate")}
            </button>
          </div>
        )}
      </div>

      {error ? <p className="error-line">{error}</p> : null}
      {resultSlot}
    </section>
  );
}
