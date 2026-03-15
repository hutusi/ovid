import { useEffect, useRef, useState } from "react";
import "./InputModal.css";
import "./LinkDialog.css";

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
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter" && url.trim()) {
      onApply(url.trim());
    }
  }

  return (
    <div className="modal-overlay">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div role="dialog" aria-modal="true" className="modal link-dialog" onKeyDown={handleKeyDown}>
        <p className="modal-title">Insert link</p>
        <input
          ref={inputRef}
          type="url"
          className="modal-input"
          value={url}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="modal-actions">
          {initialHref && (
            <button type="button" className="modal-btn link-remove-btn" onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className="modal-btn modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-confirm"
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
