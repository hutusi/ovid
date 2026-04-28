import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

interface NewBranchDialogProps {
  currentBranch: string;
  onConfirm: (branch: string) => void;
  onCancel: () => void;
}

export function NewBranchDialog({ currentBranch, onConfirm, onCancel }: NewBranchDialogProps) {
  const { t } = useTranslation();
  const [branchName, setBranchName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && e.target === inputRef.current && branchName.trim()) {
      e.preventDefault();
      onConfirm(branchName.trim());
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("new_branch_dialog.title")}
        className="modal-panel"
        style={{ width: 380, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("new_branch_dialog.title")}</p>

        <div className="modal-branch-row">
          <span className="modal-branch-label">{t("new_branch_dialog.from")}</span>
          <code className="modal-badge">{currentBranch}</code>
        </div>

        <input
          ref={inputRef}
          className="modal-input"
          aria-label={t("new_branch_dialog.name_label")}
          value={branchName}
          placeholder={t("new_branch_dialog.name_placeholder")}
          onChange={(e) => setBranchName(e.target.value)}
        />

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            {t("new_branch_dialog.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={!branchName.trim()}
            onClick={() => onConfirm(branchName.trim())}
          >
            {t("new_branch_dialog.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
