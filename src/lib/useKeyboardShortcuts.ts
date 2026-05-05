import type React from "react";
import { useEffect } from "react";
import type { FileNode } from "./types";

const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";

interface UseKeyboardShortcutsOptions {
  // Blocking overlay state
  modal: unknown;
  commitDialog: unknown;
  switcherOpen: boolean;
  branchSwitcher: unknown;
  newBranchDialogOpen: boolean;
  renameBranchDialog: unknown;
  deleteBranchDialog: unknown;
  workspaceSwitcherOpen: boolean;
  updateDialogOpen: boolean;
  wechatPublishDialogOpen: boolean;

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

  setModal: (state: { type: "new-file"; dirPath: string; contentType: string }) => void;
  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Wire global keyboard shortcuts to app-level state and actions. */
export function useKeyboardShortcuts({
  modal,
  commitDialog,
  switcherOpen,
  branchSwitcher,
  newBranchDialogOpen,
  renameBranchDialog,
  deleteBranchDialog,
  workspaceSwitcherOpen,
  updateDialogOpen,
  wechatPublishDialogOpen,
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
  setModal,
  setSidebarVisible,
  setPropertiesOpen,
  setSearchOpen,
  setZenMode,
  setWorkspaceSwitcherOpen,
  setSwitcherOpen,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key?.toLowerCase();
      // Escape exits zen mode (before other guards)
      if (
        key === "escape" &&
        zenMode &&
        !modal &&
        !commitDialog &&
        !switcherOpen &&
        !branchSwitcher &&
        !newBranchDialogOpen &&
        !renameBranchDialog &&
        !deleteBranchDialog &&
        !workspaceSwitcherOpen &&
        !updateDialogOpen &&
        !wechatPublishDialogOpen
      ) {
        setZenMode(false);
        return;
      }
      if (!e.metaKey && !e.ctrlKey) return;
      // Ctrl+Cmd+Z — zen mode (macOS); avoids conflict with Redo (Cmd+Shift+Z)
      if (e.metaKey && e.ctrlKey && key === "z") {
        e.preventDefault();
        setZenMode((v) => !v);
        return;
      }
      // Mode toggles work even when editor has focus
      if (e.shiftKey && key === "p") {
        e.preventDefault();
        setPropertiesOpen((v) => !v);
        return;
      }
      if (e.shiftKey && key === "f") {
        e.preventDefault();
        if (workspaceRoot) setSearchOpen((v) => !v);
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
        case "\\":
          e.preventDefault();
          setSidebarVisible((v) => {
            const next = !v;
            localStorage.setItem(SIDEBAR_VISIBLE_KEY, String(next));
            return next;
          });
          break;
        case "o":
          e.preventDefault();
          if (e.shiftKey) {
            setWorkspaceSwitcherOpen(true);
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
          if (tree.length > 0) setSwitcherOpen(true);
          break;
        case "n":
          e.preventDefault();
          if (workspaceRoot)
            setModal({ type: "new-file", dirPath: workspaceRoot, contentType: "post" });
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
    flushPendingSave,
    handleOpenWorkspace,
    handleNewTodayFlow,
    workspaceRoot,
    tree,
    isGitRepo,
    openCommitDialog,
    defaultCommitMessage,
    zenMode,
    modal,
    commitDialog,
    switcherOpen,
    branchSwitcher,
    newBranchDialogOpen,
    renameBranchDialog,
    deleteBranchDialog,
    workspaceSwitcherOpen,
    updateDialogOpen,
    wechatPublishDialogOpen,
    closeActiveTabOrFile,
    setModal,
    setSidebarVisible,
    setPropertiesOpen,
    setSearchOpen,
    setZenMode,
    setWorkspaceSwitcherOpen,
    setSwitcherOpen,
  ]);
}
