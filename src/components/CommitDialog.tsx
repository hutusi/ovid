import { useEffect, useRef, useState } from "react";
import "./Modal.css";

interface CommitDialogProps {
  defaultMessage: string;
  branch: string;
  onCommit: (message: string, push: boolean) => void;
  onCancel: () => void;
}

export function CommitDialog({ defaultMessage, branch, onCommit, onCancel }: CommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [push, setPush] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && message.trim()) {
      onCommit(message.trim(), push);
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Commit changes"
        className="modal-panel"
        style={{ width: 400, maxWidth: "calc(100vw - 48px)" }}
      >
        <p className="modal-title">Commit changes</p>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "var(--color-text-muted)", flexShrink: 0 }}>
            Branch
          </span>
          <code
            style={{
              fontSize: 11.5,
              color: "var(--color-text-muted)",
              background: "var(--color-bg-sidebar)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            {branch}
          </code>
        </div>

        <textarea
          ref={textareaRef}
          className="modal-textarea"
          value={message}
          placeholder="Commit message"
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
          Push after commit
        </label>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={!message.trim()}
            onClick={() => message.trim() && onCommit(message.trim(), push)}
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
