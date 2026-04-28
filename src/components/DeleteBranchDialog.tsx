import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

interface DeleteBranchDialogProps {
  branch: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteBranchDialog({ branch, onConfirm, onCancel }: DeleteBranchDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useFocusTrap<HTMLDivElement>();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("delete_branch_dialog.title")}
        className="modal-panel"
        style={{ width: 380, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("delete_branch_dialog.title")}</p>
        <p className="modal-copy">
          {t("delete_branch_dialog.confirm_before")}
          <code className="modal-badge">{branch}</code>
          {t("delete_branch_dialog.confirm_after")}
        </p>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            {t("delete_branch_dialog.cancel")}
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={onConfirm}>
            {t("delete_branch_dialog.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
