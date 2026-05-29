import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAIN_TEXT_INPUT_PROPS } from "../lib/inputProps";
import "./NewFileDialog.css";

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
    if (e.key === "Enter" && filename.trim()) handleConfirm();
    else if (e.key === "Escape") onCancel();
  }

  const dialogTitle = title ?? t("new_file_dialog.title_new_file");

  return (
    <div className="nfd-overlay" role="presentation">
      <button
        type="button"
        className="nfd-backdrop"
        aria-label={t("common.close")}
        onClick={onCancel}
      />
      <div role="dialog" aria-modal="true" aria-label={dialogTitle} className="nfd-panel">
        <p className="nfd-title">{dialogTitle}</p>

        <input
          ref={inputRef}
          className="nfd-input"
          aria-label={t("new_file_dialog.file_name_label")}
          value={filename}
          placeholder={t("new_file_dialog.file_name_placeholder")}
          {...PLAIN_TEXT_INPUT_PROPS}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="nfd-actions">
          <button type="button" className="nfd-btn nfd-cancel" onClick={onCancel}>
            {t("new_file_dialog.cancel")}
          </button>
          <button
            type="button"
            className="nfd-btn nfd-confirm"
            disabled={!filename.trim()}
            onClick={handleConfirm}
          >
            {confirmLabel ?? t("new_file_dialog.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
