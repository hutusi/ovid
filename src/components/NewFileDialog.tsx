import { useEffect, useRef, useState } from "react";
import type { ContentType } from "../lib/types";
import "./InputModal.css";

interface NewFileDialogProps {
  contentTypes: ContentType[];
  onConfirm: (filename: string, contentType?: string) => void;
  onCancel: () => void;
}

export function NewFileDialog({ contentTypes, onConfirm, onCancel }: NewFileDialogProps) {
  const [filename, setFilename] = useState("");
  const [selectedType, setSelectedType] = useState<string>(contentTypes[0]?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleConfirm() {
    const name = filename.trim();
    if (!name) return;
    onConfirm(name, contentTypes.length > 0 ? selectedType : undefined);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && filename.trim()) handleConfirm();
    else if (e.key === "Escape") onCancel();
  }

  function handleModalKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = [inputRef.current, cancelRef.current, confirmRef.current].filter(
      (el): el is HTMLInputElement | HTMLButtonElement => el !== null
    );
    const idx = focusable.indexOf(document.activeElement as HTMLInputElement | HTMLButtonElement);
    e.preventDefault();
    const next = e.shiftKey
      ? (idx - 1 + focusable.length) % focusable.length
      : (idx + 1) % focusable.length;
    focusable[next]?.focus();
  }

  return (
    <div className="modal-overlay">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close modal"
        onClick={onCancel}
      />
      <div role="dialog" aria-modal="true" className="modal" onKeyDown={handleModalKeyDown}>
        <p className="modal-title">New file</p>
        <input
          ref={inputRef}
          className="modal-input"
          value={filename}
          placeholder="filename"
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {contentTypes.length > 0 && (
          <div className="modal-type-row">
            <span className="modal-type-label">Type</span>
            <select
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
