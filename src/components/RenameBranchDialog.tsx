import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

interface RenameBranchDialogProps {
  branch: string;
  onConfirm: (newBranch: string) => void;
  onCancel: () => void;
}

export function RenameBranchDialog({ branch, onConfirm, onCancel }: RenameBranchDialogProps) {
  const [branchName, setBranchName] = useState(branch);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && e.target === inputRef.current && branchName.trim()) {
      e.preventDefault();
      onConfirm(branchName.trim());
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rename branch"
        className="modal-panel"
        style={{ width: 380, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">Rename branch</p>

        <div className="modal-branch-row">
          <span className="modal-branch-label">Current</span>
          <code className="modal-badge">{branch}</code>
        </div>

        <input
          ref={inputRef}
          className="modal-input"
          aria-label="New branch name"
          value={branchName}
          placeholder="feature/my-branch"
          onChange={(e) => setBranchName(e.target.value)}
        />

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn modal-btn-primary"
            disabled={!branchName.trim() || branchName.trim() === branch}
            onClick={() => onConfirm(branchName.trim())}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
