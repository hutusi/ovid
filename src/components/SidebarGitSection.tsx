import { getGitSyncDescription, getGitSyncLabel, getRemoteSummary } from "../lib/gitUi";
import type { GitRemoteInfo } from "../lib/types";

interface SidebarGitSectionProps {
  branch: string;
  remoteInfo: GitRemoteInfo;
  onCommit: () => void;
  onPush: () => void;
  onPull: () => void;
  onFetch: () => void;
  onOpenRemote: () => void;
  onCopyRemoteUrl: () => void;
}

export function SidebarGitSection({
  branch,
  remoteInfo,
  onCommit,
  onPush,
  onPull,
  onFetch,
  onOpenRemote,
  onCopyRemoteUrl,
}: SidebarGitSectionProps) {
  const syncLabel = getGitSyncLabel(remoteInfo);
  const remoteSummary = getRemoteSummary(remoteInfo);
  const syncDescription = getGitSyncDescription(remoteInfo);

  return (
    <section className="sidebar-git" aria-label="Git actions">
      <div className="sidebar-git-header">
        <span className="sidebar-git-title">Git</span>
        {syncLabel && <span className="sidebar-git-badge">{syncLabel}</span>}
      </div>

      <div className="sidebar-git-meta">
        <div className="sidebar-git-meta-row">
          <span className="sidebar-git-label">Branch</span>
          <code className="sidebar-git-value">{branch}</code>
        </div>
        <div className="sidebar-git-meta-row">
          <span className="sidebar-git-label">Tracking</span>
          <span className="sidebar-git-copy">{remoteSummary}</span>
        </div>
        <p className="sidebar-git-copy">{syncDescription}</p>
      </div>

      <div className="sidebar-git-actions">
        <button type="button" className="sidebar-git-btn" onClick={onCommit}>
          Commit
        </button>
        <button type="button" className="sidebar-git-btn" onClick={onPush}>
          Push
        </button>
        <button type="button" className="sidebar-git-btn" onClick={onPull}>
          Pull
        </button>
        <button type="button" className="sidebar-git-btn" onClick={onFetch}>
          Fetch
        </button>
      </div>

      {remoteInfo.remoteUrl && (
        <div className="sidebar-git-links">
          <button type="button" className="sidebar-git-link" onClick={onOpenRemote}>
            Open remote
          </button>
          <button type="button" className="sidebar-git-link" onClick={onCopyRemoteUrl}>
            Copy URL
          </button>
        </div>
      )}
    </section>
  );
}
