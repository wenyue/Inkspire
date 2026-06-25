import type { Expert, GenerationRecord } from "../api";
import type { Locale } from "../domain";

interface ExpertsProps {
  experts: Expert[];
  title: string;
  locale: Locale;
  serviceHeading: string;
  extraServiceName: string;
  extraServiceDescription: string;
  expectationLabel: string;
  sampleHeading: string;
  currentWorkLabel: string;
  currentWorkPreviewLabel: string;
  ctaLabel: string;
  ctaDisabled?: boolean;
  currentRecord?: GenerationRecord | null;
  onCta: () => void;
}

function localizedText(value: Record<string, string>, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function currentRecordImageSrc(record: GenerationRecord): string {
  const kind = record.fusion_path || record.has_fusion ? "fusion" : "artwork";
  return `/api/records/${record.id}/images/${kind}`;
}

function sampleFallback(image: string): string {
  return image.includes("calligraphy") ? "书" : "画";
}

export default function Experts({
  experts,
  title,
  locale,
  serviceHeading,
  extraServiceName,
  extraServiceDescription,
  expectationLabel,
  sampleHeading,
  currentWorkLabel,
  currentWorkPreviewLabel,
  ctaLabel,
  ctaDisabled = false,
  currentRecord,
  onCta
}: ExpertsProps) {
  return (
    <section className="experts-panel">
      <h2>{title}</h2>
      {experts.map((expert) => (
        <article className="expert-card" key={expert.id}>
          <div className="expert-profile">
            <div className="expert-avatar" aria-hidden="true">{expert.name.slice(0, 1)}</div>
            <div>
              <h3>{expert.name}</h3>
              <p>{expert.region}</p>
              {expert.credentials?.length ? (
                <div className="expert-credentials" aria-label={expectationLabel}>
                  {expert.credentials.map((credential) => <span key={credential}>{credential}</span>)}
                </div>
              ) : null}
            </div>
          </div>
          <p>{expert.bio}</p>
          {expert.sampleImages?.length ? (
            <div className="expert-samples">
              <strong>{sampleHeading}</strong>
              <div>
                {expert.sampleImages.slice(0, 3).map((image, index) => (
                  <span className="expert-sample-frame" key={image}>
                    <span className="expert-sample-fallback" aria-hidden="true">{sampleFallback(image)}</span>
                    <img src={image} alt={`${sampleHeading} ${index + 1}`} />
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="expert-conversion">
            <div className="expert-expectation">
              <span>{expectationLabel}</span>
              {expert.phone || expert.wechat ? <span>{expert.phone || expert.wechat}</span> : null}
            </div>
            {currentRecord && currentRecord.status !== "failed" ? (
              <div className="expert-current-work">
                <span>{currentWorkLabel}</span>
                <img src={currentRecordImageSrc(currentRecord)} alt={currentWorkPreviewLabel} />
              </div>
            ) : null}
            <button className="primary-action expert-cta" type="button" onClick={onCta} disabled={ctaDisabled}>
              {ctaLabel}
            </button>
          </div>
          <div className="expert-services">
            <strong>{serviceHeading}</strong>
            <ul>
              {expert.services.map((service) => (
                <li key={service.id}>
                  <span>{localizedText(service.name, locale)}</span>
                  <p>{localizedText(service.description, locale)}</p>
                </li>
              ))}
              <li>
                <span>{extraServiceName}</span>
                <p>{extraServiceDescription}</p>
              </li>
            </ul>
          </div>
        </article>
      ))}
    </section>
  );
}
