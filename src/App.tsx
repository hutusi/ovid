import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { BranchSwitcher } from "./components/BranchSwitcher";
import { CommitDialog } from "./components/CommitDialog";
import { Editor } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FileSwitcher } from "./components/FileSwitcher";
import { NewBranchDialog } from "./components/NewBranchDialog";
import { NewFileDialog } from "./components/NewFileDialog";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SearchPanel } from "./components/SearchPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
import { findNodeByPath, loadLastRecentFilePath } from "./lib/appRestore";
import { getGitBranchTitle, getGitSyncLabel, getPushSuccessMessage } from "./lib/gitUi";
import { resolveImageSrc } from "./lib/imageUtils";
import type { GitBranch, GitCommitChange, GitRemoteInfo } from "./lib/types";
import { useContentTypes } from "./lib/useContentTypes";
import { useEditorPreferences } from "./lib/useEditorPreferences";
import { useFileEditor } from "./lib/useFileEditor";
import { useGit } from "./lib/useGit";
import { useRecentFiles } from "./lib/useRecentFiles";
import { useRecentWorkspaces } from "./lib/useRecentWorkspaces";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWordCountGoal } from "./lib/useWordCountGoal";
import { useWorkspace } from "./lib/useWorkspace";
import "./styles/global.css";
import "./App.css";

type ModalState = { type: "new-file"; dirPath: string; contentType?: string } | null;
type CommitDialogState = { message: string; branch: string; changes: GitCommitChange[] } | null;
type BranchSwitcherState = { branches: GitBranch[]; remoteInfo: GitRemoteInfo } | null;

const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";
const AUTO_REOPEN_KEY = "ovid:skipAutoReopen";

function App() {
  const { resolvedTheme, setPreference } = useTheme();
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== "false"
  );
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [sessionBaseline, setSessionBaseline] = useState<number | null>(null);
  const [baselineCaptured, setBaselineCaptured] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commitDialog, setCommitDialog] = useState<CommitDialogState>(null);
  const [branchSwitcher, setBranchSwitcher] = useState<BranchSwitcherState>(null);
  const [newBranchDialogOpen, setNewBranchDialogOpen] = useState(false);
  const [coverImageVisible, setCoverImageVisible] = useState(false);
  const pendingAutoOpenPath = useRef<string | null>(null);

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
    flushPendingSave,
    resetFileState,
    handleCloseFile,
    handleSelectFile,
    handleEditorChange,
    handleFieldChange,
  } = useFileEditor({ showToast });

  const {
    tree,
    workspaceName,
    workspaceRoot,
    workspaceRootPath,
    isAmytisWorkspace,
    assetRoot,
    cdnBase,
    renamingPath,
    setRenamingPath,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleNewFile,
    handleNewTodayFlow,
    handleRename,
    handleDelete,
  } = useWorkspace({
    showToast,
    flushPendingSave,
    handleCloseFile,
    handleSelectFile,
    selectedFile,
    selectedPathRef,
    setSelectedFile,
    resetFileState,
  });

  const { recentFiles, pushRecent, resetRecent } = useRecentFiles(workspaceRoot);
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
    handleOpenRemote,
    getCommitChanges,
    getBranch,
    getBranches,
    getRemoteInfo,
  } = useGit(workspaceRoot);
  const contentTypes = useContentTypes(workspaceRoot, isAmytisWorkspace);

  const openCommitDialog = useCallback(
    async (message: string) => {
      try {
        const [branch, changes] = await Promise.all([getBranch(), getCommitChanges()]);
        if (changes.length === 0) {
          showToast("No git changes to commit");
          return;
        }
        setCommitDialog({ message, branch, changes });
      } catch {
        showToast("Failed to load git changes");
      }
    },
    [getBranch, getCommitChanges, showToast]
  );

  const runGitAction = useCallback(
    async (action: "push" | "pull" | "fetch", run: () => Promise<void>, successMessage: string) => {
      try {
        await flushPendingSave();
        await run();
        showToast(successMessage);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`${action} failed: ${message}`);
      }
    },
    [flushPendingSave, showToast]
  );

  const pushSuccessMessage = getPushSuccessMessage(remoteInfo);

  const reloadWorkspaceAfterGitChange = useCallback(async () => {
    if (!workspaceRootPath) return;
    await openWorkspaceAtPath(workspaceRootPath);
  }, [openWorkspaceAtPath, workspaceRootPath]);

  const openBranchSwitcher = useCallback(async () => {
    try {
      const [branches, remote] = await Promise.all([getBranches(), getRemoteInfo()]);
      if (branches.length === 0) {
        showToast("No local branches found");
        return;
      }
      setBranchSwitcher({ branches, remoteInfo: remote });
    } catch {
      showToast("Failed to load branches");
    }
  }, [getBranches, getRemoteInfo, showToast]);

  const copyRemoteUrl = useCallback(
    async (remoteName?: string) => {
      const targetRemote =
        remoteName != null
          ? (remoteInfo.remotes.find((remote) => remote.name === remoteName) ?? null)
          : null;
      const remoteUrl = targetRemote?.url ?? remoteInfo.remoteUrl;
      if (!remoteUrl) {
        showToast(
          remoteName ? `No remote URL configured for ${remoteName}` : "No remote URL configured"
        );
        return;
      }
      try {
        await navigator.clipboard.writeText(remoteUrl);
        showToast("Copied remote URL");
      } catch {
        showToast("Failed to copy remote URL");
      }
    },
    [remoteInfo.remoteUrl, remoteInfo.remotes, showToast]
  );

  const openRemote = useCallback(
    async (remoteName?: string) => {
      try {
        await handleOpenRemote(remoteName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Open remote failed: ${message}`);
      }
    },
    [handleOpenRemote, showToast]
  );

  const switchBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleSwitchBranch(branch);
        setBranchSwitcher(null);
        setNewBranchDialogOpen(false);
        await reloadWorkspaceAfterGitChange();
        showToast(`Switched to ${branch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Switch branch failed: ${message}`);
      }
    },
    [flushPendingSave, handleSwitchBranch, reloadWorkspaceAfterGitChange, showToast]
  );

  const createBranch = useCallback(
    async (branch: string) => {
      try {
        await flushPendingSave();
        await handleCreateBranch(branch);
        setNewBranchDialogOpen(false);
        setBranchSwitcher(null);
        await reloadWorkspaceAfterGitChange();
        showToast(`Created and switched to ${branch}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Create branch failed: ${message}`);
      }
    },
    [flushPendingSave, handleCreateBranch, reloadWorkspaceAfterGitChange, showToast]
  );

  // Sync recent files list when workspace changes
  useEffect(() => {
    if (workspaceRoot) resetRecent(workspaceRoot);
  }, [workspaceRoot, resetRecent]);

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
    const node = findNodeByPath(tree, path);
    pendingAutoOpenPath.current = null;
    if (!node || node.isDirectory) return;
    void handleSelectFile(node);
    pushRecent(node);
  }, [tree, selectedFile, handleSelectFile, pushRecent]);

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
      // Escape exits zen mode (before other guards)
      if (
        e.key === "Escape" &&
        zenMode &&
        !modal &&
        !commitDialog &&
        !switcherOpen &&
        !branchSwitcher &&
        !newBranchDialogOpen &&
        !workspaceSwitcherOpen
      ) {
        setZenMode(false);
        return;
      }
      if (!e.metaKey && !e.ctrlKey) return;
      // Ctrl+Cmd+Z — zen mode (macOS); avoids conflict with Redo (Cmd+Shift+Z)
      if (e.metaKey && e.ctrlKey && e.key === "z") {
        e.preventDefault();
        setZenMode((v) => !v);
        return;
      }
      // Mode toggles work even when editor has focus
      if (e.shiftKey && e.key === "P") {
        e.preventDefault();
        setPropertiesOpen((v) => !v);
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      )
        return;
      switch (e.key) {
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
        case "F":
          if (e.shiftKey) {
            e.preventDefault();
            if (workspaceRoot) setSearchOpen((v) => !v);
          }
          break;
        case "G":
          if (e.shiftKey && isGitRepo) {
            e.preventDefault();
            const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
            void openCommitDialog(`Update: ${title}`);
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
        case "T":
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
          void handleCloseFile();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    flushPendingSave,
    handleCloseFile,
    handleOpenWorkspace,
    handleNewTodayFlow,
    workspaceRoot,
    tree,
    isGitRepo,
    openCommitDialog,
    parsedFrontmatter,
    selectedFile,
    zenMode,
    modal,
    commitDialog,
    switcherOpen,
    branchSwitcher,
    newBranchDialogOpen,
    workspaceSwitcherOpen,
  ]);

  // Refresh git status after each save completes
  useEffect(() => {
    if (saveStatus === "saved" && isGitRepo) void refreshGitStatus();
  }, [saveStatus, isGitRepo, refreshGitStatus]);

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
        workspaceSwitcherOpen;
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
          void handleCloseFile();
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
        case "git-commit":
          if (!hasBlockingOverlay && isGitRepo) {
            const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
            void openCommitDialog(`Update: ${title}`);
          }
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
    workspaceSwitcherOpen,
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
    parsedFrontmatter,
    selectedFile,
    flushPendingSave,
    handleCloseFile,
    handleOpenWorkspace,
    handleNewTodayFlow,
    prefs,
    updatePrefs,
  ]);

  const hasFrontmatter = Object.keys(parsedFrontmatter).length > 0;
  const coverImagePath =
    parsedFrontmatter.coverImage != null && parsedFrontmatter.coverImage !== ""
      ? String(parsedFrontmatter.coverImage)
      : undefined;

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
    const node = tree
      .flatMap(function flatten(n): typeof tree {
        return n.isDirectory ? (n.children ?? []).flatMap(flatten) : [n];
      })
      .find((n) => n.path === path);
    if (node) {
      void handleSelectFile(node);
      pushRecent(node);
      setSearchOpen(false);
    }
  }

  const sessionWordsAdded = sessionBaseline !== null ? Math.max(0, wordCount - sessionBaseline) : 0;
  const gitSyncLabel = isGitRepo ? getGitSyncLabel(remoteInfo) : null;

  return (
    <div className="app" data-zen={zenMode ? "true" : undefined}>
      <div className="app-body">
        {searchOpen ? (
          <SearchPanel onOpenFile={handleOpenByPath} onClose={() => setSearchOpen(false)} />
        ) : (
          <Sidebar
            tree={tree}
            workspaceKey={workspaceRootPath}
            selectedPath={selectedFile?.path ?? null}
            renamingPath={renamingPath}
            visible={sidebarVisible}
            workspaceName={workspaceName}
            gitStatusMap={gitStatusMap}
            gitBranch={isGitRepo ? currentBranch : null}
            gitRemoteInfo={isGitRepo ? remoteInfo : undefined}
            onSelect={(node) => {
              void handleSelectFile(node);
              if (!node.isDirectory) pushRecent(node);
            }}
            onOpenWorkspace={handleOpenWorkspace}
            onOpenSwitcher={() => setWorkspaceSwitcherOpen(true)}
            onNewFile={(dirPath) => setModal({ type: "new-file", dirPath })}
            onRename={handleRename}
            onDelete={handleDelete}
            onStartRename={setRenamingPath}
            onCancelRename={() => setRenamingPath(null)}
            onGitCommit={() => {
              const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
              void openCommitDialog(`Update: ${title}`);
            }}
            onGitPush={() => void runGitAction("push", () => handlePush(), pushSuccessMessage)}
            onGitPull={() => void runGitAction("pull", handlePull, "Pulled latest changes")}
            onGitFetch={() => void runGitAction("fetch", handleFetch, "Fetched remote updates")}
            onGitOpenRemote={() => void openRemote()}
            onGitCopyRemoteUrl={() => void copyRemoteUrl()}
          />
        )}
        <div className="editor-column">
          {selectedFile && coverImageVisible && coverImagePath && (
            <div className="cover-image-banner">
              <img
                src={resolveImageSrc(coverImagePath, selectedFile.path, assetRoot, cdnBase)}
                alt={parsedFrontmatter.title ? String(parsedFrontmatter.title) : ""}
              />
            </div>
          )}
          {selectedFile ? (
            <ErrorBoundary key={selectedFile.path}>
              <Editor
                key={selectedFile.path}
                content={fileContent}
                filePath={selectedFile.path}
                assetRoot={assetRoot}
                cdnBase={cdnBase}
                typewriterMode={typewriterMode}
                spellCheck={prefs.spellCheck}
                onWordCount={setWordCount}
                onChange={handleEditorChange}
                onError={showToast}
              />
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
        {selectedFile && hasFrontmatter && (
          <PropertiesPanel
            frontmatter={parsedFrontmatter}
            visible={propertiesOpen}
            slug={selectedFile.name.replace(/\.mdx?$/, "")}
            coverImageVisible={coverImageVisible}
            onFieldChange={handlePublishAwareFieldChange}
            onToggleCoverImage={() => setCoverImageVisible((v) => !v)}
          />
        )}
      </div>
      <StatusBar
        fileName={selectedFile?.name ?? null}
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
        gitBranchTitle={isGitRepo ? getGitBranchTitle(currentBranch, remoteInfo) : undefined}
        gitSyncLabel={gitSyncLabel}
        onOpenBranches={() => void openBranchSwitcher()}
        onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
        onToggleZen={() => setZenMode((v) => !v)}
        onToggleTypewriter={() => setTypewriterMode((v) => !v)}
        onSetFontFamily={(f) => updatePrefs({ fontFamily: f })}
        onSetFontSize={(s) => updatePrefs({ fontSize: s })}
        onToggleSpellCheck={() => updatePrefs({ spellCheck: !prefs.spellCheck })}
        onSetWordCountGoal={setWordCountGoal}
      />
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
        <WorkspaceSwitcher
          recentWorkspaces={recentWorkspaces}
          currentRootPath={workspaceRootPath}
          onSelect={(rootPath) => void openWorkspaceAtPath(rootPath)}
          onOpenOther={handleOpenWorkspace}
          onClose={() => setWorkspaceSwitcherOpen(false)}
        />
      )}
      {switcherOpen && (
        <FileSwitcher
          tree={tree}
          recentFiles={recentFiles}
          onSelect={(node) => {
            void handleSelectFile(node);
            pushRecent(node);
            setSwitcherOpen(false);
          }}
          onClose={() => setSwitcherOpen(false)}
        />
      )}
      {modal?.type === "new-file" && (
        <NewFileDialog
          contentTypes={contentTypes}
          preselectedType={modal.contentType}
          onConfirm={(name, contentType) => {
            void handleNewFile(modal.dirPath, name, contentType);
            setModal(null);
          }}
          onCancel={() => setModal(null)}
        />
      )}
      {commitDialog && (
        <CommitDialog
          defaultMessage={commitDialog.message}
          branch={commitDialog.branch}
          changes={commitDialog.changes}
          onCommit={(message, selectedPaths, push) => {
            void flushPendingSave()
              .then(() => handleCommit(message, selectedPaths, push))
              .then(() => setCommitDialog(null))
              .catch((err) => showToast(`Commit failed: ${err}`));
          }}
          onCancel={() => setCommitDialog(null)}
        />
      )}
      {branchSwitcher && (
        <BranchSwitcher
          branches={branchSwitcher.branches}
          remoteInfo={branchSwitcher.remoteInfo}
          onSelect={(branch) => void switchBranch(branch)}
          onCreateBranch={() => {
            setBranchSwitcher(null);
            setNewBranchDialogOpen(true);
          }}
          onPushAndTrack={(remoteName) =>
            void runGitAction("push", () => handlePush(remoteName), "Pushed and set upstream")
          }
          onOpenRemote={(remoteName) => void openRemote(remoteName)}
          onCopyRemoteUrl={(remoteName) => void copyRemoteUrl(remoteName)}
          onClose={() => setBranchSwitcher(null)}
        />
      )}
      {newBranchDialogOpen && (
        <NewBranchDialog
          currentBranch={currentBranch}
          onConfirm={(branch) => void createBranch(branch)}
          onCancel={() => setNewBranchDialogOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
