import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ModalActions } from "./Modal";

interface RenamePathDialogProps {
  currentPath: string;
  currentName: string;
  suffix: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export function RenamePathDialog({
  currentPath,
  currentName,
  suffix,
  onConfirm,
  onCancel,
}: RenamePathDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();
  const isUnchanged = !trimmedName || trimmedName === currentName;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleConfirm() {
    if (isUnchanged) return;
    onConfirm(trimmedName);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.target === inputRef.current) {
      e.preventDefault();
      handleConfirm();
    }
  }

  return (
    <Modal
      ariaLabel={t("rename_path_dialog.title")}
      onClose={onCancel}
      width={420}
      onKeyDown={handleKeyDown}
    >
      <p className="modal-title">{t("rename_path_dialog.title")}</p>

      <div className="modal-branch-row">
        <span className="modal-branch-label">{t("rename_path_dialog.current")}</span>
        <code className="modal-badge">{currentPath}</code>
      </div>

      <div className="modal-path-input-row">
        <input
          ref={inputRef}
          className="modal-input"
          aria-label={t("rename_path_dialog.path_label")}
          value={name}
          placeholder={t("rename_path_dialog.path_placeholder")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="modal-path-suffix" aria-hidden="true">
          {suffix}
        </span>
      </div>

      <div className="modal-branch-row">
        <span className="modal-branch-label">{t("rename_path_dialog.result")}</span>
        <code className="modal-badge">
          {trimmedName ? `${trimmedName}${suffix}` : `—${suffix}`}
        </code>
      </div>

      <ModalActions
        cancelLabel={t("rename_path_dialog.cancel")}
        confirmLabel={t("rename_path_dialog.rename")}
        onCancel={onCancel}
        onConfirm={handleConfirm}
        confirmDisabled={isUnchanged}
      />
    </Modal>
  );
}
