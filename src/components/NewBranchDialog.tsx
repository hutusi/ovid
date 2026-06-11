import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import { Modal, ModalActions } from "./Modal";

interface NewBranchDialogProps {
  currentBranch: string;
  onConfirm: (branch: string) => void;
  onCancel: () => void;
}

export function NewBranchDialog({ currentBranch, onConfirm, onCancel }: NewBranchDialogProps) {
  const { t } = useTranslation();
  const [branchName, setBranchName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.target === inputRef.current && branchName.trim()) {
      e.preventDefault();
      onConfirm(branchName.trim());
    }
  }

  return (
    <Modal
      ariaLabel={t("new_branch_dialog.title")}
      onClose={onCancel}
      width={380}
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
        {...PLAIN_TEXT_INPUT_PROPS}
        onChange={(e) => setBranchName(e.target.value)}
      />

      <ModalActions
        cancelLabel={t("new_branch_dialog.cancel")}
        confirmLabel={t("new_branch_dialog.create")}
        onCancel={onCancel}
        onConfirm={() => onConfirm(branchName.trim())}
        confirmDisabled={!branchName.trim()}
      />
    </Modal>
  );
}
