import { useState } from "react";
import type { Expert } from "../api";
import type { Locale } from "../domain";

interface ExpertsProps {
  experts: Expert[];
  title: string;
  locale: Locale;
  serviceHeading: string;
  extraServiceName: string;
  extraServiceDescription: string;
  credentialsLabel: string;
  sampleHeading: string;
  sampleHint: string;
  profileNotice: string;
  serviceBoundary: string;
  consultLabel?: string;
  consultHint?: string;
  copiedLabel?: string;
  consultWechat?: string;
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
  credentialsLabel,
  sampleHeading,
  sampleHint,
  profileNotice,
  serviceBoundary,
  consultLabel,
  consultHint,
  copiedLabel,
  consultWechat
}: ExpertsProps) {
  const [copiedExpertId, setCopiedExpertId] = useState("");

  const copyConsultContact = async (expertId: string) => {
    if (!consultWechat) return;
    try {
      await navigator.clipboard?.writeText(consultWechat);
      if (navigator.clipboard) {
        setCopiedExpertId(expertId);
        return;
      }
    } catch {}
    const copyField = document.createElement("textarea");
    copyField.value = consultWechat;
    copyField.setAttribute("readonly", "");
    copyField.style.position = "fixed";
    copyField.style.opacity = "0";
    document.body.appendChild(copyField);
    copyField.select();
    const copied = typeof document.execCommand === "function" && document.execCommand("copy");
    copyField.remove();
    if (copied) setCopiedExpertId(expertId);
  };

  return (
    <section className="experts-panel" aria-labelledby="experts-heading">
      <h2 id="experts-heading">{title}</h2>
      {experts.map((expert) => (
        <article className="expert-card" key={expert.id}>
          <div className="expert-profile">
            <div className="expert-avatar" aria-hidden="true">{localizedText(expert.name, locale).slice(0, 1)}</div>
            <div>
              <h3>{localizedText(expert.name, locale)}</h3>
              <p>{localizedText(expert.region, locale)}</p>
            </div>
          </div>
          <p className="expert-bio">{localizedText(expert.bio, locale)}</p>
          {expert.credentials?.length ? (
            <div className="expert-credentials" aria-label={credentialsLabel}>
              {expert.credentials.map((credential) => {
                const label = localizedText(credential, locale);
                return <span key={label}>{label}</span>;
              })}
            </div>
          ) : null}
          <p className="expert-profile-notice">{profileNotice}</p>
          {expert.sampleImages?.length ? (
            <div className="expert-samples">
              <div className="expert-sample-heading">
                <strong>{sampleHeading}</strong>
                {expert.sampleImages.length > 2 ? <span className="expert-sample-hint">{sampleHint}</span> : null}
              </div>
              <div className="expert-sample-strip" role="list" aria-label={sampleHeading}>
                {expert.sampleImages.map((image, index) => (
                  <span
                    className="expert-sample-frame"
                    role="listitem"
                    aria-label={`${sampleHeading} ${index + 1}`}
                    key={image}
                  >
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
          {consultLabel && consultWechat ? (
            <div className="expert-consult">
              {consultHint ? <p>{consultHint}</p> : null}
              <button className="primary-action" type="button" onClick={() => copyConsultContact(expert.id)}>
                {consultLabel}
              </button>
              {copiedExpertId === expert.id && copiedLabel ? <span role="status">{copiedLabel}</span> : null}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
