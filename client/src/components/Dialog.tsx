import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
  onClose: () => void;
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export default function Dialog({
  title,
  closeLabel,
  children,
  footer,
  className,
  bodyClassName,
  footerClassName,
  onClose
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("dialog-open");
    closeButtonRef.current?.focus();
    return () => {
      document.body.classList.remove("dialog-open");
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    ) ?? []).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-layer shared-dialog-layer">
      <section
        className={classes("shared-dialog", className)}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <header className="shared-dialog-header dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label={closeLabel}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className={classes("shared-dialog-body", bodyClassName)}>{children}</div>
        {footer ? (
          <footer className={classes("shared-dialog-footer", footerClassName)}>{footer}</footer>
        ) : null}
      </section>
    </div>
  );
}
