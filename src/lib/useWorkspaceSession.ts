import { useRef } from "react";
import type { ContentPreferences } from "./useContentPreferences";
import { type FileEditorHandle, useEditorSession } from "./useEditorSession";
import { useWorkspace } from "./useWorkspace";

interface UseWorkspaceSessionOptions {
  showToast: (msg: string) => void;
  flushPendingSave: () => Promise<void>;
  resetFileState: () => void;
  /**
   * The file-editor handle is passed in from `useFileEditor` rather than
   * composed here — `useFileEditor` owns the toast/save coordination and is
   * also consumed by App.tsx for the editor pane's content + dirty state.
   * Wrapping it here would duplicate that ownership.
   */
  fileEditor: FileEditorHandle;
  /** New-content format/layout choice, forwarded to `useWorkspace`. */
  contentPrefs?: ContentPreferences;
}

/**
 * Coordinator that resolves the cycle between `useWorkspace` (owns the tree
 * and file-mutation handlers; needs to fire path callbacks when a mutation
 * lands) and `useEditorSession` (owns the open-file lifecycle; needs to
 * react to those callbacks by updating tabs, recents, and selection).
 *
 * The cycle is real: `useWorkspace`'s `onPathCreated` / `onPathRenamed` /
 * `onPathRemoved` callbacks must dispatch to a `useEditorSession` instance
 * that is itself constructed *after* `useWorkspace` returns (it depends on
 * `flatFiles` / `workspaceRoot`). The classic React idiom is a ref that
 * holds the latest session and is reassigned every render. That's exactly
 * what this hook encapsulates — the ref + the reassignment + the
 * stub-initialised callback object — so `App.tsx` doesn't have to.
 *
 * The shape mirrors `useEditorSession`'s relationship with its composed
 * `useFileEditor` / `useOpenTabs` / `useRecentFiles`: one composite hook,
 * one merged return value, the inter-hook plumbing kept private.
 *
 * @see [[useEditorSession]]
 */
export function useWorkspaceSession({
  showToast,
  flushPendingSave,
  resetFileState,
  fileEditor,
  contentPrefs,
}: UseWorkspaceSessionOptions) {
  const sessionRef = useRef<ReturnType<typeof useEditorSession> | null>(null);

  const workspace = useWorkspace({
    showToast,
    flushPendingSave,
    resetFileState,
    contentPrefs,
    onPathCreated: (node) =>
      sessionRef.current?.openFile(node).then(() => undefined) ?? Promise.resolve(),
    onPathRenamed: (oldPath, newPath, lookup) =>
      sessionRef.current?.notifyPathRenamed(oldPath, newPath, lookup),
    onPathRemoved: (path) => sessionRef.current?.notifyPathRemoved(path) ?? Promise.resolve(),
  });

  const session = useEditorSession({
    fileEditor,
    workspaceRoot: workspace.workspaceRoot,
    workspaceRootPath: workspace.workspaceRootPath,
    flatFiles: workspace.flatFiles,
  });

  // Populated synchronously after useEditorSession returns. Subsequent
  // user-triggered workspace mutations (handleNewFile etc.) cannot run
  // before this assignment, so the callbacks above always dispatch
  // through a current session instance.
  sessionRef.current = session;

  return { ...workspace, ...session };
}
