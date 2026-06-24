import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getProductionEstimate, type Expert, type ProductionEstimate } from "../api";
import type { Locale } from "../domain";

interface ProductionDialogProps {
  expert: Expert;
  locale: Locale;
  recordId: string;
  title: string;
  closeLabel: string;
  estimateLabel: string;
  contactLabel: string;
  confirmLabel: string;
  contactPendingLabel: string;
  onClose: () => void;
}

export default function ProductionDialog({
  expert,
  locale,
  recordId,
  title,
  closeLabel,
  estimateLabel,
  contactLabel,
  confirmLabel,
  contactPendingLabel,
  onClose
}: ProductionDialogProps) {
  const [selectedService, setSelectedService] = useState(expert.services[0]?.id ?? "");
  const [estimate, setEstimate] = useState<ProductionEstimate | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    getProductionEstimate(recordId, expert.id)
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [expert.id, recordId]);

  return (
    <div className="dialog-layer">
      <section className="production-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-heading">
          <div>
            <p>{expert.name}</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="service-list" role="radiogroup" aria-label={title}>
          {expert.services.map((service) => {
            const serviceEstimate = estimate?.estimates[service.id];
            return (
              <button
                key={service.id}
                type="button"
                className={selectedService === service.id ? "service-card selected" : "service-card"}
                onClick={() => {
                  setSelectedService(service.id);
                  setConfirmed(false);
                }}
              >
                <strong>{service.name[locale] ?? service.name["zh-Hans"]}</strong>
                <span>{service.description[locale] ?? service.description["zh-Hans"]}</span>
                <em>
                  {estimateLabel}: {serviceEstimate?.amount ?? service.priceEstimate.base}{" "}
                  {serviceEstimate?.currency ?? service.priceEstimate.currency}
                </em>
              </button>
            );
          })}
        </div>

        {confirmed ? (
          <div className="contact-panel">
            <strong>{contactLabel}</strong>
            {expert.phone ? <span>电话：{expert.phone}</span> : null}
            {expert.wechat ? <span>微信：{expert.wechat}</span> : null}
            {!expert.phone && !expert.wechat ? <span>{contactPendingLabel}</span> : null}
          </div>
        ) : (
          <button className="primary-action" type="button" onClick={() => setConfirmed(Boolean(selectedService))}>
            {confirmLabel}
          </button>
        )}
      </section>
    </div>
  );
}
