import { useEffect, useRef, useState } from "react";
import type { GitCommitChange } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

interface CommitDialogProps {
  defaultMessage: string;
  branch: string;
  changes: GitCommitChange[];
  onCommit: (message: string, selectedPaths: string[], push: boolean) => void;
  onCancel: () => void;
}

const STATUS_LABELS: Record<GitCommitChange["status"], string> = {
  modified: "Modified",
  staged: "Staged",
  untracked: "Untracked",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
};

export function CommitDialog({
  defaultMessage,
  branch,
  changes,
  onCommit,
  onCancel,
}: CommitDialogProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [push, setPush] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(() => changes.map((c) => c.path));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    else if (
      e.key === "Enter" &&
      (e.metaKey || e.ctrlKey) &&
      e.target === textareaRef.current &&
      message.trim() &&
      selectedPaths.length > 0
    ) {
      onCommit(message.trim(), selectedPaths, push);
    }
  }

  function togglePath(path: string) {
    setSelectedPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Commit changes"
        className="modal-panel"
        style={{ width: 400, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">Commit changes</p>

        <div className="modal-branch-row">
          <span className="modal-branch-label">Branch</span>
          <code className="modal-badge">{branch}</code>
        </div>

        <div className="modal-branch-row">
          <span className="modal-branch-label">Files</span>
          <div className="modal-inline-actions">
            <button
              type="button"
              className="modal-inline-btn"
              onClick={() => setSelectedPaths(changes.map((change) => change.path))}
            >
              All
            </button>
            <button type="button" className="modal-inline-btn" onClick={() => setSelectedPaths([])}>
              None
            </button>
            <span className="modal-selection-count">
              {selectedPaths.length} of {changes.length} selected
            </span>
          </div>
        </div>

        <ul className="modal-commit-list" aria-label="Changed files">
          {changes.map((change) => {
            const checked = selectedPaths.includes(change.path);
            return (
              <li key={change.path}>
                <label className="modal-commit-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePath(change.path)}
                  />
                  <div className="modal-commit-copy">
                    <span className="modal-commit-path">{change.displayPath}</span>
                    <span className="modal-commit-meta">
                      {STATUS_LABELS[change.status]}
                      {change.staged ? " • already staged" : ""}
                    </span>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <textarea
          ref={textareaRef}
          className="modal-textarea"
          value={message}
          placeholder="Commit message"
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
        />

        <label className="modal-checkbox-label">
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
            disabled={!message.trim() || selectedPaths.length === 0}
            onClick={() => message.trim() && onCommit(message.trim(), selectedPaths, push)}
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
