import { useEffect, useRef, useState } from "react";
import type { ContentType } from "../lib/types";
import "./InputModal.css";

interface NewFileDialogProps {
  contentTypes: ContentType[];
  preselectedType?: string;
  onConfirm: (filename: string, contentType?: string) => void;
  onCancel: () => void;
}

export function NewFileDialog({
  contentTypes,
  preselectedType,
  onConfirm,
  onCancel,
}: NewFileDialogProps) {
  const [filename, setFilename] = useState("");
  const [selectedType, setSelectedType] = useState<string>(contentTypes[0]?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep selectedType in sync if contentTypes arrive after mount
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

  function handleModalKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = [
      inputRef.current,
      preselectedType ? null : selectRef.current,
      cancelRef.current,
      confirmRef.current,
    ].filter((el): el is HTMLInputElement | HTMLSelectElement | HTMLButtonElement => el !== null);
    const idx = focusable.indexOf(
      document.activeElement as HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    );
    e.preventDefault();
    const next = e.shiftKey
      ? (idx - 1 + focusable.length) % focusable.length
      : (idx + 1) % focusable.length;
    focusable[next]?.focus();
  }

  const title = preselectedType
    ? `New ${preselectedType.charAt(0).toUpperCase()}${preselectedType.slice(1)}`
    : "New file";

  return (
    <div className="modal-overlay">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close modal"
        onClick={onCancel}
      />
      <div role="dialog" aria-modal="true" className="modal" onKeyDown={handleModalKeyDown}>
        <p className="modal-title">{title}</p>
        <input
          ref={inputRef}
          className="modal-input"
          value={filename}
          placeholder="filename"
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {!preselectedType && contentTypes.length > 0 && (
          <div className="modal-type-row">
            <label htmlFor="new-file-type" className="modal-type-label">
              Type
            </label>
            <select
              id="new-file-type"
              ref={selectRef}
              className="modal-type-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              {contentTypes.map((ct) => (
                <option key={ct.name} value={ct.name}>
                  {ct.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="modal-btn modal-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="modal-btn modal-confirm"
            disabled={!filename.trim()}
            onClick={handleConfirm}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
