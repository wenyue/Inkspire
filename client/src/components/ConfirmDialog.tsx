import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="dialog-layer">
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className="confirm-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} className="primary-action" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
