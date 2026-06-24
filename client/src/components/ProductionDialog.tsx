import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getProductionEstimate, type Expert, type ProductionContact, type ProductionEstimate } from "../api";
import type { Locale } from "../domain";

type ProductionSize = "small" | "medium" | "large";

const SIZE_OPTIONS: Array<{
  id: ProductionSize;
  label: Record<Locale, string>;
  hint: Record<Locale, string>;
}> = [
  {
    id: "small",
    label: { "zh-Hans": "小幅", "zh-Hant": "小幅", en: "Small" },
    hint: { "zh-Hans": "题签、团扇、小装饰", "zh-Hant": "題簽、團扇、小裝飾", en: "Inscription, fan, small accent" }
  },
  {
    id: "medium",
    label: { "zh-Hans": "中幅", "zh-Hant": "中幅", en: "Medium" },
    hint: { "zh-Hans": "书房、客厅、礼赠", "zh-Hant": "書房、客廳、禮贈", en: "Study, living room, gift" }
  },
  {
    id: "large",
    label: { "zh-Hans": "大幅", "zh-Hant": "大幅", en: "Large" },
    hint: { "zh-Hans": "厅堂主景、重点陈设", "zh-Hant": "廳堂主景、重點陳設", en: "Feature wall, main display" }
  }
];

interface ProductionDialogProps {
  expert: Expert;
  supportContact?: ProductionContact;
  locale: Locale;
  recordId: string;
  title: string;
  closeLabel: string;
  sizeLabel: string;
  estimateLabel: string;
  contactLabel: string;
  phoneLabel: string;
  wechatLabel: string;
  confirmLabel: string;
  contactPendingLabel: string;
  onClose: () => void;
}

export default function ProductionDialog({
  expert,
  supportContact,
  locale,
  recordId,
  title,
  closeLabel,
  sizeLabel,
  estimateLabel,
  contactLabel,
  phoneLabel,
  wechatLabel,
  confirmLabel,
  contactPendingLabel,
  onClose
}: ProductionDialogProps) {
  const [selectedService, setSelectedService] = useState(expert.services[0]?.id ?? "");
  const [selectedSize, setSelectedSize] = useState<ProductionSize>("medium");
  const [estimate, setEstimate] = useState<ProductionEstimate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const contact = {
    phone: expert.phone || supportContact?.phone || "",
    wechat: expert.wechat || supportContact?.wechat || ""
  };

  useEffect(() => {
    getProductionEstimate(recordId, expert.id, selectedSize)
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [expert.id, recordId, selectedSize]);

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

        <div className="size-section">
          <p>{sizeLabel}</p>
          <div className="size-list" role="radiogroup" aria-label={sizeLabel}>
            {SIZE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selectedSize === option.id}
                className={selectedSize === option.id ? "size-chip selected" : "size-chip"}
                onClick={() => {
                  setSelectedSize(option.id);
                  setConfirmed(false);
                }}
              >
                <strong>{option.label[locale] ?? option.label["zh-Hans"]}</strong>
                <span>{option.hint[locale] ?? option.hint["zh-Hans"]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="service-list" role="radiogroup" aria-label={title}>
          {expert.services.map((service) => {
            const serviceEstimate = estimate?.estimates[service.id];
            return (
              <button
                key={service.id}
                type="button"
                role="radio"
                aria-checked={selectedService === service.id}
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
            {contact.phone ? <span>{phoneLabel}{contact.phone}</span> : null}
            {contact.wechat ? <span>{wechatLabel}{contact.wechat}</span> : null}
            {!contact.phone && !contact.wechat ? <span>{contactPendingLabel}</span> : null}
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
