import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import { Modal, ModalActions } from "./Modal";

interface NewFileDialogProps {
  initialFilename?: string;
  title?: string;
  confirmLabel?: string;
  onConfirm: (filename: string) => void;
  onCancel: () => void;
}

export function NewFileDialog({
  initialFilename = "",
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: NewFileDialogProps) {
  const { t } = useTranslation();
  const [filename, setFilename] = useState(initialFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (!initialFilename) return;
    const dot = initialFilename.lastIndexOf(".");
    const end = dot > 0 ? dot : initialFilename.length;
    input.setSelectionRange(0, end);
  }, [initialFilename]);

  function handleConfirm() {
    const name = filename.trim();
    if (!name) return;
    onConfirm(name);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.target === inputRef.current && filename.trim()) {
      e.preventDefault();
      handleConfirm();
    }
  }

  const dialogTitle = title ?? t("new_file_dialog.title_new_file");

  return (
    <Modal ariaLabel={dialogTitle} onClose={onCancel} width={380} onKeyDown={handleKeyDown}>
      <p className="modal-title">{dialogTitle}</p>

      <input
        ref={inputRef}
        className="modal-input"
        aria-label={t("new_file_dialog.file_name_label")}
        value={filename}
        placeholder={t("new_file_dialog.file_name_placeholder")}
        {...PLAIN_TEXT_INPUT_PROPS}
        onChange={(e) => setFilename(e.target.value)}
      />

      <ModalActions
        cancelLabel={t("new_file_dialog.cancel")}
        confirmLabel={confirmLabel ?? t("new_file_dialog.create")}
        onCancel={onCancel}
        onConfirm={handleConfirm}
        confirmDisabled={!filename.trim()}
      />
    </Modal>
  );
}
