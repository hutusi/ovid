import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import { useEffect, useRef } from "react";
import type { FileNode } from "./types";
import { getExternalWorkspaceChangeAction } from "./workspaceRefresh";

const WORKSPACE_REVISION_POLL_MS = 2000;

interface UseWorkspaceRevisionPollOptions {
  workspaceRoot: string | null;
  refreshTree: () => Promise<FileNode[]>;
  reloadSelectedFileFromDisk: (node: FileNode) => Promise<boolean>;
  handleCloseFile: () => Promise<void>;
  refreshGitStatus: () => void;
  showToast: (message: string) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
  lastSavedContentRef: React.RefObject<string | null>;
  selectedFileRef: React.RefObject<FileNode | null>;
  saveStatusRef: React.RefObject<"saved" | "unsaved">;
  isGitRepoRef: React.RefObject<boolean>;
}

export function useWorkspaceRevisionPoll({
  workspaceRoot,
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
}: UseWorkspaceRevisionPollOptions): void {
  const workspaceRevisionRef = useRef<string | null>(null);
  const workspaceRefreshInFlightRef = useRef(false);
  const workspaceRefreshFailureToastRef = useRef<string | null>(null);
  const externalUnsavedToastRevisionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceRoot) {
      workspaceRevisionRef.current = null;
      workspaceRefreshFailureToastRef.current = null;
      return;
    }

    let mounted = true;

    async function refreshForExternalChanges() {
      if (workspaceRefreshInFlightRef.current) return;
      workspaceRefreshInFlightRef.current = true;

      try {
        const revision = await invoke<string>("get_workspace_revision");
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

        // If the revision bump was caused by our own auto-save (disk content matches
        // what we last wrote), skip both the warn toast and the editor reload —
        // reloading would replace the live document with the markdown-serialized
        // version, which strips trailing whitespace and trailing empty paragraphs.
        if (
          activeFileAction.type === "warn-unsaved" ||
          activeFileAction.type === "reload-active-file"
        ) {
          const activePath = selectedFileRef.current?.path;
          if (activePath && lastSavedContentRef.current !== null) {
            try {
              const diskContent = await invoke<string>("read_file", { path: activePath });
              if (diskContent === lastSavedContentRef.current) {
                workspaceRefreshFailureToastRef.current = null;
                workspaceRevisionRef.current = revision;
                if (isGitRepoRef.current) void refreshGitStatus();
                return;
              }
            } catch {
              // Can't read file — fall through to the normal action flow
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
                await handleCloseFile();
                showToast(t("workspace_refresh.active_file_removed"));
              }
            }
            break;
          }
          case "none":
          case "close-active-file":
            break;
        }

        if (isGitRepoRef.current) {
          void refreshGitStatus();
        }

        workspaceRefreshFailureToastRef.current = null;
        workspaceRevisionRef.current = revision;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (workspaceRefreshFailureToastRef.current !== message) {
          workspaceRefreshFailureToastRef.current = message;
          showToast(t("workspace_refresh.refresh_failed", { message }));
        }
        console.error("Failed to refresh workspace changes:", err);
      } finally {
        workspaceRefreshInFlightRef.current = false;
      }
    }

    void refreshForExternalChanges();
    const interval = window.setInterval(refreshForExternalChanges, WORKSPACE_REVISION_POLL_MS);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      workspaceRevisionRef.current = null;
      workspaceRefreshFailureToastRef.current = null;
      externalUnsavedToastRevisionRef.current = null;
    };
  }, [
    workspaceRoot,
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
