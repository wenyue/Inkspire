import type { Expert } from "../api";
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
  profileNotice: string;
  serviceBoundary: string;
}

function localizedText(value: string | Record<string, string>, locale: Locale): string {
  if (typeof value === "string") return value;
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
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
  profileNotice,
  serviceBoundary
}: ExpertsProps) {
  return (
    <section className="experts-panel">
      <h2>{title}</h2>
      {experts.map((expert) => (
        <article className="expert-card" key={expert.id}>
          <div className="expert-profile">
            <div className="expert-avatar" aria-hidden="true">{localizedText(expert.name, locale).slice(0, 1)}</div>
            <div>
              <h3>{localizedText(expert.name, locale)}</h3>
              <p>{localizedText(expert.region, locale)}</p>
              <span className="expert-pricing-note">{expectationLabel}</span>
            </div>
          </div>
          <p className="expert-bio">{localizedText(expert.bio, locale)}</p>
          {expert.credentials?.length ? (
            <div className="expert-credentials" aria-label={expectationLabel}>
              {expert.credentials.map((credential) => {
                const label = localizedText(credential, locale);
                return <span key={label}>{label}</span>;
              })}
            </div>
          ) : null}
          <p className="expert-profile-notice">{profileNotice}</p>
          {expert.sampleImages?.length ? (
            <div className="expert-samples">
              <strong>{sampleHeading}</strong>
              <div>
                {expert.sampleImages.slice(0, 3).map((image, index) => (
                  <span className="expert-sample-frame" key={image}>
                    <img src={image} alt={`${sampleHeading} ${index + 1}`} />
                  </span>
                ))}
              </div>
            </div>
          ) : null}
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
          <p className="expert-service-boundary">{serviceBoundary}</p>
        </article>
      ))}
    </section>
  );
}
