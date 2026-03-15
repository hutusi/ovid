import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

interface LinkDialogProps {
  initialHref: string;
  onApply: (url: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

export function LinkDialog({ initialHref, onApply, onRemove, onCancel }: LinkDialogProps) {
  const [url, setUrl] = useState(initialHref);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  // useFocusTrap focuses the first focusable element; also select the text.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && e.target === inputRef.current && url.trim()) {
      e.stopPropagation();
      onApply(url.trim());
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Insert link"
        className="modal-panel"
        style={{ width: 360, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleDialogKeyDown}
      >
        <p className="modal-title">Insert link</p>

        <input
          ref={inputRef}
          className="modal-input"
          type="url"
          aria-label="URL"
          value={url}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
        />

        <div className="modal-actions">
          {initialHref && (
            <button type="button" className="modal-btn modal-btn-danger" onClick={onRemove}>
              Remove
            </button>
          )}
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={!url.trim()}
            onClick={() => url.trim() && onApply(url.trim())}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
