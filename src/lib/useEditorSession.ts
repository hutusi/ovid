import { useCallback, useRef } from "react";
import { makeFileNodeFromPath } from "./fileNode";
import type { FlatFile } from "./fileSearch";
import type { FileNode } from "./types";
import { useOpenTabs } from "./useOpenTabs";
import { useRecentFiles } from "./useRecentFiles";

export interface FileEditorHandle {
  selectedFile: FileNode | null;
  selectedPathRef: { current: string | null };
  setSelectedFile: (node: FileNode | null) => void;
  /** Resolves true when the file was read and selected; false when the read
   *  failed or a newer selection superseded it. */
  handleSelectFile: (node: FileNode) => Promise<boolean>;
  handleCloseFile: () => Promise<void>;
}

/**
 * Pure: given the currently-selected file and a path rename, returns the new
 * path the selection should track to (or `null` when the rename doesn't touch
 * the active selection). Handles both the direct case (selected file itself
 * renamed) and the folder case (selected file lives under a renamed folder).
 *
 * Extracted as a pure function so the rename-propagation contract can be
 * tested without rendering the hook.
 */
export function selectionAfterRename(
  selected: FileNode | null,
  oldPath: string,
  newPath: string
): string | null {
  if (!selected) return null;
  if (selected.path === oldPath) return newPath;
  if (selected.path.startsWith(`${oldPath}/`)) {
    return newPath + selected.path.slice(oldPath.length);
  }
  return null;
}

/**
 * Pure: returns true when a file removal should also close the active
 * selection — either because the removed path *is* the selected file, or
 * because the selected file lives under a removed folder.
 */
export function selectionShouldCloseAfterRemove(
  selected: FileNode | null,
  removedPath: string
): boolean {
  if (!selected) return false;
  return selected.path === removedPath || selected.path.startsWith(`${removedPath}/`);
}

interface UseEditorSessionOptions {
  fileEditor: FileEditorHandle;
  workspaceRoot: string | null;
  workspaceRootPath: string | null;
  flatFiles: FlatFile[];
}

/**
 * Owns the answer to "which file is the user editing right now, and what is
 * its history?". Composes `useFileEditor` (passed in to break the dependency
 * cycle with `useWorkspace`), `useOpenTabs`, and `useRecentFiles`, and
 * exposes the integration logic that previously lived as orchestration in
 * `App.tsx` and as cross-hook callbacks (`tabSyncRef`, `onPathRenamed`,
 * `onPathRemoved`).
 *
 * The four invariants this hook enforces:
 * - opening a file selects it and, once the read succeeds, pushes it to
 *   recents and opens its tab (a failed open records nothing)
 * - renaming a file updates its tab, its recents entry, and the selection
 *   (if it was the active file) in lockstep
 * - removing a file closes its tab, drops its recents entry, and closes the
 *   editor if it was the active file
 * - closing the active file advances to a neighbour tab when there is one
 *
 * `useWorkspace.handleRename`/`handleDelete` no longer need to know about
 * tabs, recents, or selection — they call `notifyPathRenamed` /
 * `notifyPathRemoved` and the session updates everything coherently.
 */
export function useEditorSession({
  fileEditor,
  workspaceRoot,
  workspaceRootPath,
  flatFiles,
}: UseEditorSessionOptions) {
  const tabs = useOpenTabs(workspaceRootPath);
  const recents = useRecentFiles(workspaceRoot);

  // Latest flatFiles for closure-stable lookups inside async handlers.
  const flatFilesRef = useRef(flatFiles);
  flatFilesRef.current = flatFiles;

  const lookupNode = useCallback((path: string): FileNode => {
    return (
      flatFilesRef.current.find((f) => f.node.path === path)?.node ?? makeFileNodeFromPath(path)
    );
  }, []);

  /** Make the given node the active file: select it, then push it to recents
   *  and open its tab. Session entries are recorded only after the read
   *  succeeds — a missing or unreadable file must not leave a phantom tab or
   *  recents entry behind. Resolves when the file content has loaded. */
  const openFile = useCallback(
    async (node: FileNode): Promise<void> => {
      if (node.isDirectory) return;
      const opened = await fileEditor.handleSelectFile(node);
      if (!opened) return;
      recents.pushRecent(node);
      tabs.openTab(node.path);
    },
    [fileEditor.handleSelectFile, recents.pushRecent, tabs.openTab]
  );

  /** Open a file by path. Looks up the full FileNode from the flat index;
   *  falls back to a minimal synthetic node when the path is not in the
   *  index (e.g. a recently-deleted file linked from the tab bar history). */
  const openByPath = useCallback(
    (path: string): Promise<void> => openFile(lookupNode(path)),
    [openFile, lookupNode]
  );

  /** Close the active file. When the file has a tab and there's another tab
   *  to fall back to, advance to the neighbour rather than closing the editor
   *  entirely — matches the IDE-style "close tab, surface adjacent" affordance. */
  const closeActive = useCallback(() => {
    const sel = fileEditor.selectedFile;
    if (sel && tabs.tabs.includes(sel.path)) {
      const { neighbor } = tabs.closeTab(sel.path);
      if (neighbor) {
        void openByPath(neighbor);
        return;
      }
    }
    void fileEditor.handleCloseFile();
  }, [fileEditor.selectedFile, fileEditor.handleCloseFile, tabs.tabs, tabs.closeTab, openByPath]);

  /** Called by `useWorkspace.handleRename` / `handleDuplicate` (when the
   *  duplicate replaces the original) after a successful filesystem rename.
   *  Updates tabs, recents, and the active selection so the editor stays
   *  pointed at the same logical file at its new path.
   *
   *  `lookup` is an optional closure scoped to the just-walked workspace
   *  tree. The caller should supply it whenever possible — without it, the
   *  selection-replacement node is resolved against `flatFiles`, which is a
   *  useMemo on tree state and won't have re-computed by the time the
   *  callback fires (same tick as the `setTree` call). The fallback
   *  produces a synthetic node missing `containerDirPath`, `title`, etc. */
  const notifyPathRenamed = useCallback(
    (oldPath: string, newPath: string, lookup?: (path: string) => FileNode | undefined) => {
      tabs.renameTab(oldPath, newPath);
      recents.renameRecent(oldPath, newPath);

      const nextPath = selectionAfterRename(fileEditor.selectedFile, oldPath, newPath);
      if (nextPath) {
        const nextNode = lookup?.(nextPath) ?? lookupNode(nextPath);
        fileEditor.selectedPathRef.current = nextPath;
        fileEditor.setSelectedFile(nextNode);
      }
    },
    [
      tabs.renameTab,
      recents.renameRecent,
      fileEditor.selectedFile,
      fileEditor.setSelectedFile,
      fileEditor.selectedPathRef,
      lookupNode,
    ]
  );

  /** Called by `useWorkspace.handleDelete` after a successful filesystem
   *  trash. Drops the file from tabs and recents; if it was the active file,
   *  closes the editor (which also flushes any pending edits in background). */
  const notifyPathRemoved = useCallback(
    async (removedPath: string): Promise<void> => {
      tabs.removeTab(removedPath);
      recents.removeRecent(removedPath);
      if (selectionShouldCloseAfterRemove(fileEditor.selectedFile, removedPath)) {
        await fileEditor.handleCloseFile();
      }
    },
    [tabs.removeTab, recents.removeRecent, fileEditor.selectedFile, fileEditor.handleCloseFile]
  );

  return {
    // Tabs
    tabs: tabs.tabs,
    closeTab: tabs.closeTab,
    reorderTabs: tabs.reorderTabs,
    // Recents
    recentFiles: recents.recentFiles,
    clearRecent: recents.clearRecent,
    // Orchestration — the integration logic this hook owns.
    openFile,
    openByPath,
    closeActive,
    notifyPathRenamed,
    notifyPathRemoved,
  };
}
