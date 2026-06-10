import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import { Modal, ModalActions } from "./Modal";

interface RenameBranchDialogProps {
  branch: string;
  onConfirm: (newBranch: string) => void;
  onCancel: () => void;
}

export function RenameBranchDialog({ branch, onConfirm, onCancel }: RenameBranchDialogProps) {
  const { t } = useTranslation();
  const [branchName, setBranchName] = useState(branch);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (
      e.key === "Enter" &&
      e.target === inputRef.current &&
      branchName.trim() &&
      branchName.trim() !== branch
    ) {
      e.preventDefault();
      onConfirm(branchName.trim());
    }
  }

  return (
    <Modal
      ariaLabel={t("rename_branch_dialog.title")}
      onClose={onCancel}
      width={380}
      onKeyDown={handleKeyDown}
    >
      <p className="modal-title">{t("rename_branch_dialog.title")}</p>

      <div className="modal-branch-row">
        <span className="modal-branch-label">{t("rename_branch_dialog.current")}</span>
        <code className="modal-badge">{branch}</code>
      </div>

      <input
        ref={inputRef}
        className="modal-input"
        aria-label={t("rename_branch_dialog.name_label")}
        value={branchName}
        placeholder={t("rename_branch_dialog.name_placeholder")}
        {...PLAIN_TEXT_INPUT_PROPS}
        onChange={(e) => setBranchName(e.target.value)}
      />

      <ModalActions
        cancelLabel={t("rename_branch_dialog.cancel")}
        confirmLabel={t("rename_branch_dialog.rename")}
        onCancel={onCancel}
        onConfirm={() => onConfirm(branchName.trim())}
        confirmDisabled={!branchName.trim() || branchName.trim() === branch}
      />
    </Modal>
  );
}
