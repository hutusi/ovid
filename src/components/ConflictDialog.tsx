import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface ConflictDialogProps {
  /** Display name of the file that changed on disk. */
  fileName: string;
  /** Discard local edits and load the disk version. */
  onReload: () => void;
  /** Force-write local edits over the disk version. */
  onOverwrite: () => void;
  /** Dismiss without resolving — stays unsaved; a later save re-prompts. */
  onKeepEditing: () => void;
}

/** Shown when a save is refused because the file changed on disk since it was
 *  opened. Escape / backdrop map to "keep editing" (the non-destructive path)
 *  so the user never loses either version by dismissing. */
export function ConflictDialog({
  fileName,
  onReload,
  onOverwrite,
  onKeepEditing,
}: ConflictDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal ariaLabel={t("conflict.title")} onClose={onKeepEditing} width={440}>
      <p className="modal-title">{t("conflict.title")}</p>
      <p className="modal-copy">{t("conflict.body", { name: fileName })}</p>

      <div className="modal-actions">
        <button type="button" className="modal-btn modal-btn-cancel" onClick={onReload}>
          {t("conflict.reload")}
        </button>
        <div className="modal-spacer" />
        <button type="button" className="modal-btn modal-btn-cancel" onClick={onKeepEditing}>
          {t("conflict.keep_editing")}
        </button>
        <button type="button" className="modal-btn modal-btn-primary" onClick={onOverwrite}>
          {t("conflict.overwrite")}
        </button>
      </div>
    </Modal>
  );
}
