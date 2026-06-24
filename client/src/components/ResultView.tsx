import { useEffect, useState } from "react";
import { ImagePlus, MessageSquareText } from "lucide-react";
import type { GenerationRecord } from "../api";
import { resultLayoutForWidth } from "../domain";

interface ResultViewProps {
  record: GenerationRecord;
  artworkLabel: string;
  fusionLabel: string;
  makeLabel: string;
  continueLabel: string;
  addNotesLabel: string;
  attachPhotoLabel: string;
  busyLabel: string;
  failedTitle: string;
  failedHint: string;
  actionError?: string;
  isAttachingPhoto?: boolean;
  onMake: () => void;
  onContinue: () => void;
  onAddNotes: () => void;
  onAttachPhoto: (file: File) => void;
}

function recordImage(record: GenerationRecord, kind: "artwork" | "fusion") {
  const path = kind === "artwork" ? record.artwork_path || record.thumbnail_path : record.fusion_path;
  if (!path) {
    return "";
  }
  return `/api/records/${record.id}/images/${kind}`;
}

export default function ResultView({
  record,
  artworkLabel,
  fusionLabel,
  makeLabel,
  continueLabel,
  addNotesLabel,
  attachPhotoLabel,
  busyLabel,
  failedTitle,
  failedHint,
  actionError = "",
  isAttachingPhoto = false,
  onMake,
  onContinue,
  onAddNotes,
  onAttachPhoto
}: ResultViewProps) {
  const [layout, setLayout] = useState(resultLayoutForWidth(window.innerWidth));

  useEffect(() => {
    const onResize = () => setLayout(resultLayoutForWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const artwork = recordImage(record, "artwork");
  const fusion = recordImage(record, "fusion");
  const failed = record.status === "failed";

  return (
    <section className="result-view">
      {failed ? (
        <div className="result-failed" role="status">
          <strong>{failedTitle}</strong>
          <span>{failedHint}</span>
        </div>
      ) : (
        <div className={`result-grid ${layout}`}>
          <figure>
            {artwork ? <img src={artwork} alt={artworkLabel} /> : <div className="image-placeholder">{artworkLabel}</div>}
            <figcaption>{artworkLabel}</figcaption>
          </figure>
          {fusion ? (
            <figure>
              <img src={fusion} alt={fusionLabel} />
              <figcaption>{fusionLabel}</figcaption>
            </figure>
          ) : null}
        </div>
      )}
      <div className="result-actions">
        <button className="secondary-action result-action-button" type="button" onClick={onContinue}>
          {continueLabel}
        </button>
        <button className="secondary-action result-action-button" type="button" onClick={onAddNotes}>
          <MessageSquareText aria-hidden="true" size={16} />
          {addNotesLabel}
        </button>
        {!failed && !fusion ? (
          <label className="secondary-action result-upload-action">
            <ImagePlus aria-hidden="true" size={16} />
            {isAttachingPhoto ? busyLabel : attachPhotoLabel}
            <input
              type="file"
              accept="image/*"
              disabled={isAttachingPhoto}
              aria-label={attachPhotoLabel}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onAttachPhoto(file);
                }
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
        {!failed ? (
          <button className="primary-action result-action-button" type="button" onClick={onMake}>
            {makeLabel}
          </button>
        ) : null}
      </div>
      {actionError ? <p className="error-line" role="status">{actionError}</p> : null}
    </section>
  );
}
