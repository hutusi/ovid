import type React from "react";
import { useEffect } from "react";
import type { FileNode } from "./types";
import { PROPERTIES_OPEN_KEY, SIDEBAR_VISIBLE_KEY, togglePersisted } from "./uiVisibility";
import type { OverlayStack } from "./useOverlayStack";

interface UseKeyboardShortcutsOptions {
  overlay: OverlayStack;
  zenMode: boolean;
  workspaceRoot: string | null;
  tree: FileNode[];
  isGitRepo: boolean;
  defaultCommitMessage: string;

  flushPendingSave: () => void;
  closeActiveTabOrFile: () => void;
  handleOpenWorkspace: () => void;
  handleNewTodayFlow: () => void;
  openCommitDialog: (message: string) => void;

  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Wire global keyboard shortcuts to app-level state and actions. */
export function useKeyboardShortcuts({
  overlay,
  zenMode,
  workspaceRoot,
  tree,
  isGitRepo,
  defaultCommitMessage,
  flushPendingSave,
  closeActiveTabOrFile,
  handleOpenWorkspace,
  handleNewTodayFlow,
  openCommitDialog,
  setSidebarVisible,
  setPropertiesOpen,
  setZenMode,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key?.toLowerCase();
      // Escape exits zen mode (only when no modal is blocking)
      if (key === "escape" && zenMode && !overlay.isBlocking) {
        setZenMode(false);
        return;
      }
      // `?` opens the keyboard shortcuts help dialog. The `?` character
      // requires Shift on most layouts; we match on the produced key, not
      // the underlying physical key, so layouts where `?` is unshifted
      // also work. Suppressed when an input has focus or any blocking
      // overlay is open.
      if (e.key === "?" && !overlay.isBlocking) {
        const target = e.target as HTMLElement | null;
        const inInput =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target?.isContentEditable ?? false);
        if (!inInput) {
          e.preventDefault();
          overlay.open({ kind: "shortcutsHelp" });
          return;
        }
      }
      if (!e.metaKey && !e.ctrlKey) return;
      // Ctrl+Cmd+Z — zen mode (macOS); avoids conflict with Redo (Cmd+Shift+Z)
      if (e.metaKey && e.ctrlKey && key === "z") {
        e.preventDefault();
        setZenMode((v) => !v);
        return;
      }
      // Cmd/Ctrl+, opens Preferences — handled here (before the input-focus
      // guard) so it works even while the editor is focused.
      if (key === "," && !e.shiftKey && !e.altKey && !overlay.isBlocking) {
        e.preventDefault();
        overlay.open({ kind: "preferences" });
        return;
      }
      // Mode toggles work even when editor has focus
      if (e.shiftKey && key === "p") {
        e.preventDefault();
        togglePersisted(setPropertiesOpen, PROPERTIES_OPEN_KEY);
        return;
      }
      if (e.shiftKey && key === "l") {
        e.preventDefault();
        togglePersisted(setSidebarVisible, SIDEBAR_VISIBLE_KEY);
        return;
      }
      if (e.shiftKey && key === "f") {
        e.preventDefault();
        if (workspaceRoot) {
          if (overlay.is("search")) overlay.close("search");
          else overlay.open({ kind: "search" });
        }
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      switch (key) {
        case "o":
          e.preventDefault();
          if (e.shiftKey) {
            overlay.open({ kind: "workspaceSwitcher" });
          } else {
            void handleOpenWorkspace();
          }
          break;
        case "g":
          if (e.shiftKey && isGitRepo) {
            e.preventDefault();
            void openCommitDialog(defaultCommitMessage);
          }
          break;
        case "p":
          e.preventDefault();
          if (tree.length > 0) overlay.open({ kind: "switcher" });
          break;
        case "n":
          e.preventDefault();
          if (workspaceRoot)
            overlay.open({
              kind: "modal",
              state: { type: "new-file", dirPath: workspaceRoot, kind: "post" },
            });
          break;
        case "t":
          if (e.shiftKey) {
            e.preventDefault();
            if (workspaceRoot) void handleNewTodayFlow();
          }
          break;
        case "s":
          e.preventDefault();
          void flushPendingSave();
          break;
        case "w":
          e.preventDefault();
          closeActiveTabOrFile();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    overlay,
    zenMode,
    flushPendingSave,
    handleOpenWorkspace,
    handleNewTodayFlow,
    workspaceRoot,
    tree,
    isGitRepo,
    openCommitDialog,
    defaultCommitMessage,
    closeActiveTabOrFile,
    setSidebarVisible,
    setPropertiesOpen,
    setZenMode,
  ]);
}
