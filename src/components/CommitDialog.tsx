import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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

export function CommitDialog({
  defaultMessage,
  branch,
  changes,
  onCommit,
  onCancel,
}: CommitDialogProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(defaultMessage);
  const [push, setPush] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(() =>
    changes.map((change) => change.displayPath)
  );
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

  function getStatusLabel(status: GitCommitChange["status"]): string {
    return t(`commit_dialog.${status}`);
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("commit_dialog.title")}
        className="modal-panel"
        style={{ width: 400, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("commit_dialog.title")}</p>

        <div className="modal-branch-row">
          <span className="modal-branch-label">{t("commit_dialog.branch")}</span>
          <code className="modal-badge">{branch}</code>
        </div>

        <div className="modal-branch-row">
          <span className="modal-branch-label">{t("commit_dialog.files")}</span>
          <div className="modal-inline-actions">
            <button
              type="button"
              className="modal-inline-btn"
              onClick={() => setSelectedPaths(changes.map((change) => change.displayPath))}
            >
              {t("commit_dialog.select_all")}
            </button>
            <button type="button" className="modal-inline-btn" onClick={() => setSelectedPaths([])}>
              {t("commit_dialog.select_none")}
            </button>
            <span className="modal-selection-count">
              {t("commit_dialog.selection", {
                selected: selectedPaths.length,
                total: changes.length,
              })}
            </span>
          </div>
        </div>

        <ul className="modal-commit-list" aria-label={t("commit_dialog.changed_files")}>
          {changes.map((change) => {
            const checked = selectedPaths.includes(change.displayPath);
            return (
              <li key={change.path}>
                <label className="modal-commit-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePath(change.displayPath)}
                  />
                  <div className="modal-commit-copy">
                    <span className="modal-commit-path">{change.displayPath}</span>
                    <span className="modal-commit-meta">
                      {getStatusLabel(change.status)}
                      {change.staged ? ` • ${t("commit_dialog.already_staged")}` : ""}
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
          placeholder={t("commit_dialog.message_placeholder")}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
        />

        <label className="modal-checkbox-label">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
          {t("commit_dialog.push_after")}
        </label>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            {t("commit_dialog.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={!message.trim() || selectedPaths.length === 0}
            onClick={() => message.trim() && onCommit(message.trim(), selectedPaths, push)}
          >
            {t("commit_dialog.commit")}
          </button>
        </div>
      </div>
    </div>
  );
}
