import "./EmptyState.css";

const isMac = navigator.platform.startsWith("Mac") || navigator.userAgent.includes("Mac");
const modKey = isMac ? "⌘" : "Ctrl+";

interface RecentFile {
  path: string;
  name: string;
  title?: string;
}

interface EmptyStateProps {
  workspaceOpen: boolean;
  recentFiles: RecentFile[];
  onOpenWorkspace: () => void;
  onOpenRecent: (path: string) => void;
}

export function EmptyState({
  workspaceOpen,
  recentFiles,
  onOpenWorkspace,
  onOpenRecent,
}: EmptyStateProps) {
  if (workspaceOpen) {
    return (
      <div className="empty-state">
        <p className="empty-state-hint">Select a file to start writing</p>
        {recentFiles.length > 0 && (
          <div className="empty-state-recents">
            <p className="empty-state-recents-label">Recent</p>
            <ul className="empty-state-recents-list">
              {recentFiles.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className="empty-state-recent-btn"
                    onClick={() => onOpenRecent(f.path)}
                  >
                    {f.title || f.name.replace(/\.mdx?$/, "")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
