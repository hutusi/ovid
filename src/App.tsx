import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { CommitDialog } from "./components/CommitDialog";
import { Editor } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { FileSwitcher } from "./components/FileSwitcher";
import { NewFileDialog } from "./components/NewFileDialog";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SearchPanel } from "./components/SearchPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher";
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
type CommitDialogState = { message: string; branch: string } | null;

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
    renamingPath,
    setRenamingPath,
    handleOpenWorkspace,
    openWorkspaceAtPath,
    handleNewFile,
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
  const { gitStatusMap, isGitRepo, refreshGitStatus, handleCommit, getBranch } =
    useGit(workspaceRoot);
  const contentTypes = useContentTypes(workspaceRoot, isAmytisWorkspace);

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
    void openWorkspaceAtPath(recentWorkspaces[0].rootPath);
  }, [recentWorkspaces, openWorkspaceAtPath, workspaceRootPath]);

  // Reset session baseline when switching files (selectedFile is the trigger, not used in body)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile is the intended trigger
  useEffect(() => {
    setSessionBaseline(null);
    setBaselineCaptured(false);
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
            void getBranch()
              .then((branch) => {
                const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
                setCommitDialog({ message: `Update: ${title}`, branch });
              })
              .catch(() => showToast("Failed to get git branch"));
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
    workspaceRoot,
    tree,
    isGitRepo,
    getBranch,
    parsedFrontmatter,
    selectedFile,
    showToast,
    zenMode,
    modal,
    commitDialog,
    switcherOpen,
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
        modal !== null || commitDialog !== null || switcherOpen || workspaceSwitcherOpen;
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
        case "commit-push":
          if (!hasBlockingOverlay && isGitRepo) {
            void getBranch()
              .then((branch) => {
                const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
                setCommitDialog({ message: `Update: ${title}`, branch });
              })
              .catch(() => showToast("Failed to get git branch"));
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
    workspaceSwitcherOpen,
    workspaceRoot,
    tree,
    isGitRepo,
    getBranch,
    parsedFrontmatter,
    selectedFile,
    showToast,
    flushPendingSave,
    handleCloseFile,
    handleOpenWorkspace,
    prefs,
    updatePrefs,
  ]);

  const hasFrontmatter = Object.keys(parsedFrontmatter).length > 0;

  async function handlePublishAwareFieldChange(key: string, value: unknown) {
    await handleFieldChange(key, value as Parameters<typeof handleFieldChange>[1]);
    if (key === "draft" && value === false && isGitRepo) {
      try {
        const branch = await getBranch();
        const title = parsedFrontmatter.title ?? selectedFile?.name ?? "";
        setCommitDialog({ message: `Publish: ${title}`, branch });
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

  return (
    <div className="app" data-zen={zenMode ? "true" : undefined}>
      <div className="app-body">
        {searchOpen ? (
          <SearchPanel onOpenFile={handleOpenByPath} onClose={() => setSearchOpen(false)} />
        ) : (
          <Sidebar
            tree={tree}
            selectedPath={selectedFile?.path ?? null}
            renamingPath={renamingPath}
            visible={sidebarVisible}
            workspaceName={workspaceName}
            gitStatusMap={gitStatusMap}
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
          />
        )}
        <div className="editor-column">
          {selectedFile && hasFrontmatter && (
            <PropertiesPanel
              frontmatter={parsedFrontmatter}
              isOpen={propertiesOpen}
              onToggle={() => setPropertiesOpen((v) => !v)}
              onFieldChange={handlePublishAwareFieldChange}
            />
          )}
          {selectedFile ? (
            <Editor
              key={selectedFile.path}
              content={fileContent}
              filePath={selectedFile.path}
              typewriterMode={typewriterMode}
              spellCheck={prefs.spellCheck}
              onWordCount={setWordCount}
              onChange={handleEditorChange}
            />
          ) : (
            <EmptyState
              workspaceOpen={workspaceRoot !== null}
              recentFiles={recentFiles}
              onOpenWorkspace={handleOpenWorkspace}
              onOpenRecent={handleOpenByPath}
            />
          )}
        </div>
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
          onCommit={(message, push) => {
            void flushPendingSave()
              .then(() => handleCommit(message, push))
              .then(() => setCommitDialog(null))
              .catch((err) => showToast(`Commit failed: ${err}`));
          }}
          onCancel={() => setCommitDialog(null)}
        />
      )}
    </div>
  );
}

export default App;
