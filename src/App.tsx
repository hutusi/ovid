import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "./components/EmptyState";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FileViewer, getFileViewKind } from "./components/FileViewer";
import { PropertiesPanel } from "./components/PropertiesPanel";
import type { SidebarMode } from "./components/Sidebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { loadLastRecentFilePath } from "./lib/appRestore";
import { parseFrontmatter } from "./lib/frontmatter";
import { AUTO_FETCH_COOLDOWN_MS, runAutoFetchOnFocus } from "./lib/gitAutoFetch";
import { getGitBranchTitle } from "./lib/gitUi";
import { resolveImageSrc } from "./lib/imageUtils";
import { isPerfLoggingEnabled } from "./lib/perf";
import {
  getDuplicateNameSuggestion,
  getNewFromExistingNameSuggestion,
  getPathDisplayLabel,
  getRenamePathDialogState,
} from "./lib/postPath";
import type { FileNode } from "./lib/types";
import { useContentTypes } from "./lib/useContentTypes";
import { useEditorPreferences } from "./lib/useEditorPreferences";
import { useFileEditor } from "./lib/useFileEditor";
import { useGit } from "./lib/useGit";
import { useGitUiController } from "./lib/useGitUiController";
import { useOpenTabs } from "./lib/useOpenTabs";
import { useRecentFiles } from "./lib/useRecentFiles";
import { useRecentWorkspaces } from "./lib/useRecentWorkspaces";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWordCountGoal } from "./lib/useWordCountGoal";
import { useWorkspace } from "./lib/useWorkspace";
import {
  countLocalImages,
  extractExcerpt,
  hasMathBlocks,
  markdownToWechatHtml,
} from "./lib/wechatHtml";
import { getExternalWorkspaceChangeAction } from "./lib/workspaceRefresh";
import "./styles/global.css";
import "./App.css";

type ModalState =
  | { type: "new-file"; dirPath: string; contentType?: string }
  | { type: "duplicate-file"; node: FileNode }
  | { type: "new-from-existing"; node: FileNode }
  | { type: "rename-path"; node: FileNode }
  | null;
type EditorViewState = { selection: number; scrollTop: number };

const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";
const SIDEBAR_MODE_KEY_PREFIX = "ovid:sidebarMode";
const AUTO_REOPEN_KEY = "ovid:skipAutoReopen";
const SAVE_GIT_REFRESH_DELAY_MS = 400;
const WORKSPACE_REVISION_POLL_MS = 2000;

const loadEditor = async () => import("./components/Editor");
const Editor = lazy(async () => ({
  default: (await loadEditor()).Editor,
}));

const SearchPanel = lazy(async () => ({
  default: (await import("./components/SearchPanel")).SearchPanel,
}));
const WorkspaceSwitcher = lazy(async () => ({
  default: (await import("./components/WorkspaceSwitcher")).WorkspaceSwitcher,
}));
const FileSwitcher = lazy(async () => ({
  default: (await import("./components/FileSwitcher")).FileSwitcher,
}));
const NewFileDialog = lazy(async () => ({
  default: (await import("./components/NewFileDialog")).NewFileDialog,
}));
const CommitDialog = lazy(async () => ({
  default: (await import("./components/CommitDialog")).CommitDialog,
}));
const BranchSwitcher = lazy(async () => ({
  default: (await import("./components/BranchSwitcher")).BranchSwitcher,
}));
const NewBranchDialog = lazy(async () => ({
  default: (await import("./components/NewBranchDialog")).NewBranchDialog,
}));
const RenameBranchDialog = lazy(async () => ({
  default: (await import("./components/RenameBranchDialog")).RenameBranchDialog,
}));
const DeleteBranchDialog = lazy(async () => ({
  default: (await import("./components/DeleteBranchDialog")).DeleteBranchDialog,
}));
const GitSyncPopover = lazy(async () => ({
  default: (await import("./components/GitSyncPopover")).GitSyncPopover,
}));
const PerfPanel = lazy(async () => ({
  default: (await import("./components/PerfPanel")).PerfPanel,
}));
const UpdateDialog = lazy(async () => ({
  default: (await import("./components/UpdateDialog")).UpdateDialog,
}));
const RenamePathDialog = lazy(async () => ({
  default: (await import("./components/RenamePathDialog")).RenamePathDialog,
}));
const WechatPublishDialog = lazy(async () => ({
  default: (await import("./components/WechatPublishDialog")).WechatPublishDialog,
}));

function makeFileNodeFromPath(path: string): FileNode {
  const normalizedPath = path.replace(/\\/g, "/");
  const name = normalizedPath.split("/").pop() ?? path;
  const extension = name.endsWith(".mdx") ? ".mdx" : name.endsWith(".md") ? ".md" : undefined;
  return {
    name,
    path,
    isDirectory: false,
    extension,
  };
}

function mergeFilesTreeChildren(
  nodes: FileNode[],
  dirPath: string,
  children: FileNode[]
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === dirPath && node.isDirectory)
      return { ...node, children, childrenLoaded: true };
    if (!node.children) return node;
    return { ...node, children: mergeFilesTreeChildren(node.children, dirPath, children) };
  });
}

function App() {
  const { t } = useTranslation();
  const { resolvedTheme, setPreference } = useTheme();
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== "false"
  );
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("content");
  const [fileViewerNode, setFileViewerNode] = useState<import("./lib/types").FileNode | null>(null);
  const [filesTree, setFilesTree] = useState<FileNode[]>([]);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [baselineCaptured, setBaselineCaptured] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [wechatPublishDialogOpen, setWechatPublishDialogOpen] = useState(false);
  const [coverImageVisible, setCoverImageVisible] = useState(false);
  const pendingAutoOpenPath = useRef<string | null>(null);
  const lastAutoFetchAtRef = useRef(0);
  const autoFetchInFlightRef = useRef(false);
  const editorViewStateRef = useRef<Record<string, EditorViewState>>({});
  const saveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousSaveStatusRef = useRef<"saved" | "unsaved">("saved");
  const workspaceRevisionRef = useRef<string | null>(null);
  const workspaceRefreshInFlightRef = useRef(false);
  const workspaceRefreshFailureToastRef = useRef<string | null>(null);
  const externalUnsavedToastRevisionRef = useRef<string | null>(null);
  const tabSyncRef = useRef<{
    renameTab: (oldPath: string, newPath: string) => void;
    removeTab: (path: string) => void;
  }>({ renameTab: () => {}, removeTab: () => {} });

  const { toasts, showToast } = useToast();
  const { prefs, updatePrefs } = useEditorPreferences();
  const { goal: wordCountGoal, setGoal: setWordCountGoal } = useWordCountGoal();

  const {
    selectedFile,
    setSelectedFile,
    fileContent,
    wordCount,
    setWordCount,
    parsedFrontmatter,
    saveStatus,
    selectedPathRef,
    pendingMarkdownRef,
    flushPendingSave,
    resetFileState,
    handleCloseFile,
    handleSelectFile,
    reloadSelectedFileFromDisk,
    handleEditorChange,
    handleEditorDirty,
    handleFieldChange,
    registerEditorFlush,
  } = useFileEditor({ showToast });
  const selectedFileRef = useRef<FileNode | null>(selectedFile);
  const saveStatusRef = useRef<"saved" | "unsaved">(saveStatus);
  const isGitRepoRef = useRef(false);

  selectedFileRef.current = selectedFile;
  saveStatusRef.current = saveStatus;

  const {
    tree,
    flatFiles,
    workspaceName,
    workspaceRoot,
    workspaceRootPath,
    isAmytisWorkspace,
    assetRoot,
    cdnBase,
    defaultAuthor,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDuplicate,
    handleNewFromExisting,
    handleDelete,
    refreshTree,
    loadDirectoryChildren,
  } = useWorkspace({
    showToast,
    flushPendingSave,
    handleCloseFile,
    handleSelectFile,
    selectedFile,
    selectedPathRef,
    setSelectedFile,
    resetFileState,
    onPathRenamed: (oldPath, newPath) => tabSyncRef.current.renameTab(oldPath, newPath),
    onPathRemoved: (path) => tabSyncRef.current.removeTab(path),
  });

  const { recentFiles, pushRecent, resetRecent } = useRecentFiles(workspaceRoot);
  const { tabs, openTab, closeTab, reorderTabs, renameTab, removeTab } =
    useOpenTabs(workspaceRootPath);
  useEffect(() => {
    tabSyncRef.current = { renameTab, removeTab };
  }, [renameTab, removeTab]);

  const handleLoadDirectoryChildren = useCallback(
    (dirPath: string) => {
      void loadDirectoryChildren(dirPath);
    },
    [loadDirectoryChildren]
  );

  // Canonical open-by-path: looks up the full FileNode from the complete flat index
  // (never from the hierarchical tree, which can become incomplete after sidebar interactions),
  // then selects, records, and tabs the file in one consistent step.
  const openFileByPath = useCallback(
    (path: string) => {
      const node = flatFiles.find((f) => f.node.path === path)?.node ?? makeFileNodeFromPath(path);
      if (node.isDirectory) return;
      setFileViewerNode(null);
      void handleSelectFile(node);
      pushRecent(node);
      openTab(path);
    },
    [flatFiles, handleSelectFile, pushRecent, openTab]
  );

  const loadFilesTree = useCallback(async () => {
    if (!workspaceRootPath) return;
    try {
      const nodes = await invoke<FileNode[]>("list_workspace_children", {
        path: workspaceRootPath,
        allFiles: true,
      });
      setFilesTree(nodes);
    } catch (err) {
      showToast(
        t("workspace.load_files_error", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }, [workspaceRootPath, showToast, t]);

  const handleLoadDirectoryChildrenFiles = useCallback(
    async (dirPath: string) => {
      try {
        const children = await invoke<FileNode[]>("list_workspace_children", {
          path: dirPath,
          allFiles: true,
        });
        setFilesTree((current) => mergeFilesTreeChildren(current, dirPath, children));
      } catch (err) {
        showToast(
          t("workspace.load_files_error", {
            message: err instanceof Error ? err.message : String(err),
          })
        );
      }
    },
    [showToast, t]
  );

  // Sidebar mode: persist per workspace
  useEffect(() => {
    const key = workspaceRootPath
      ? `${SIDEBAR_MODE_KEY_PREFIX}:${workspaceRootPath}`
      : SIDEBAR_MODE_KEY_PREFIX;
    const stored = localStorage.getItem(key);
    setSidebarMode(stored === "files" ? "files" : "content");
    setFileViewerNode(null);
    setFilesTree([]);
  }, [workspaceRootPath]);

  useEffect(() => {
    const key = workspaceRootPath
      ? `${SIDEBAR_MODE_KEY_PREFIX}:${workspaceRootPath}`
      : SIDEBAR_MODE_KEY_PREFIX;
    localStorage.setItem(key, sidebarMode);
    if (sidebarMode === "content") {
      setFileViewerNode(null);
      setFilesTree([]);
    } else {
      void loadFilesTree();
    }
  }, [sidebarMode, workspaceRootPath, loadFilesTree]);

  function handleToggleSidebarMode() {
    setSidebarMode((prev) => (prev === "content" ? "files" : "content"));
  }

  function handleSidebarSelect(node: import("./lib/types").FileNode) {
    const isMarkdown = node.extension === ".md" || node.extension === ".mdx";
    if (sidebarMode === "content" || isMarkdown) {
      setFileViewerNode(null);
      void handleSelectFile(node);
      if (!node.isDirectory) {
        pushRecent(node);
        openTab(node.path);
      }
      return;
    }
    const kind = getFileViewKind(node);
    if (kind === null) {
      showToast(t("file_viewer.cannot_open"));
      return;
    }
    void handleCloseFile();
    setFileViewerNode(node);
  }

  const closeActiveTabOrFile = useCallback(() => {
    if (fileViewerNode) {
      setFileViewerNode(null);
      return;
    }
    if (selectedFile && tabs.includes(selectedFile.path)) {
      const { neighbor } = closeTab(selectedFile.path);
      if (neighbor) {
        const node =
          flatFiles.find((f) => f.node.path === neighbor)?.node ?? makeFileNodeFromPath(neighbor);
        void handleSelectFile(node);
        pushRecent(node);
        return;
      }
    }
    void handleCloseFile();
  }, [
    fileViewerNode,
    selectedFile,
    tabs,
    closeTab,
    flatFiles,
    handleSelectFile,
    pushRecent,
    handleCloseFile,
  ]);

  const handleEditorViewStateChange = useCallback(
    (viewState: EditorViewState) => {
      if (!selectedFile) return;
      editorViewStateRef.current[selectedFile.path] = viewState;
    },
    [selectedFile]
  );
  const currentEditorViewState = selectedFile
    ? editorViewStateRef.current[selectedFile.path]
    : undefined;
  const { recentWorkspaces, pushRecentWorkspace } = useRecentWorkspaces();
  const {
    gitStatusMap,
    isGitRepo,
    currentBranch,
    remoteInfo,
    refreshGitStatus,
    handleCommit,
    handlePush,
    handlePull,
    handleFetch,
    handleSwitchBranch,
    handleCreateBranch,
    handleCheckoutRemoteBranch,
    handleRenameBranch,
    handleDeleteBranch,
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteBranches,
    getRemoteInfo,
  } = useGit(workspaceRoot);
  isGitRepoRef.current = isGitRepo;
  const contentTypes = useContentTypes(workspaceRoot, isAmytisWorkspace);
  const {
    commitDialog,
    branchSwitcher,
    newBranchDialogOpen,
    renameBranchDialog,
    deleteBranchDialog,
    gitSyncPopoverOpen,
    gitChangeSummary,
    gitSyncLabel,
    gitSyncPopover,
    pushSuccessMessage,
    defaultCommitMessage,
    openCommitDialog,
    setCommitDialog,
    handleCommitDialogCommit,
    runGitAction,
    openBranchSwitcher,
    closeBranchSwitcher,
    switchBranch,
    createBranch,
    checkoutRemoteBranch,
    renameBranch,
    deleteBranch,
    openRemote,
    copyRemoteUrl,
    handleGitSyncAction,
    setNewBranchDialogOpen,
    setRenameBranchDialog,
    setDeleteBranchDialog,
    setGitSyncPopoverOpen,
  } = useGitUiController({
    gitStatusMap,
    isGitRepo,
    remoteInfo,
    workspaceRootPath,
    parsedTitle: parsedFrontmatter.title == null ? undefined : String(parsedFrontmatter.title),
    selectedFileName: selectedFile?.name,
    showToast,
    flushPendingSave,
    openWorkspaceAtPath,
    handleCommit,
    handlePush,
    handlePull,
    handleSwitchBranch,
    handleCreateBranch,
    handleCheckoutRemoteBranch,
    handleRenameBranch,
    handleDeleteBranch,
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteBranches,
    getRemoteInfo,
  });

  // Sync recent files list when workspace changes
  useEffect(() => {
    if (workspaceRoot) resetRecent(workspaceRoot);
  }, [workspaceRoot, resetRecent]);

  useEffect(() => {
    if (!workspaceRootPath && !selectedFile) return;
    const timer = window.setTimeout(() => {
      void loadEditor();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceRootPath, selectedFile]);

  // Track recently opened workspaces
  useEffect(() => {
    if (workspaceRootPath && workspaceName) {
      pushRecentWorkspace(workspaceRootPath, workspaceName);
    }
  }, [workspaceRootPath, workspaceName, pushRecentWorkspace]);

  // Auto-reopen last workspace on launch (once)
  const autoReopenAttempted = useRef(false);
  useEffect(() => {
    if (
      autoReopenAttempted.current ||
      workspaceRootPath !== null ||
      recentWorkspaces.length === 0 ||
      localStorage.getItem(AUTO_REOPEN_KEY) === "true"
    )
      return;
    autoReopenAttempted.current = true;
    pendingAutoOpenPath.current = loadLastRecentFilePath(
      recentWorkspaces[0].rootPath,
      localStorage
    );
    void openWorkspaceAtPath(recentWorkspaces[0].rootPath);
  }, [recentWorkspaces, openWorkspaceAtPath, workspaceRootPath]);

  useEffect(() => {
    const path = pendingAutoOpenPath.current;
    if (!path || tree.length === 0 || selectedFile) return;
    pendingAutoOpenPath.current = null;
    openFileByPath(path);
  }, [tree, selectedFile, openFileByPath]);

  // Reset per-file UI state when switching files (selectedFile is the trigger, not used in body)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile is the intended trigger
  useEffect(() => {
    setSessionBaseline(null);
    setBaselineCaptured(false);
    setCoverImageVisible(false);
  }, [selectedFile]);

  // Capture baseline on first word-count event for the new file (including empty files)
  useEffect(() => {
    if (!baselineCaptured) {
      setSessionBaseline(wordCount);
      setBaselineCaptured(true);
    }
  }, [wordCount, baselineCaptured]);

  // Global keyboard shortcuts
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
  ]);

  // Refresh git status after each save completes
  useEffect(() => {
    const previousSaveStatus = previousSaveStatusRef.current;
    previousSaveStatusRef.current = saveStatus;

    if (!isGitRepo || saveStatus !== "saved" || previousSaveStatus !== "unsaved") return;

    if (saveRefreshTimerRef.current) clearTimeout(saveRefreshTimerRef.current);
    saveRefreshTimerRef.current = setTimeout(() => {
      saveRefreshTimerRef.current = null;
      void refreshGitStatus();
    }, SAVE_GIT_REFRESH_DELAY_MS);

    return () => {
      if (saveRefreshTimerRef.current) {
        clearTimeout(saveRefreshTimerRef.current);
        saveRefreshTimerRef.current = null;
      }
    };
  }, [saveStatus, isGitRepo, refreshGitStatus]);

  // Pick up files changed outside Ovid (Git pulls, another editor, generators).
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
  ]);

  // Refresh remote-tracking refs when the window regains focus so ahead/behind stays current.
  useEffect(() => {
    if (!workspaceRoot || !isGitRepo) return;

    let mounted = true;
    let unlisten: (() => void) | undefined;

    async function maybeFetchRemoteStatus() {
      if (autoFetchInFlightRef.current) return;
      autoFetchInFlightRef.current = true;
      const now = Date.now();
      try {
        lastAutoFetchAtRef.current = await runAutoFetchOnFocus(
          {
            focused: true,
            now,
            lastFetchedAt: lastAutoFetchAtRef.current,
            cooldownMs: AUTO_FETCH_COOLDOWN_MS,
          },
          handleFetch
        );
      } finally {
        autoFetchInFlightRef.current = false;
      }
    }

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!mounted || !focused) return;
        void maybeFetchRemoteStatus();
      })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {
        // If focus listeners are unavailable, Git status still updates via manual actions.
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [workspaceRoot, isGitRepo, handleFetch]);

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

  // Forward native menu events to the same handlers as keyboard shortcuts
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
  ]);

  const coverImagePath =
    parsedFrontmatter.coverImage != null && parsedFrontmatter.coverImage !== ""
      ? String(parsedFrontmatter.coverImage)
      : undefined;

  // Values passed to WechatPublishDialog when opened
  const wechatBaseDir = selectedFile
    ? selectedFile.path.substring(0, selectedFile.path.lastIndexOf("/"))
    : (workspaceRootPath ?? "");
  // Pass the raw coverImage frontmatter value to Rust; Rust resolves root-relative
  // paths (/images/…) against assetRoot and relative paths against wechatBaseDir.
  const wechatCoverImagePath = coverImagePath ?? null;
  // Author: frontmatter author → site.config default → empty; blank frontmatter treated as missing
  const frontmatterAuthor =
    parsedFrontmatter.author != null ? String(parsedFrontmatter.author).trim() : "";
  const wechatAuthor = frontmatterAuthor || (defaultAuthor ?? "");
  // Digest: frontmatter excerpt/description → auto-extract from body
  const wechatBody = pendingMarkdownRef.current ?? parseFrontmatter(fileContent).body;
  const wechatDigest = (() => {
    if (parsedFrontmatter.excerpt != null && String(parsedFrontmatter.excerpt).trim())
      return String(parsedFrontmatter.excerpt).trim();
    if (parsedFrontmatter.description != null && String(parsedFrontmatter.description).trim())
      return String(parsedFrontmatter.description).trim();
    return extractExcerpt(wechatBody);
  })();
  const wechatHasMath = hasMathBlocks(wechatBody);
  const wechatImageCount = countLocalImages(wechatBody);
  const wechatMediaId =
    parsedFrontmatter.wechatMediaId != null && String(parsedFrontmatter.wechatMediaId).trim()
      ? String(parsedFrontmatter.wechatMediaId).trim()
      : null;

  async function handlePublishAwareFieldChange(key: string, value: unknown) {
    await handleFieldChange(key, value as Parameters<typeof handleFieldChange>[1]);
    if (key === "draft" && value === false && isGitRepo) {
      try {
        const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
        await openCommitDialog(`Publish: ${title}`);
      } catch {
        // git unavailable — ignore
      }
    }
  }

  function handleOpenByPath(path: string) {
    openFileByPath(path);
    setSearchOpen(false);
  }

  function handleSelectFromTab(path: string) {
    const node = flatFiles.find((f) => f.node.path === path)?.node ?? makeFileNodeFromPath(path);
    setFileViewerNode(null);
    void handleSelectFile(node);
    pushRecent(node);
  }

  function handleCloseTab(path: string) {
    const wasActive = selectedFile?.path === path;
    const { neighbor } = closeTab(path);
    if (!wasActive) return;
    if (neighbor) handleSelectFromTab(neighbor);
    else void handleCloseFile();
  }

  const sessionWordsAdded = sessionBaseline !== null ? Math.max(0, wordCount - sessionBaseline) : 0;

  return (
    <div className="app" data-zen={zenMode ? "true" : undefined}>
      <div className="app-body">
        {searchOpen ? (
          <Suspense fallback={null}>
            <SearchPanel onOpenFile={handleOpenByPath} onClose={() => setSearchOpen(false)} />
          </Suspense>
        ) : (
          <Sidebar
            tree={sidebarMode === "files" ? filesTree : tree}
            workspaceKey={workspaceRootPath}
            selectedPath={fileViewerNode?.path ?? selectedFile?.path ?? null}
            visible={sidebarVisible}
            workspaceName={workspaceName}
            gitStatusMap={gitStatusMap}
            mode={sidebarMode}
            onToggleMode={handleToggleSidebarMode}
            onSelect={handleSidebarSelect}
            onOpenWorkspace={handleOpenWorkspace}
            onOpenSwitcher={() => setWorkspaceSwitcherOpen(true)}
            onNewFile={(dirPath) => setModal({ type: "new-file", dirPath })}
            onLoadDirectoryChildren={
              sidebarMode === "files"
                ? (dirPath) => void handleLoadDirectoryChildrenFiles(dirPath)
                : handleLoadDirectoryChildren
            }
            onRename={(node) => setModal({ type: "rename-path", node })}
            onDuplicate={(node) => setModal({ type: "duplicate-file", node })}
            onNewFromExisting={(node) => setModal({ type: "new-from-existing", node })}
            onDelete={handleDelete}
          />
        )}
        <div className="editor-column">
          {tabs.length >= 2 && (
            <TabBar
              tabs={tabs}
              tree={tree}
              activePath={selectedFile?.path ?? null}
              saveStatus={saveStatus}
              onSelect={handleSelectFromTab}
              onClose={handleCloseTab}
              onReorder={reorderTabs}
            />
          )}
          {selectedFile && coverImageVisible && coverImagePath && (
            <div className="cover-image-banner">
              <img
                src={resolveImageSrc(coverImagePath, selectedFile.path, assetRoot, cdnBase)}
                alt={parsedFrontmatter.title ? String(parsedFrontmatter.title) : ""}
              />
            </div>
          )}
          {fileViewerNode ? (
            <FileViewer node={fileViewerNode} onClose={() => setFileViewerNode(null)} />
          ) : selectedFile ? (
            <ErrorBoundary key={selectedFile.path}>
              <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
                <Editor
                  key={selectedFile.path}
                  content={fileContent}
                  filePath={selectedFile.path}
                  assetRoot={assetRoot}
                  cdnBase={cdnBase}
                  typewriterMode={typewriterMode}
                  spellCheck={prefs.spellCheck}
                  showH1Warning={
                    parsedFrontmatter.title != null && String(parsedFrontmatter.title).trim() !== ""
                  }
                  title={parsedFrontmatter.title != null ? String(parsedFrontmatter.title) : ""}
                  onTitleChange={(value) => void handlePublishAwareFieldChange("title", value)}
                  onWordCount={setWordCount}
                  onDirty={handleEditorDirty}
                  onChange={handleEditorChange}
                  onError={showToast}
                  initialSelection={currentEditorViewState?.selection}
                  initialScrollTop={currentEditorViewState?.scrollTop}
                  onViewStateChange={handleEditorViewStateChange}
                  registerPendingFlush={registerEditorFlush}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <EmptyState
              workspaceOpen={workspaceRoot !== null}
              recentFiles={recentFiles}
              onOpenWorkspace={handleOpenWorkspace}
              onOpenRecent={handleOpenByPath}
            />
          )}
        </div>
        {selectedFile && (
          <PropertiesPanel
            frontmatter={parsedFrontmatter}
            visible={propertiesOpen}
            slug={selectedFile.name.replace(/\.mdx?$/, "")}
            coverImageVisible={coverImageVisible}
            onFieldChange={handlePublishAwareFieldChange}
            onToggleCoverImage={() => setCoverImageVisible((v) => !v)}
            onError={showToast}
          />
        )}
      </div>
      <StatusBar
        fileLabel={selectedFile ? getPathDisplayLabel(selectedFile) : null}
        wordCount={wordCount}
        resolvedTheme={resolvedTheme}
        saveStatus={saveStatus}
        zenMode={zenMode}
        typewriterMode={typewriterMode}
        sessionWordsAdded={sessionWordsAdded}
        wordCountGoal={wordCountGoal}
        fontFamily={prefs.fontFamily}
        fontSize={prefs.fontSize}
        spellCheck={prefs.spellCheck}
        gitBranch={isGitRepo ? currentBranch : null}
        gitBranchTitle={isGitRepo ? getGitBranchTitle(currentBranch, remoteInfo, t) : undefined}
        gitSyncLabel={gitSyncLabel}
        gitSyncTitle={gitSyncPopover?.description}
        gitChangeLabel={gitChangeSummary?.label}
        gitChangeTitle={gitChangeSummary?.title}
        gitSyncPopoverOpen={gitSyncPopoverOpen}
        onOpenBranches={() => void openBranchSwitcher()}
        onRenamePath={
          selectedFile && !selectedFile.isDirectory
            ? () => setModal({ type: "rename-path", node: selectedFile })
            : undefined
        }
        onOpenCommit={() => void openCommitDialog("Update")}
        onOpenGitSync={() => setGitSyncPopoverOpen((open) => !open)}
        onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
        onToggleZen={() => setZenMode((v) => !v)}
        onToggleTypewriter={() => setTypewriterMode((v) => !v)}
        onSetFontFamily={(f) => updatePrefs({ fontFamily: f })}
        onSetFontSize={(s) => updatePrefs({ fontSize: s })}
        onToggleSpellCheck={() => updatePrefs({ spellCheck: !prefs.spellCheck })}
        onSetWordCountGoal={setWordCountGoal}
      />
      {gitSyncPopoverOpen && gitSyncPopover && (
        <Suspense fallback={null}>
          <GitSyncPopover
            state={gitSyncPopover}
            onClose={() => setGitSyncPopoverOpen(false)}
            onAction={gitSyncPopover.actionLabel ? () => void handleGitSyncAction() : undefined}
          />
        </Suspense>
      )}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              {t.message}
            </div>
          ))}
        </div>
      )}
      {workspaceSwitcherOpen && (
        <Suspense fallback={null}>
          <WorkspaceSwitcher
            recentWorkspaces={recentWorkspaces}
            currentRootPath={workspaceRootPath}
            onSelect={(rootPath) => void openWorkspaceAtPath(rootPath)}
            onOpenOther={handleOpenWorkspace}
            onClose={() => setWorkspaceSwitcherOpen(false)}
          />
        </Suspense>
      )}
      {updateDialogOpen && (
        <Suspense fallback={null}>
          <UpdateDialog
            onBeforeRestart={flushPendingSave}
            onClose={() => setUpdateDialogOpen(false)}
          />
        </Suspense>
      )}
      {wechatPublishDialogOpen && selectedFile && (
        <Suspense fallback={null}>
          <WechatPublishDialog
            title={
              parsedFrontmatter.title != null
                ? String(parsedFrontmatter.title)
                : selectedFile.name.replace(/\.mdx?$/, "")
            }
            author={wechatAuthor}
            excerpt={wechatDigest}
            hasMath={wechatHasMath}
            imageCount={wechatImageCount}
            markdown={pendingMarkdownRef.current ?? parseFrontmatter(fileContent).body}
            baseDir={wechatBaseDir}
            assetRoot={assetRoot}
            coverImagePath={wechatCoverImagePath}
            existingMediaId={wechatMediaId}
            onClose={() => setWechatPublishDialogOpen(false)}
            onSuccess={(mediaId) => handleFieldChange("wechatMediaId", mediaId)}
          />
        </Suspense>
      )}
      {modal?.type === "rename-path" && (
        <Suspense fallback={null}>
          <RenamePathDialog
            {...getRenamePathDialogState(modal.node)}
            onConfirm={(name) => {
              void handleRename(modal.node, name);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {switcherOpen && (
        <Suspense fallback={null}>
          <FileSwitcher
            files={flatFiles}
            recentFiles={recentFiles}
            onSelect={(node) => {
              openFileByPath(node.path);
              setSwitcherOpen(false);
            }}
            onClose={() => setSwitcherOpen(false)}
          />
        </Suspense>
      )}
      {modal?.type === "new-file" && (
        <Suspense fallback={null}>
          <NewFileDialog
            contentTypes={contentTypes}
            preselectedType={modal.contentType}
            onConfirm={(name, contentType) => {
              void handleNewFile(modal.dirPath, name, contentType);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal?.type === "duplicate-file" && (
        <Suspense fallback={null}>
          <NewFileDialog
            contentTypes={[]}
            initialFilename={getDuplicateNameSuggestion(modal.node)}
            title={t("new_file_dialog.title_make_copy")}
            confirmLabel={t("new_file_dialog.copy")}
            showTypeSelector={false}
            onConfirm={(name) => {
              void handleDuplicate(modal.node, name);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal?.type === "new-from-existing" && (
        <Suspense fallback={null}>
          <NewFileDialog
            contentTypes={[]}
            initialFilename={getNewFromExistingNameSuggestion(modal.node)}
            title={t("new_file_dialog.title_new_from_existing")}
            confirmLabel={t("new_file_dialog.create")}
            showTypeSelector={false}
            onConfirm={(name) => {
              void handleNewFromExisting(modal.node, name);
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        </Suspense>
      )}
      {commitDialog && (
        <Suspense fallback={null}>
          <CommitDialog
            defaultMessage={commitDialog.message}
            branch={commitDialog.branch}
            changes={commitDialog.changes}
            onCommit={(message, selectedPaths, push) =>
              void handleCommitDialogCommit(message, selectedPaths, push)
            }
            onCancel={() => setCommitDialog(null)}
          />
        </Suspense>
      )}
      {branchSwitcher && (
        <Suspense fallback={null}>
          <BranchSwitcher
            branches={branchSwitcher.branches}
            remoteBranches={branchSwitcher.remoteBranches}
            remoteInfo={branchSwitcher.remoteInfo}
            onSelect={(branch) => void switchBranch(branch)}
            onSelectRemoteBranch={(remoteRef) => void checkoutRemoteBranch(remoteRef)}
            onCreateBranch={() => {
              closeBranchSwitcher();
              setNewBranchDialogOpen(true);
            }}
            onRenameBranch={(branch) => setRenameBranchDialog({ branch })}
            onDeleteBranch={(branch) => setDeleteBranchDialog({ branch })}
            onPushAndTrack={(remoteName) =>
              void runGitAction("push", () => handlePush(remoteName), "Pushed and set upstream")
            }
            onOpenRemote={(remoteName) => void openRemote(remoteName)}
            onCopyRemoteUrl={(remoteName) => void copyRemoteUrl(remoteName)}
            onClose={closeBranchSwitcher}
          />
        </Suspense>
      )}
      {newBranchDialogOpen && (
        <Suspense fallback={null}>
          <NewBranchDialog
            currentBranch={currentBranch}
            onConfirm={(branch) => void createBranch(branch)}
            onCancel={() => setNewBranchDialogOpen(false)}
          />
        </Suspense>
      )}
      {renameBranchDialog && (
        <Suspense fallback={null}>
          <RenameBranchDialog
            branch={renameBranchDialog.branch}
            onConfirm={(branch) => void renameBranch(renameBranchDialog.branch, branch)}
            onCancel={() => setRenameBranchDialog(null)}
          />
        </Suspense>
      )}
      {deleteBranchDialog && (
        <Suspense fallback={null}>
          <DeleteBranchDialog
            branch={deleteBranchDialog.branch}
            onConfirm={() => void deleteBranch(deleteBranchDialog.branch)}
            onCancel={() => setDeleteBranchDialog(null)}
          />
        </Suspense>
      )}
      {isPerfLoggingEnabled() && (
        <Suspense fallback={null}>
          <PerfPanel />
        </Suspense>
      )}
    </div>
  );
}

export default App;
