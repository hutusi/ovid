import { useEffect, useState } from "react";
import { CommitDialog } from "./components/CommitDialog";
import { Editor } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { FileSwitcher } from "./components/FileSwitcher";
import { NewFileDialog } from "./components/NewFileDialog";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SearchPanel } from "./components/SearchPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useContentTypes } from "./lib/useContentTypes";
import { useFileEditor } from "./lib/useFileEditor";
import { useGit } from "./lib/useGit";
import { useRecentFiles } from "./lib/useRecentFiles";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWorkspace } from "./lib/useWorkspace";
import "./styles/global.css";
import "./App.css";

type ModalState = { type: "new-file"; dirPath: string } | null;
type CommitDialogState = { message: string; branch: string } | null;

const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";

function App() {
  const { resolvedTheme, setPreference } = useTheme();
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== "false"
  );
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [commitDialog, setCommitDialog] = useState<CommitDialogState>(null);

  const { toasts, showToast } = useToast();

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
    isAmytisWorkspace,
    renamingPath,
    setRenamingPath,
    handleOpenWorkspace,
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
  const { gitStatusMap, isGitRepo, refreshGitStatus, handleCommit, getBranch } =
    useGit(workspaceRoot);
  const contentTypes = useContentTypes(workspaceRoot, isAmytisWorkspace);

  // Sync recent files list when workspace changes
  useEffect(() => {
    if (workspaceRoot) resetRecent(workspaceRoot);
  }, [workspaceRoot, resetRecent]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
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
          void handleOpenWorkspace();
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
        case "P":
          if (e.shiftKey) {
            e.preventDefault();
            setPropertiesOpen((v) => !v);
          }
          break;
        case "p":
          e.preventDefault();
          if (tree.length > 0) setSwitcherOpen(true);
          break;
        case "n":
          e.preventDefault();
          if (workspaceRoot) setModal({ type: "new-file", dirPath: workspaceRoot });
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
  ]);

  // Refresh git status after each save completes
  useEffect(() => {
    if (saveStatus === "saved" && isGitRepo) void refreshGitStatus();
  }, [saveStatus, isGitRepo, refreshGitStatus]);

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

  return (
    <div className="app">
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
            workspaceRoot={workspaceRoot}
            gitStatusMap={gitStatusMap}
            onSelect={(node) => {
              void handleSelectFile(node);
              if (!node.isDirectory) pushRecent(node);
            }}
            onOpenWorkspace={handleOpenWorkspace}
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
        onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
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
            setCommitDialog(null);
            void handleCommit(message, push).catch((err) => showToast(`Commit failed: ${err}`));
          }}
          onCancel={() => setCommitDialog(null)}
        />
      )}
    </div>
  );
}

export default App;
