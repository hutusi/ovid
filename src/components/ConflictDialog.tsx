import { useTranslation } from "react-i18next";
import type { ConflictResolution, SaveBlock } from "../lib/useFileEditor";
import { Modal } from "./Modal";

interface ConflictDialogProps {
  /** Display name of the file whose save was refused. */
  fileName: string;
  /** Why: it changed on disk since it was opened, or it no longer exists. */
  reason: SaveBlock;
  onResolve: (resolution: ConflictResolution) => void;
}

/** Shown when a save is refused because the file changed on disk since it was
 *  opened, or was deleted / moved by another program. Escape / backdrop map to
 *  "keep editing" (the non-destructive path) so the user never loses either
 *  version by dismissing. */
export function ConflictDialog({ fileName, reason, onResolve }: ConflictDialogProps) {
  const { t } = useTranslation();
  const keepEditing = () => onResolve("dismiss");

  if (reason === "missing") {
    return (
      <Modal ariaLabel={t("conflict.missing_title")} onClose={keepEditing} width={440}>
        <p className="modal-title">{t("conflict.missing_title")}</p>
        <p className="modal-copy">{t("conflict.missing_body", { name: fileName })}</p>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn modal-btn-cancel"
            onClick={() => onResolve("discard")}
          >
            {t("conflict.discard")}
          </button>
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={keepEditing}>
            {t("conflict.keep_editing")}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            onClick={() => onResolve("recreate")}
          >
            {t("conflict.recreate")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal ariaLabel={t("conflict.title")} onClose={keepEditing} width={440}>
      <p className="modal-title">{t("conflict.title")}</p>
      <p className="modal-copy">{t("conflict.body", { name: fileName })}</p>

      <div className="modal-actions">
        <button
          type="button"
          className="modal-btn modal-btn-cancel"
          onClick={() => onResolve("reload")}
        >
          {t("conflict.reload")}
        </button>
        <div className="modal-spacer" />
        <button type="button" className="modal-btn modal-btn-cancel" onClick={keepEditing}>
          {t("conflict.keep_editing")}
        </button>
        <button
          type="button"
          className="modal-btn modal-btn-primary"
          onClick={() => onResolve("overwrite")}
        >
          {t("conflict.overwrite")}
        </button>
      </div>
    </Modal>
  );
}
