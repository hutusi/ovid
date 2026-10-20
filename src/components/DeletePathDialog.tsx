import { useTranslation } from "react-i18next";
import { Modal, ModalActions } from "./Modal";

interface DeletePathDialogProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms moving a file or folder to the Trash. Focus starts on Cancel
 *  (the first button), so a stray Enter never deletes. */
export function DeletePathDialog({ name, onConfirm, onCancel }: DeletePathDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal ariaLabel={t("confirm.delete_title")} onClose={onCancel} width={380}>
      <p className="modal-title">{t("confirm.move_to_trash", { name })}</p>
      <p className="modal-copy">{t("confirm.move_to_trash_hint")}</p>

      <ModalActions
        cancelLabel={t("confirm.cancel")}
        confirmLabel={t("confirm.move_to_trash_action")}
        onCancel={onCancel}
        onConfirm={onConfirm}
        danger
      />
    </Modal>
  );
}
