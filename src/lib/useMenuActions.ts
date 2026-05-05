import { listen } from "@tauri-apps/api/event";
import type React from "react";
import { useCallback, useEffect } from "react";
import { parseFrontmatter } from "./frontmatter";
import type { FileNode } from "./types";
import { markdownToWechatHtml } from "./wechatHtml";

// Mirrors the key used in App.tsx for localStorage persistence.
const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";

interface UseMenuActionsOptions {
  // Blocking-overlay state — hook only tests for null / truthy
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

  // Routing conditions
  workspaceRoot: string | null;
  tree: FileNode[];
  isGitRepo: boolean;
  selectedFile: FileNode | null;
  prefs: { spellCheck: boolean };
  pushSuccessMessage: string;
  defaultCommitMessage: string;

  // For handleWechatCopy
  pendingMarkdownRef: React.RefObject<string | null>;
  fileContent: string;
  showToast: (message: string) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;

  // State setters
  setModal: (state: { type: "new-file"; dirPath: string; contentType: string }) => void;
  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
  setTypewriterMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWorkspaceSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setUpdateDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWechatPublishDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNewBranchDialogOpen: (open: boolean) => void;

  // Action handlers
  flushPendingSave: () => void;
  closeActiveTabOrFile: () => void;
  handleOpenWorkspace: () => void;
  handleNewTodayFlow: () => void;
  openCommitDialog: (message: string) => void;
  openBranchSwitcher: () => void;
  runGitAction: (type: "push" | "pull" | "fetch", fn: () => Promise<void>, msg: string) => void;
  handlePush: () => Promise<void>;
  openRemote: () => void;
  copyRemoteUrl: () => void;
  handlePull: () => Promise<void>;
  handleFetch: () => Promise<void>;
  updatePrefs: (updates: { spellCheck: boolean }) => void;
}

/** Wire native menu events to the same handlers as keyboard shortcuts. */
export function useMenuActions({
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
  workspaceRoot,
  tree,
  isGitRepo,
  selectedFile,
  prefs,
  pushSuccessMessage,
  defaultCommitMessage,
  pendingMarkdownRef,
  fileContent,
  showToast,
  t,
  setModal,
  setSidebarVisible,
  setPropertiesOpen,
  setSearchOpen,
  setZenMode,
  setTypewriterMode,
  setSwitcherOpen,
  setWorkspaceSwitcherOpen,
  setUpdateDialogOpen,
  setWechatPublishDialogOpen,
  setNewBranchDialogOpen,
  flushPendingSave,
  closeActiveTabOrFile,
  handleOpenWorkspace,
  handleNewTodayFlow,
  openCommitDialog,
  openBranchSwitcher,
  runGitAction,
  handlePush,
  openRemote,
  copyRemoteUrl,
  handlePull,
  handleFetch,
  updatePrefs,
}: UseMenuActionsOptions): void {
  const handleWechatCopy = useCallback(async () => {
    const markdown = pendingMarkdownRef.current ?? parseFrontmatter(fileContent).body;
    if (!markdown.trim()) {
      showToast(t("menu.file_wechat_copy_no_content"));
      return;
    }
    const { html, hasMath } = markdownToWechatHtml(markdown);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(html);
      } catch (fallbackErr) {
        showToast(String(fallbackErr));
        return;
      }
    }
    showToast(
      hasMath ? t("menu.file_wechat_copy_math_warning") : t("menu.file_wechat_copy_success")
    );
  }, [pendingMarkdownRef, fileContent, showToast, t]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    listen<string>("menu-action", (event) => {
      const hasBlockingOverlay =
        modal !== null ||
        commitDialog !== null ||
        switcherOpen ||
        branchSwitcher !== null ||
        newBranchDialogOpen ||
        renameBranchDialog !== null ||
        deleteBranchDialog !== null ||
        workspaceSwitcherOpen ||
        updateDialogOpen ||
        wechatPublishDialogOpen;
      switch (event.payload) {
        case "new-post":
        case "new-flow":
        case "new-note":
        case "new-series":
        case "new-book":
        case "new-page":
          if (!hasBlockingOverlay && workspaceRoot)
            setModal({
              type: "new-file",
              dirPath: workspaceRoot,
              contentType: event.payload.replace("new-", ""),
            });
          break;
        case "today-flow":
          if (!hasBlockingOverlay && workspaceRoot) void handleNewTodayFlow();
          break;
        case "open-workspace":
          void handleOpenWorkspace();
          break;
        case "switch-workspace":
          if (!hasBlockingOverlay) setWorkspaceSwitcherOpen(true);
          break;
        case "save":
          void flushPendingSave();
          break;
        case "close-file":
          closeActiveTabOrFile();
          break;
        case "toggle-sidebar":
          setSidebarVisible((v) => {
            const next = !v;
            localStorage.setItem(SIDEBAR_VISIBLE_KEY, String(next));
            return next;
          });
          break;
        case "toggle-properties":
          setPropertiesOpen((v) => !v);
          break;
        case "toggle-search":
          if (workspaceRoot) setSearchOpen((v) => !v);
          break;
        case "zen-mode":
          setZenMode((v) => !v);
          break;
        case "typewriter-mode":
          setTypewriterMode((v) => !v);
          break;
        case "file-switcher":
          if (!hasBlockingOverlay && tree.length > 0) setSwitcherOpen(true);
          break;
        case "toggle-spell-check":
          updatePrefs({ spellCheck: !prefs.spellCheck });
          break;
        case "check-updates":
          if (!hasBlockingOverlay) setUpdateDialogOpen(true);
          break;
        case "git-commit":
          if (!hasBlockingOverlay && isGitRepo) void openCommitDialog(defaultCommitMessage);
          break;
        case "git-switch-branch":
          if (!hasBlockingOverlay && isGitRepo) {
            void openBranchSwitcher();
          }
          break;
        case "git-new-branch":
          if (!hasBlockingOverlay && isGitRepo) {
            setNewBranchDialogOpen(true);
          }
          break;
        case "git-push":
          if (!hasBlockingOverlay && isGitRepo) {
            void runGitAction("push", () => handlePush(), pushSuccessMessage);
          }
          break;
        case "git-open-remote":
          if (!hasBlockingOverlay && isGitRepo) {
            void openRemote();
          }
          break;
        case "git-copy-remote-url":
          if (!hasBlockingOverlay && isGitRepo) {
            void copyRemoteUrl();
          }
          break;
        case "git-pull":
          if (!hasBlockingOverlay && isGitRepo) {
            void runGitAction("pull", handlePull, "Pulled latest changes");
          }
          break;
        case "git-fetch":
          if (!hasBlockingOverlay && isGitRepo) {
            void runGitAction("fetch", handleFetch, "Fetched remote updates");
          }
          break;
        case "wechat-copy":
          if (selectedFile) {
            void handleWechatCopy();
          }
          break;
        case "wechat-publish":
          if (!hasBlockingOverlay && selectedFile) {
            setWechatPublishDialogOpen(true);
          }
          break;
      }
    }).then((fn) => {
      if (mounted) {
        unlisten = fn;
      } else {
        fn();
      }
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [
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
    workspaceRoot,
    tree,
    isGitRepo,
    openCommitDialog,
    openBranchSwitcher,
    openRemote,
    copyRemoteUrl,
    runGitAction,
    pushSuccessMessage,
    handlePush,
    handlePull,
    handleFetch,
    defaultCommitMessage,
    setNewBranchDialogOpen,
    flushPendingSave,
    closeActiveTabOrFile,
    handleOpenWorkspace,
    handleNewTodayFlow,
    handleWechatCopy,
    selectedFile,
    prefs,
    updatePrefs,
    setModal,
    setSidebarVisible,
    setPropertiesOpen,
    setSearchOpen,
    setZenMode,
    setTypewriterMode,
    setSwitcherOpen,
    setWorkspaceSwitcherOpen,
    setUpdateDialogOpen,
    setWechatPublishDialogOpen,
  ]);
}
