import type React from "react";
import { useEffect, useRef } from "react";
import { commands } from "./commands";
import type { FileNode, SaveStatus } from "./types";
import { getExternalWorkspaceChangeAction } from "./workspaceRefresh";

export const WORKSPACE_REVISION_FALLBACK_MS = 30_000;
export const WORKSPACE_EVENT_DEBOUNCE_MS = 250;

interface UseWorkspaceChangeMonitorOptions {
  workspaceRootPath: string | null;
  refreshTree: () => Promise<FileNode[]>;
  reloadSelectedFileFromDisk: (node: FileNode) => Promise<boolean>;
  handleCloseFile: (opts?: { discard?: boolean }) => Promise<boolean>;
  refreshGitStatus: () => void;
  showToast: (message: string) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  lastSavedContentRef: React.RefObject<string | null>;
  selectedFileRef: React.RefObject<FileNode | null>;
  saveStatusRef: React.RefObject<SaveStatus>;
  isGitRepoRef: React.RefObject<boolean>;
}

export function useWorkspaceChangeMonitor({
  workspaceRootPath,
  refreshTree,
  reloadSelectedFileFromDisk,
  handleCloseFile,
  refreshGitStatus,
  showToast,
  t,
  lastSavedContentRef,
  selectedFileRef,
  saveStatusRef,
  isGitRepoRef,
}: UseWorkspaceChangeMonitorOptions): void {
  const workspaceRevisionRef = useRef<string | null>(null);
  const workspaceRefreshFailureToastRef = useRef<string | null>(null);
  const externalUnsavedToastRevisionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceRootPath) {
      workspaceRevisionRef.current = null;
      workspaceRefreshFailureToastRef.current = null;
      return;
    }

    let mounted = true;
    let refreshInFlight = false;
    let refreshQueued = false;
    let eventTimer: number | null = null;
    let pendingEventPaths = new Set<string>();
    let pendingEventNeedsRescan = false;

    async function refreshForExternalChanges(eventHint?: {
      paths: string[];
      needsRescan: boolean;
    }) {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;

      try {
        // Atomic saves surface as a native event for the active Markdown file.
        // If that is the entire event burst and disk already equals the content
        // we just saved, acknowledge it without hashing/re-walking the whole
        // workspace. The slow fallback will advance the revision baseline.
        const activePath = selectedFileRef.current?.path;
        if (
          eventHint &&
          !eventHint.needsRescan &&
          eventHint.paths.length > 0 &&
          activePath &&
          lastSavedContentRef.current !== null &&
          eventHint.paths.every((path) => path === activePath)
        ) {
          try {
            const diskContent = await commands.files.read({ path: activePath });
            if (!mounted) return;
            if (diskContent === lastSavedContentRef.current) {
              workspaceRefreshFailureToastRef.current = null;
              return;
            }
          } catch {
            // A vanished or unreadable active file needs normal handling.
          }
        }

        const revision = await commands.workspace.getRevision();
        if (!mounted) return;

        if (workspaceRevisionRef.current === null) {
          workspaceRevisionRef.current = revision;
          workspaceRefreshFailureToastRef.current = null;
          return;
        }

        if (revision === workspaceRevisionRef.current) {
          workspaceRefreshFailureToastRef.current = null;
          return;
        }

        const updatedTree = await refreshTree();
        if (!mounted) return;

        const activeFileAction = getExternalWorkspaceChangeAction({
          activeFile: selectedFileRef.current,
          revision,
          tree: updatedTree,
          saveStatus: saveStatusRef.current,
          lastWarnedRevision: externalUnsavedToastRevisionRef.current,
        });

        // Native events also observe Ovid's own atomic save. Avoid replacing
        // the live document with its serialized Markdown when disk contains
        // exactly the content we most recently wrote.
        if (
          activeFileAction.type === "warn-unsaved" ||
          activeFileAction.type === "reload-active-file"
        ) {
          if (activePath && lastSavedContentRef.current !== null) {
            try {
              const diskContent = await commands.files.read({ path: activePath });
              if (diskContent === lastSavedContentRef.current) {
                workspaceRefreshFailureToastRef.current = null;
                workspaceRevisionRef.current = revision;
                if (isGitRepoRef.current) void refreshGitStatus();
                return;
              }
            } catch {
              // Fall through to normal external-change handling.
            }
          }
        }

        switch (activeFileAction.type) {
          case "warn-unsaved":
            externalUnsavedToastRevisionRef.current = activeFileAction.revision;
            showToast(t("workspace_refresh.changed_with_unsaved"));
            break;
          case "reload-active-file": {
            const reloaded = await reloadSelectedFileFromDisk(activeFileAction.node);
            if (!reloaded) {
              const closeAction = getExternalWorkspaceChangeAction({
                activeFile: selectedFileRef.current,
                revision,
                tree: updatedTree,
                saveStatus: saveStatusRef.current,
                reloadSucceeded: false,
                lastWarnedRevision: externalUnsavedToastRevisionRef.current,
              });
              if (closeAction.type === "close-active-file") {
                await handleCloseFile({ discard: true });
                showToast(t("workspace_refresh.active_file_removed"));
              }
            }
            break;
          }
          case "none":
          case "close-active-file":
            break;
        }

        if (isGitRepoRef.current) void refreshGitStatus();
        workspaceRefreshFailureToastRef.current = null;
        workspaceRevisionRef.current = revision;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (workspaceRefreshFailureToastRef.current !== message) {
          workspaceRefreshFailureToastRef.current = message;
          showToast(t("workspace_refresh.refresh_failed", { message }));
        }
      } finally {
        refreshInFlight = false;
        if (mounted && refreshQueued) {
          refreshQueued = false;
          void refreshForExternalChanges();
        }
      }
    }

    const scheduleEventRefresh = (change: { paths: string[]; needsRescan: boolean }) => {
      if (document.hidden) return;
      for (const path of change.paths) pendingEventPaths.add(path);
      pendingEventNeedsRescan ||= change.needsRescan;
      if (eventTimer !== null) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => {
        eventTimer = null;
        const eventHint = {
          paths: [...pendingEventPaths],
          needsRescan: pendingEventNeedsRescan,
        };
        pendingEventPaths = new Set();
        pendingEventNeedsRescan = false;
        void refreshForExternalChanges(eventHint);
      }, WORKSPACE_EVENT_DEBOUNCE_MS);
    };

    const unlisten = commands.workspace.onFsChange((change) => {
      if (change.workspaceRoot !== workspaceRootPath) return;
      scheduleEventRefresh(change);
    });

    void refreshForExternalChanges();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refreshForExternalChanges();
    }, WORKSPACE_REVISION_FALLBACK_MS);
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      if (eventTimer !== null) {
        window.clearTimeout(eventTimer);
        eventTimer = null;
      }
      pendingEventPaths.clear();
      pendingEventNeedsRescan = false;
      void refreshForExternalChanges();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      unlisten();
      window.clearInterval(interval);
      if (eventTimer !== null) window.clearTimeout(eventTimer);
      pendingEventPaths.clear();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      workspaceRevisionRef.current = null;
      workspaceRefreshFailureToastRef.current = null;
      externalUnsavedToastRevisionRef.current = null;
    };
  }, [
    workspaceRootPath,
    refreshTree,
    reloadSelectedFileFromDisk,
    handleCloseFile,
    refreshGitStatus,
    showToast,
    t,
    lastSavedContentRef,
    selectedFileRef,
    saveStatusRef,
    isGitRepoRef,
  ]);
}
