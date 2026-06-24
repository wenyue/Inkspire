import { useEffect, useState } from "react";
import type { GenerationRecord } from "../api";
import { resultLayoutForWidth } from "../domain";

interface ResultViewProps {
  record: GenerationRecord;
  artworkLabel: string;
  fusionLabel: string;
  makeLabel: string;
  continueLabel: string;
  failedTitle: string;
  failedHint: string;
  onMake: () => void;
  onContinue: () => void;
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
  failedTitle,
  failedHint,
  onMake,
  onContinue
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
        <button className="secondary-action" type="button" onClick={onContinue}>
          {continueLabel}
        </button>
        {!failed ? (
          <button className="primary-action" type="button" onClick={onMake}>
            {makeLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
