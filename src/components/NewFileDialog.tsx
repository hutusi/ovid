import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContentType } from "../lib/types";
import "./NewFileDialog.css";

interface NewFileDialogProps {
  contentTypes: ContentType[];
  preselectedType?: string;
  initialFilename?: string;
  title?: string;
  confirmLabel?: string;
  showTypeSelector?: boolean;
  onConfirm: (filename: string, contentType?: string) => void;
  onCancel: () => void;
}

export function NewFileDialog({
  contentTypes,
  preselectedType,
  initialFilename = "",
  title,
  confirmLabel,
  showTypeSelector = true,
  onConfirm,
  onCancel,
}: NewFileDialogProps) {
  const { t } = useTranslation();
  const [filename, setFilename] = useState(initialFilename);
  const [selectedType, setSelectedType] = useState<string>(contentTypes[0]?.name ?? "");
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

  useEffect(() => {
    if (
      !preselectedType &&
      contentTypes.length > 0 &&
      !contentTypes.some((ct) => ct.name === selectedType)
    ) {
      setSelectedType(contentTypes[0].name);
    }
  }, [contentTypes, selectedType, preselectedType]);

  function handleConfirm() {
    const name = filename.trim();
    if (!name) return;
    const type = preselectedType ?? (contentTypes.length > 0 ? selectedType : undefined);
    onConfirm(name, type);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && filename.trim()) handleConfirm();
    else if (e.key === "Escape") onCancel();
  }

  const dialogTitle =
    title ??
    (preselectedType
      ? t("new_file_dialog.title_new_type", {
          type: preselectedType.charAt(0).toUpperCase() + preselectedType.slice(1),
        })
      : t("new_file_dialog.title_new_file"));

  return (
    <div className="nfd-overlay" role="presentation">
      <button type="button" className="nfd-backdrop" aria-label="Close" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-label={dialogTitle} className="nfd-panel">
        <p className="nfd-title">{dialogTitle}</p>

        <input
          ref={inputRef}
          className="nfd-input"
          aria-label={t("new_file_dialog.file_name_label")}
          value={filename}
          placeholder={t("new_file_dialog.file_name_placeholder")}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {showTypeSelector && !preselectedType && contentTypes.length > 0 && (
          <div className="nfd-type-section">
            <span className="nfd-type-label">{t("new_file_dialog.type_label")}</span>
            <div className="nfd-type-chips">
              {contentTypes.map((ct) => (
                <button
                  key={ct.name}
                  type="button"
                  aria-pressed={selectedType === ct.name}
                  onClick={() => setSelectedType(ct.name)}
                  className={`nfd-chip${selectedType === ct.name ? " active" : ""}`}
                >
                  {ct.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
