import { useEffect, useRef, useState } from "react";
import { Brush, ImagePlus, Wand2 } from "lucide-react";
import type { GenerationRecord } from "../api";
import { resultLayoutForWidth } from "../domain";

interface ResultViewProps {
  record: GenerationRecord;
  artworkLabel: string;
  fusionLabel: string;
  makeLabel: string;
  makeHint: string;
  adjustLabel: string;
  adjustRetryLabel: string;
  attachPhotoLabel: string;
  busyLabel: string;
  failedTitle: string;
  failedHint: string;
  imageUnavailableTitle: string;
  imageUnavailableHint: string;
  fusionUnavailableTitle: string;
  fusionUnavailableHint: string;
  actionError?: string;
  isAttachingPhoto?: boolean;
  canMake?: boolean;
  onMake: () => void;
  onAdjust: () => void;
  onAttachPhoto: (file: File) => void;
}

function recordImage(record: GenerationRecord, kind: "artwork" | "fusion") {
  const path = kind === "artwork" ? record.artwork_path || record.thumbnail_path : record.fusion_path;
  if (!path) {
    return "";
  }
  return `/api/records/${record.id}/images/${kind}`;
}

function openNestedFileInput(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  event.currentTarget.querySelector("input")?.click();
}

export default function ResultView({
  record,
  artworkLabel,
  fusionLabel,
  makeLabel,
  makeHint,
  adjustLabel,
  adjustRetryLabel,
  attachPhotoLabel,
  busyLabel,
  failedTitle,
  failedHint,
  imageUnavailableTitle,
  imageUnavailableHint,
  fusionUnavailableTitle,
  fusionUnavailableHint,
  actionError = "",
  isAttachingPhoto = false,
  canMake = true,
  onMake,
  onAdjust,
  onAttachPhoto
}: ResultViewProps) {
  const [layout, setLayout] = useState(resultLayoutForWidth(window.innerWidth));
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const resultRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onResize = () => setLayout(resultLayoutForWidth(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof resultRef.current?.scrollIntoView === "function") {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setFailedImages({});
  }, [record.id]);

  const artwork = recordImage(record, "artwork");
  const fusion = recordImage(record, "fusion");
  const failed = record.status === "failed";
  const artworkFailed = Boolean(artwork && failedImages.artwork);
  const fusionFailed = Boolean(fusion && failedImages.fusion);
  const mediaClassName = layout === "stacked" ? "compact-result-media" : undefined;
  const artworkFigure = (
    <figure>
      {artwork && !artworkFailed ? (
        <img
          className={mediaClassName}
          src={artwork}
          alt={artworkLabel}
          onError={() => setFailedImages((current) => ({ ...current, artwork: true }))}
        />
      ) : (
        <div className={`image-placeholder image-error ${mediaClassName ?? ""}`.trim()} role="status">
          <strong>{imageUnavailableTitle}</strong>
          <span>{imageUnavailableHint}</span>
        </div>
      )}
      <figcaption>{artworkLabel}</figcaption>
    </figure>
  );
  const fusionFigure = fusion ? (
    <figure>
      {!fusionFailed ? (
        <img
          className={mediaClassName}
          src={fusion}
          alt={fusionLabel}
          onError={() => setFailedImages((current) => ({ ...current, fusion: true }))}
        />
      ) : (
        <div className={`image-placeholder image-error ${mediaClassName ?? ""}`.trim()} role="status">
          <strong>{fusionUnavailableTitle}</strong>
          <span>{fusionUnavailableHint}</span>
        </div>
      )}
      <figcaption>{fusionLabel}</figcaption>
    </figure>
  ) : null;
  const resultActions = (
    <>
      {canMake && !failed && !artworkFailed ? <p className="result-conversion-hint">{makeHint}</p> : null}
      <div className="result-actions">
        {canMake && !failed && !artworkFailed ? (
          <button className="primary-action result-action-button" type="button" onClick={onMake}>
            <Brush aria-hidden="true" size={16} />
            {makeLabel}
          </button>
        ) : null}
        <button className="secondary-action result-action-button" type="button" onClick={onAdjust}>
          <Wand2 aria-hidden="true" size={16} />
          {failed || artworkFailed ? adjustRetryLabel : adjustLabel}
        </button>
        {!failed && !fusion ? (
          <label className="secondary-action result-upload-action" tabIndex={0} onKeyDown={openNestedFileInput}>
            <ImagePlus aria-hidden="true" size={16} />
            {isAttachingPhoto ? busyLabel : attachPhotoLabel}
            <input
              type="file"
              accept="image/*"
              disabled={isAttachingPhoto}
              aria-label={attachPhotoLabel}
              tabIndex={-1}
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
      </div>
    </>
  );

  return (
    <section className="result-view" ref={resultRef}>
      {failed ? (
        <div className="result-failed" role="status">
          <strong>{failedTitle}</strong>
          <span>{failedHint}</span>
        </div>
      ) : (
        <>
          <div className={`result-grid ${layout}`}>
            {artworkFigure}
            {layout === "split" ? fusionFigure : null}
          </div>
          {layout === "stacked" ? resultActions : null}
          {layout === "stacked" && fusionFigure ? (
            <div className="result-grid stacked result-fusion-followup">
              {fusionFigure}
            </div>
          ) : null}
        </>
      )}
      {failed || layout === "split" ? resultActions : null}
      {actionError ? <p className="error-line" role="status">{actionError}</p> : null}
    </section>
  );
}
