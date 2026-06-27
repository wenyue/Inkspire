import { RotateCcw } from "lucide-react";
import type { GenerationOperation, OriginTab } from "../api";
import type { Locale } from "../domain";
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
  onRetry
}: GeneratingViewProps) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const phase = generationPhase(operation, elapsedSeconds);
  const failed = status === "failed";
  const copyKey = `generationLoading.${operation}.${phase.labelKey}`;

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
        <h2>{failed ? t("generationLoading.failedTitle") : t(copyKey)}</h2>
        <p>{failed ? error || t("generationLoading.failedHint") : t("generationLoading.estimate")}</p>
      </div>
      {failed && onRetry ? (
        <button className="primary-action compact-action generating-retry-action" type="button" onClick={onRetry}>
          <RotateCcw aria-hidden="true" size={16} />
          <span>{t("generationLoading.retry")}</span>
        </button>
      ) : null}
    </section>
  );
}
