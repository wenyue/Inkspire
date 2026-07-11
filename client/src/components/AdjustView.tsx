import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { GenerationRecord } from "../api";
import ImageViewer from "./ImageViewer";

interface AdjustViewProps {
  record: GenerationRecord;
  title: string;
  intro: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel: string;
  backLabel: string;
  clearLabel: string;
  baseLabel: string;
  artworkLabel: string;
  t: (key: string) => string;
  suggestions: string[];
  isSubmitting?: boolean;
  error?: string;
  onBack: () => void;
  onSubmit: (note: string) => void;
}

function recordImage(record: GenerationRecord): string {
  const path = record.artwork_path || record.thumbnail_path;
  return path ? `/api/records/${record.id}/images/artwork` : "";
}

export default function AdjustView({
  record,
  title,
  intro,
  placeholder,
  submitLabel,
  submittingLabel,
  backLabel,
  clearLabel,
  baseLabel,
  artworkLabel,
  t,
  suggestions,
  isSubmitting = false,
  error = "",
  onBack,
  onSubmit
}: AdjustViewProps) {
  const [note, setNote] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const image = recordImage(record);
  const baseImageLabel = `${baseLabel} ${artworkLabel}`;

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  return (
    <section className="adjust-view">
      <div className="adjust-toolbar">
        <button className="back-action" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          {backLabel}
        </button>
      </div>
      <h2>{title}</h2>
      <div className="adjust-base">
        {image && !imageFailed ? (
          <button
            className="adjust-base-open surface-clear-button"
            type="button"
            aria-label={`查看${baseImageLabel}`}
            onClick={() => setViewerImage({ src: image, alt: baseImageLabel })}
          >
            <img
              className="adjust-base-image"
              src={image}
              alt={baseImageLabel}
              onError={() => setImageFailed(true)}
            />
          </button>
        ) : (
          <div className="adjust-base-placeholder" aria-hidden="true">
            {record.type === "painting" ? "画" : "书"}
          </div>
        )}
        <span className="adjust-base-label">{baseLabel}</span>
      </div>
      <p className="adjust-intro">{intro}</p>
      <div className="adjust-note-shell">
        <textarea
          ref={noteRef}
          className="adjust-note"
          aria-label={title}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
        />
        {note ? (
          <button
            type="button"
            className="adjust-note-clear surface-clear-button"
            aria-label={clearLabel}
            onClick={() => {
              setNote("");
              noteRef.current?.focus();
            }}
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
      <div className="suggestion-row">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setNote(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
      <button
        className="primary-action"
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit(trimmed)}
      >
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
      {error ? <p className="error-line" role="status">{error}</p> : null}
      {viewerImage ? (
        <ImageViewer src={viewerImage.src} alt={viewerImage.alt} t={t} onClose={() => setViewerImage(null)} />
      ) : null}
    </section>
  );
}
