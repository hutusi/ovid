import { useEffect, useRef, useState } from "react";
import "./InputModal.css";
import "./CommitDialog.css";

interface CommitDialogProps {
  defaultMessage: string;
  branch: string;
  onCommit: (message: string, push: boolean) => void;
  onCancel: () => void;
}

export function CommitDialog({ defaultMessage, branch, onCommit, onCancel }: CommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [push, setPush] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && message.trim()) {
      onCommit(message.trim(), push);
    }
  }

  return (
    <div className="modal-overlay">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close modal"
        onClick={onCancel}
      />
      <div role="dialog" aria-modal="true" className="modal commit-modal" onKeyDown={handleKeyDown}>
        <p className="modal-title">Commit changes</p>
        <div className="commit-branch-row">
          <span className="modal-type-label">Branch</span>
          <code className="commit-branch">{branch}</code>
        </div>
        <textarea
          ref={inputRef}
          className="modal-input commit-message"
          value={message}
          placeholder="Commit message"
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
        />
        <label className="commit-push-row">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
          <span className="commit-push-label">Push after commit</span>
        </label>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-confirm"
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
