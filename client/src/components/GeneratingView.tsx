import { RotateCcw } from "lucide-react";
import type { GenerationOperation, OriginTab } from "../api";
import type { Locale } from "../domain";
import type { GenerationFailureKind } from "../generationFailure";
import { generationPhase, loadingImageIndex, type GenerationSessionStatus } from "../generationSession";

const IMAGE_COUNT = 4;

interface GeneratingViewProps {
  originTab: OriginTab;
  operation: GenerationOperation;
  jobId: string;
  startedAt: number;
  status: GenerationSessionStatus;
  error?: string;
  locale: Locale;
  t: (key: string) => string;
  onRetry?: () => void;
  failureKind?: GenerationFailureKind;
  onSelectClassic?: () => void;
  recoveryError?: string;
  expectsPreviewGeneration?: boolean;
}

function loadingImagePath(operation: GenerationOperation, stage: string, jobId: string): string {
  const index = loadingImageIndex(jobId, operation, stage, IMAGE_COUNT) + 1;
  return `/loading/${operation}-${stage}-${index}.webp`;
}

export default function GeneratingView({
  originTab,
  operation,
  jobId,
  startedAt,
  status,
  error,
  locale,
  t,
  onRetry,
  failureKind,
  onSelectClassic,
  recoveryError,
  expectsPreviewGeneration = false
}: GeneratingViewProps) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const phase = generationPhase(operation, elapsedSeconds);
  const failed = status === "failed";
  const copyKey = `generationLoading.${operation}.${phase.labelKey}`;
  const estimateKey = expectsPreviewGeneration
    ? "generationLoading.estimate.double"
    : "generationLoading.estimate.single";
  const classicReferenceUnavailable = failed && failureKind === "classic_reference_unavailable";
  const calligraphyNeedsReview = failed && failureKind === "calligraphy_text_unverified";
  const failureTitle = classicReferenceUnavailable
    ? t("generationFailure.classicReference.title")
    : calligraphyNeedsReview
      ? t("generationFailure.calligraphyReview.title")
      : t("generationLoading.failedTitle");
  const failureHint = classicReferenceUnavailable
    ? t("generationFailure.classicReference.hint")
    : calligraphyNeedsReview
      ? t("generationFailure.calligraphyReview.hint")
      : error || t("generationLoading.failedHint");

  return (
    <section
      className="generating-view"
      aria-live="polite"
      aria-busy={status === "running"}
      data-origin-tab={originTab}
      lang={locale}
    >
      <div className="generating-visual">
        <img src={loadingImagePath(operation, phase.imageStage, jobId)} alt="" aria-hidden="true" />
      </div>
      <div className="generating-copy">
        <h2>{failed ? failureTitle : t(copyKey)}</h2>
        <p>{failed ? failureHint : t(estimateKey)}</p>
        {!failed ? <p>{t("generationLoading.backgroundContinuation")}</p> : null}
        {calligraphyNeedsReview ? <p className="generation-review-status">{t("generationFailure.calligraphyReview.status")}</p> : null}
      </div>
      {recoveryError ? <p className="error-line" role="status">{recoveryError}</p> : null}
      {classicReferenceUnavailable && onSelectClassic ? (
        <button className="primary-action compact-action generating-retry-action" type="button" onClick={onSelectClassic}>
          <span>{t("generationFailure.classicReference.action")}</span>
        </button>
      ) : failed && onRetry ? (
        <button className="primary-action compact-action generating-retry-action" type="button" onClick={onRetry}>
          <RotateCcw aria-hidden="true" size={16} />
          <span>{calligraphyNeedsReview ? t("generationFailure.calligraphyReview.action") : t("generationLoading.retry")}</span>
        </button>
      ) : null}
    </section>
  );
}
