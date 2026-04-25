import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

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
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();
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
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && e.target === inputRef.current) {
      e.preventDefault();
      handleConfirm();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rename path"
        className="modal-panel"
        style={{ width: 420, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">Rename path</p>

        <div className="modal-branch-row">
          <span className="modal-branch-label">Current</span>
          <code className="modal-badge">{currentPath}</code>
        </div>

        <div className="modal-path-input-row">
          <input
            ref={inputRef}
            className="modal-input"
            aria-label="Path name"
            value={name}
            placeholder="post-name"
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
          <span className="modal-branch-label">Result</span>
          <code className="modal-badge">
            {trimmedName ? `${trimmedName}${suffix}` : `—${suffix}`}
          </code>
        </div>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={isUnchanged}
            onClick={handleConfirm}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
