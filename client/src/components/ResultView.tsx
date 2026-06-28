import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Brush, ImagePlus, Wand2 } from "lucide-react";
import type { GenerationRecord } from "../api";
import { resultLayoutForWidth } from "../domain";
import ImageViewer from "./ImageViewer";

interface ResultViewProps {
  record: GenerationRecord;
  artworkLabel: string;
  fusionLabel: string;
  makeLabel: string;
  makeHint: string;
  adjustLabel: string;
  adjustRetryLabel: string;
  attachPhotoLabel: string;
  generateFusionLabel: string;
  reuploadEnvironmentPhotoLabel: string;
  busyLabel: string;
  failedTitle: string;
  failedHint: string;
  imageUnavailableTitle: string;
  imageUnavailableHint: string;
  fusionUnavailableTitle: string;
  fusionUnavailableHint: string;
  backLabel?: string;
  actionError?: string;
  isAttachingPhoto?: boolean;
  canMake?: boolean;
  onBack?: () => void;
  onMake: () => void;
  onAdjust: () => void;
  onAttachPhoto: (file: File) => void;
  onGenerateFusion: () => void;
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
  generateFusionLabel,
  reuploadEnvironmentPhotoLabel,
  busyLabel,
  failedTitle,
  failedHint,
  imageUnavailableTitle,
  imageUnavailableHint,
  fusionUnavailableTitle,
  fusionUnavailableHint,
  backLabel,
  actionError = "",
  isAttachingPhoto = false,
  canMake = true,
  onBack,
  onMake,
  onAdjust,
  onAttachPhoto,
  onGenerateFusion
}: ResultViewProps) {
  const [layout, setLayout] = useState(resultLayoutForWidth(window.innerWidth));
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [viewerImage, setViewerImage] = useState<{ src: string; alt: string } | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const pendingPhotoSelection = useRef<{ file: File; input: HTMLInputElement } | null>(null);
  const pendingPhotoTimer = useRef<number | null>(null);

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

  useEffect(() => () => {
    if (pendingPhotoTimer.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pendingPhotoTimer.current);
    }
  }, []);

  const applySelectedPhoto = (file: File, input: HTMLInputElement): void => {
    onAttachPhoto(file);
    input.value = "";
  };

  const onPhotoChange = (event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>): void => {
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
      applySelectedPhoto(file, input);
      return;
    }
    pendingPhotoTimer.current = window.setTimeout(() => {
      pendingPhotoTimer.current = null;
      const selection = pendingPhotoSelection.current;
      pendingPhotoSelection.current = null;
      if (selection) {
        applySelectedPhoto(selection.file, selection.input);
      }
    }, 0);
  };

  const artwork = recordImage(record, "artwork");
  const fusion = recordImage(record, "fusion");
  const failed = record.status === "failed";
  const artworkFailed = Boolean(artwork && failedImages.artwork);
  const fusionFailed = Boolean(fusion && failedImages.fusion);
  const hasEnvironmentImage = Boolean(record.source_photo_path);
  const mediaClassName = layout === "stacked" ? "compact-result-media" : undefined;
  const uploadPhotoLabel = fusion ? reuploadEnvironmentPhotoLabel : attachPhotoLabel;
  const artworkFigure = (
    <figure>
      {artwork && !artworkFailed ? (
        <button
          className={`image-open-button ${mediaClassName ?? ""}`.trim()}
          type="button"
          aria-label={`查看${artworkLabel}`}
          onClick={() => setViewerImage({ src: artwork, alt: artworkLabel })}
        >
          <img
            className={mediaClassName}
            src={artwork}
            alt={artworkLabel}
            onError={() => setFailedImages((current) => ({ ...current, artwork: true }))}
          />
        </button>
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
        <button
          className={`image-open-button ${mediaClassName ?? ""}`.trim()}
          type="button"
          aria-label={`查看${fusionLabel}`}
          onClick={() => setViewerImage({ src: fusion, alt: fusionLabel })}
        >
          <img
            className={mediaClassName}
            src={fusion}
            alt={fusionLabel}
            onError={() => setFailedImages((current) => ({ ...current, fusion: true }))}
          />
        </button>
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
        {!failed && !fusion && hasEnvironmentImage ? (
          <button
            className="secondary-action result-action-button"
            type="button"
            onClick={onGenerateFusion}
            disabled={isAttachingPhoto}
          >
            <ImagePlus aria-hidden="true" size={16} />
            {isAttachingPhoto ? busyLabel : generateFusionLabel}
          </button>
        ) : null}
        {!failed && (Boolean(fusion) || (!fusion && !hasEnvironmentImage)) ? (
          <label className="secondary-action result-upload-action" tabIndex={0} onKeyDown={openNestedFileInput}>
            <ImagePlus aria-hidden="true" size={16} />
            {isAttachingPhoto ? busyLabel : uploadPhotoLabel}
            <input
              type="file"
              accept="image/*"
              disabled={isAttachingPhoto}
              aria-label={uploadPhotoLabel}
              tabIndex={-1}
              onInput={onPhotoChange}
              onChange={onPhotoChange}
            />
          </label>
        ) : null}
      </div>
    </>
  );

  return (
    <section className="result-view" ref={resultRef}>
      {onBack && backLabel ? (
        <div className="result-toolbar">
          <button className="back-action" type="button" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={16} />
            {backLabel}
          </button>
        </div>
      ) : null}
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
          {layout === "stacked" && fusionFigure ? (
            <div className="result-grid stacked result-fusion-followup">
              {fusionFigure}
            </div>
          ) : null}
          {layout === "stacked" ? resultActions : null}
        </>
      )}
      {failed || layout === "split" ? resultActions : null}
      {actionError ? <p className="error-line" role="status">{actionError}</p> : null}
      {viewerImage ? (
        <ImageViewer src={viewerImage.src} alt={viewerImage.alt} onClose={() => setViewerImage(null)} />
      ) : null}
    </section>
  );
}
