import { useRef, useState } from "react";
import { X } from "lucide-react";
import Dialog from "./Dialog";

interface AdjustViewProps {
  title: string;
  intro: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel: string;
  closeLabel: string;
  clearLabel: string;
  suggestions: string[];
  isSubmitting?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (note: string) => void;
}

export default function AdjustView({
  title,
  intro,
  placeholder,
  submitLabel,
  submittingLabel,
  closeLabel,
  clearLabel,
  suggestions,
  isSubmitting = false,
  error = "",
  onClose,
  onSubmit
}: AdjustViewProps) {
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  return (
    <Dialog
      title={title}
      closeLabel={closeLabel}
      className="adjust-dialog"
      bodyClassName="adjust-dialog-body"
      footerClassName="adjust-dialog-footer"
      footer={(
        <>
          <button
            className="primary-action mobile-action-surface"
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit(trimmed)}
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
          {error ? <p className="error-line" role="status">{error}</p> : null}
        </>
      )}
      onClose={onClose}
    >
      <p className="adjust-intro">{intro}</p>
      <div className="adjust-note-shell">
        <textarea
          ref={noteRef}
          className="adjust-note"
          aria-label={title}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
        />
        {note ? (
          <button
            type="button"
            className="adjust-note-clear surface-clear-button"
            aria-label={clearLabel}
            onClick={() => {
              setNote("");
              noteRef.current?.focus();
            }}
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
      <div className="suggestion-row">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setNote(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
