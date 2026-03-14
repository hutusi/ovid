import { useEffect, useState } from "react";
import { Editor } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { InputModal } from "./components/InputModal";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useFileEditor } from "./lib/useFileEditor";
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

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
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
        case "P":
          if (e.shiftKey) {
            e.preventDefault();
            setPropertiesOpen((v) => !v);
          }
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
  }, [flushPendingSave, handleCloseFile, handleOpenWorkspace, workspaceRoot]);

  const hasFrontmatter = Object.keys(parsedFrontmatter).length > 0;

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar
          tree={tree}
          selectedPath={selectedFile?.path ?? null}
          renamingPath={renamingPath}
          visible={sidebarVisible}
          workspaceName={workspaceName}
          workspaceRoot={workspaceRoot}
          onSelect={handleSelectFile}
          onOpenWorkspace={handleOpenWorkspace}
          onNewFile={(dirPath) => setModal({ type: "new-file", dirPath })}
          onRename={handleRename}
          onDelete={handleDelete}
          onStartRename={setRenamingPath}
          onCancelRename={() => setRenamingPath(null)}
        />
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
              onOpenWorkspace={handleOpenWorkspace}
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
