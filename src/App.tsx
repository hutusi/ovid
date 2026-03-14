import { useEffect, useState } from "react";
import { Editor } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { FileSwitcher } from "./components/FileSwitcher";
import { InputModal } from "./components/InputModal";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SearchPanel } from "./components/SearchPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useFileEditor } from "./lib/useFileEditor";
import { useRecentFiles } from "./lib/useRecentFiles";
import { useTheme } from "./lib/useTheme";
import { useToast } from "./lib/useToast";
import { useWorkspace } from "./lib/useWorkspace";
import "./styles/global.css";
import "./App.css";

type ModalState = { type: "new-file"; dirPath: string } | null;

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
  }, [flushPendingSave, handleCloseFile, handleOpenWorkspace, workspaceRoot, tree]);

  const hasFrontmatter = Object.keys(parsedFrontmatter).length > 0;

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
              onFieldChange={handleFieldChange}
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
        <InputModal
          title="New file"
          placeholder="filename"
          confirmLabel="Create"
          onConfirm={(name) => {
            void handleNewFile(modal.dirPath, name);
            setModal(null);
          }}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default App;
