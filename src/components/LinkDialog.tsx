import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && url.trim()) onApply(url.trim());
    else if (e.key === "Escape") onCancel();
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Insert link"
        className="modal-panel"
        style={{ width: 360, maxWidth: "calc(100vw - 48px)" }}
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
          onKeyDown={handleKeyDown}
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
