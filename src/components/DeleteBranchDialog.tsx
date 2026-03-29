import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";

interface DeleteBranchDialogProps {
  branch: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteBranchDialog({ branch, onConfirm, onCancel }: DeleteBranchDialogProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>();

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button type="button" className="modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Delete branch"
        className="modal-panel"
        style={{ width: 380, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">Delete branch</p>
        <p className="modal-copy">
          Delete <code className="modal-badge">{branch}</code>? This keeps the remote branch
          untouched and uses Git's safe local delete.
        </p>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-btn modal-btn-primary" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
