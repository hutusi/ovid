import "./EmptyState.css";

const isMac = navigator.platform.startsWith("Mac") || navigator.userAgent.includes("Mac");
const modKey = isMac ? "⌘" : "Ctrl+";

interface EmptyStateProps {
  workspaceOpen: boolean;
  onOpenWorkspace: () => void;
}

export function EmptyState({ workspaceOpen, onOpenWorkspace }: EmptyStateProps) {
  if (workspaceOpen) {
    return (
      <div className="empty-state">
        <p className="empty-state-hint">Select a file to start writing</p>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <h2 className="empty-state-title">Ovid</h2>
      <p className="empty-state-hint">A writing space for Amytis content</p>
      <button type="button" className="empty-state-btn" onClick={onOpenWorkspace}>
        Open workspace
      </button>
      <p className="empty-state-shortcut">{modKey}O to open a folder</p>
    </div>
  );
}
