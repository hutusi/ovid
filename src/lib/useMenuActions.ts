import type React from "react";
import { useCallback, useEffect } from "react";
import type { NewContentKind } from "./amytisScaffold";
import { listenEvent } from "./commands/internal";
import { parseFrontmatter } from "./frontmatter";
import type { FileNode } from "./types";
import type { OverlayStack } from "./useOverlayStack";
import { markdownToWechatHtml } from "./wechatHtml";

// Mirrors the key used in App.tsx for localStorage persistence.
const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";

interface UseMenuActionsOptions {
  overlay: OverlayStack;

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

  // State setters that aren't backed by the overlay stack
  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
  setTypewriterMode: React.Dispatch<React.SetStateAction<boolean>>;
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
  overlay,
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
  setSidebarVisible,
  setPropertiesOpen,
  setZenMode,
  setTypewriterMode,
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
    return listenEvent<string>("menu-action", (payload) => {
      const blocked = overlay.isBlocking;
      switch (payload) {
        case "new-post":
        case "new-note":
        case "new-series":
        case "new-book":
        case "new-page":
          if (!blocked && workspaceRoot)
            overlay.open({
              kind: "modal",
              state: {
                type: "new-file",
                dirPath: workspaceRoot,
                kind: payload.replace("new-", "") as NewContentKind,
              },
            });
          break;
        case "new-flow":
        case "today-flow":
          // Flows are date-based (flows/Y/M/D), so both create today's flow.
          if (!blocked && workspaceRoot) void handleNewTodayFlow();
          break;
        case "open-workspace":
          void handleOpenWorkspace();
          break;
        case "switch-workspace":
          if (!blocked) overlay.open({ kind: "workspaceSwitcher" });
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
          if (workspaceRoot) {
            if (overlay.is("search")) overlay.close("search");
            else overlay.open({ kind: "search" });
          }
          break;
        case "zen-mode":
          setZenMode((v) => !v);
          break;
        case "typewriter-mode":
          setTypewriterMode((v) => !v);
          break;
        case "file-switcher":
          if (!blocked && tree.length > 0) overlay.open({ kind: "switcher" });
          break;
        case "toggle-spell-check":
          updatePrefs({ spellCheck: !prefs.spellCheck });
          break;
        case "check-updates":
          if (!blocked) overlay.open({ kind: "update" });
          break;
        case "help-shortcuts":
          if (!blocked) overlay.open({ kind: "shortcutsHelp" });
          break;
        case "git-commit":
          if (!blocked && isGitRepo) void openCommitDialog(defaultCommitMessage);
          break;
        case "git-switch-branch":
          if (!blocked && isGitRepo) {
            void openBranchSwitcher();
          }
          break;
        case "git-new-branch":
          if (!blocked && isGitRepo) {
            setNewBranchDialogOpen(true);
          }
          break;
        case "git-push":
          if (!blocked && isGitRepo) {
            void runGitAction("push", () => handlePush(), pushSuccessMessage);
          }
          break;
        case "git-open-remote":
          if (!blocked && isGitRepo) {
            void openRemote();
          }
          break;
        case "git-copy-remote-url":
          if (!blocked && isGitRepo) {
            void copyRemoteUrl();
          }
          break;
        case "git-pull":
          if (!blocked && isGitRepo) {
            void runGitAction("pull", handlePull, t("menu.git_pull_success"));
          }
          break;
        case "git-fetch":
          if (!blocked && isGitRepo) {
            void runGitAction("fetch", handleFetch, t("menu.git_fetch_success"));
          }
          break;
        case "wechat-copy":
          if (selectedFile) {
            void handleWechatCopy();
          }
          break;
        case "wechat-publish":
          if (!blocked && selectedFile) {
            overlay.open({ kind: "wechatPublish" });
          }
          break;
      }
    });
  }, [
    overlay,
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
    setSidebarVisible,
    setPropertiesOpen,
    setZenMode,
    setTypewriterMode,
    t,
  ]);
}
