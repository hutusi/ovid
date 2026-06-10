import { useTranslation } from "react-i18next";
import { Modal, ModalActions } from "./Modal";

interface DeleteBranchDialogProps {
  branch: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteBranchDialog({ branch, onConfirm, onCancel }: DeleteBranchDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal ariaLabel={t("delete_branch_dialog.title")} onClose={onCancel} width={380}>
      <p className="modal-title">{t("delete_branch_dialog.title")}</p>
      <p className="modal-copy">{t("delete_branch_dialog.confirm", { branch })}</p>

      <ModalActions
        cancelLabel={t("delete_branch_dialog.cancel")}
        confirmLabel={t("delete_branch_dialog.delete")}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}
