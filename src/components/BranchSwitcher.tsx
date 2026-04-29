import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRemoteSummary } from "../lib/gitUi";
import type { GitBranch, GitRemote, GitRemoteBranch, GitRemoteInfo } from "../lib/types";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Modal.css";
import "./WorkspaceSwitcher.css";

interface BranchSwitcherProps {
  branches: GitBranch[];
  remoteBranches: GitRemoteBranch[];
  remoteInfo: GitRemoteInfo;
  onSelect: (branch: string) => void;
  onSelectRemoteBranch: (remoteRef: string) => void;
  onCreateBranch: () => void;
  onRenameBranch: (branch: string) => void;
  onDeleteBranch: (branch: string) => void;
  onPushAndTrack?: (remoteName: string) => void;
  onOpenRemote: (remoteName?: string) => void;
  onCopyRemoteUrl: (remoteName?: string) => void;
  onClose: () => void;
}

export function BranchSwitcher({
  branches,
  remoteBranches,
  remoteInfo,
  onSelect,
  onSelectRemoteBranch,
  onCreateBranch,
  onRenameBranch,
  onDeleteBranch,
  onPushAndTrack,
  onOpenRemote,
  onCopyRemoteUrl,
  onClose,
}: BranchSwitcherProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [actionMenuBranch, setActionMenuBranch] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const actionMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!actionMenuBranch) return;
    queueMicrotask(() => {
      actionMenuItemRefs.current[0]?.focus();
    });
  }, [actionMenuBranch]);

  const filteredBranches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(normalized));
  }, [branches, query]);

  const trackedRemoteRefs = useMemo(
    () =>
      new Set(
        branches
          .map((branch) => branch.upstream)
          .filter((upstream): upstream is string => !!upstream)
      ),
    [branches]
  );

  const filteredRemoteBranches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return remoteBranches.filter((branch) => {
      if (trackedRemoteRefs.has(branch.remoteRef)) {
        return false;
      }
      if (!normalized) return true;
      return (
        branch.name.toLowerCase().includes(normalized) ||
        branch.remoteRef.toLowerCase().includes(normalized)
      );
    });
  }, [query, remoteBranches, trackedRemoteRefs]);

  function getRemoteMeta(remote: GitRemote): string {
    if (remoteInfo.upstream?.startsWith(`${remote.name}/`)) {
      return `${remoteInfo.upstream}${remoteInfo.aheadBehind ? ` ${remoteInfo.aheadBehind}` : ""}`;
    }
    if (remote.name === remoteInfo.remoteName) {
      return t("branch_switcher.preferred_remote");
    }
    return remote.url ?? t("branch_switcher.remote_unavailable");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (actionMenuBranch) {
        setActionMenuBranch(null);
        return;
      }
      onClose();
      return;
    }
    if (e.key !== "Enter" || e.target !== inputRef.current) {
      return;
    }
    if (filteredBranches.length > 0) {
      e.preventDefault();
      onSelect(filteredBranches[0].name);
      return;
    }
    if (filteredRemoteBranches.length > 0) {
      e.preventDefault();
      onSelectRemoteBranch(filteredRemoteBranches[0].remoteRef);
    }
  }

  function handleActionMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = actionMenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => !!item && item.isConnected
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
      items[nextIndex]?.focus();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : 0;
      items[nextIndex]?.focus();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setActionMenuBranch(null);
    }
  }

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("branch_switcher.title")}
        className="modal-panel"
        style={{ width: 420, maxWidth: "calc(100vw - 48px)" }}
        onKeyDown={handleKeyDown}
      >
        <p className="modal-title">{t("branch_switcher.title")}</p>

        {(remoteInfo.upstream || remoteInfo.remotes.length > 0) && (
          <div className="modal-branch-row">
            <span className="modal-branch-label">{t("branch_switcher.tracking")}</span>
            <div className="modal-inline-actions">
              <span className="modal-selection-count">{getRemoteSummary(remoteInfo, t)}</span>
              {!remoteInfo.upstream && remoteInfo.remoteName && onPushAndTrack && (
                <button
                  type="button"
                  className="modal-inline-btn"
                  onClick={() => onPushAndTrack(remoteInfo.remoteName as string)}
                >
                  {t("branch_switcher.push_track")}
                </button>
              )}
              {remoteInfo.remoteUrl && (
                <>
                  <button
                    type="button"
                    className="modal-inline-btn"
                    onClick={() => onOpenRemote(remoteInfo.remoteName ?? undefined)}
                  >
                    {t("branch_switcher.open")}
                  </button>
                  <button
                    type="button"
                    className="modal-inline-btn"
                    onClick={() => onCopyRemoteUrl(remoteInfo.remoteName ?? undefined)}
                  >
                    {t("branch_switcher.copy_url")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {remoteInfo.remotes.length > 1 && (
          <fieldset className="ws-list ws-list--group">
            <legend className="ws-list-legend">{t("branch_switcher.available_remotes")}</legend>
            {remoteInfo.remotes.map((remote) => (
              <div key={remote.name} className="ws-item ws-item--static">
                <span className="ws-item-name">{remote.name}</span>
                <span className="ws-item-path">{getRemoteMeta(remote)}</span>
                <div className="modal-inline-actions ws-inline-actions">
                  {remote.url && (
                    <>
                      <button
                        type="button"
                        className="modal-inline-btn"
                        onClick={() => onOpenRemote(remote.name)}
                      >
                        {t("branch_switcher.open")}
                      </button>
                      <button
                        type="button"
                        className="modal-inline-btn"
                        onClick={() => onCopyRemoteUrl(remote.name)}
                      >
                        {t("branch_switcher.copy_url")}
                      </button>
                    </>
                  )}
                  {!remoteInfo.upstream && onPushAndTrack && (
                    <button
                      type="button"
                      className="modal-inline-btn"
                      onClick={() => onPushAndTrack(remote.name)}
                    >
                      {t("branch_switcher.push_track")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        <input
          ref={inputRef}
          className="modal-input"
          aria-label={t("branch_switcher.search_label")}
          value={query}
          placeholder={t("branch_switcher.search_placeholder")}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="ws-list">
          {filteredBranches.map((branch) => (
            <div
              key={branch.name}
              className={`ws-item ws-item--static${branch.isCurrent ? " ws-item--active" : ""}`}
            >
              <div className="ws-item-header">
                <button
                  type="button"
                  className="ws-item-button"
                  onClick={() => {
                    setActionMenuBranch(null);
                    onSelect(branch.name);
                  }}
                >
                  <span className="ws-item-name">{branch.name}</span>
                  <span className="ws-item-path">
                    {branch.upstream
                      ? `${branch.upstream}${branch.aheadBehind ? ` ${branch.aheadBehind}` : ""}`
                      : t("branch_switcher.no_upstream")}
                  </span>
                </button>
                <div className="ws-item-controls">
                  {branch.isCurrent && (
                    <span className="ws-item-badge ws-item-badge--inline">
                      {t("branch_switcher.current")}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`ws-overflow-btn${actionMenuBranch === branch.name ? " is-open" : ""}`}
                    aria-label={t("branch_switcher.branch_actions", { branch: branch.name })}
                    aria-haspopup="menu"
                    aria-expanded={actionMenuBranch === branch.name}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setActionMenuBranch((current) =>
                        current === branch.name ? null : branch.name
                      );
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </div>
              {actionMenuBranch === branch.name && (
                <div
                  className="ws-actions-menu"
                  role="menu"
                  aria-label={t("branch_switcher.actions_for", { branch: branch.name })}
                  onKeyDown={handleActionMenuKeyDown}
                >
                  <button
                    ref={(node) => {
                      actionMenuItemRefs.current[0] = node;
                    }}
                    type="button"
                    className="ws-actions-menu-btn"
                    role="menuitem"
                    onClick={() => {
                      setActionMenuBranch(null);
                      onRenameBranch(branch.name);
                    }}
                  >
                    {t("branch_switcher.rename")}
                  </button>
                  {!branch.isCurrent && (
                    <button
                      ref={(node) => {
                        actionMenuItemRefs.current[1] = node;
                      }}
                      type="button"
                      className="ws-actions-menu-btn ws-actions-menu-btn--danger"
                      role="menuitem"
                      onClick={() => {
                        setActionMenuBranch(null);
                        onDeleteBranch(branch.name);
                      }}
                    >
                      {t("branch_switcher.delete")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {filteredBranches.length === 0 && filteredRemoteBranches.length === 0 && (
            <p className="ws-empty">{t("branch_switcher.no_match")}</p>
          )}
        </div>

        {filteredRemoteBranches.length > 0 && (
          <>
            <div className="modal-branch-row">
              <span className="modal-branch-label">{t("branch_switcher.remote_branches")}</span>
            </div>
            <fieldset className="ws-list ws-list--group">
              <legend className="ws-list-legend" aria-hidden="true">
                {t("branch_switcher.remote_branches")}
              </legend>
              {filteredRemoteBranches.map((branch) => (
                <button
                  key={branch.remoteRef}
                  type="button"
                  className="ws-item"
                  onClick={() => onSelectRemoteBranch(branch.remoteRef)}
                >
                  <span className="ws-item-name">{branch.name}</span>
                  <span className="ws-item-path">
                    {branch.remoteRef} · {t("branch_switcher.creates_tracking")}
                  </span>
                </button>
              ))}
            </fieldset>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onCreateBranch}>
            {t("branch_switcher.new_branch")}
          </button>
          <div className="modal-spacer" />
          <button type="button" className="modal-btn modal-btn-cancel" onClick={onClose}>
            {t("branch_switcher.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
