import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import { EmptyState } from "./components/EmptyState";
import { InputModal } from "./components/InputModal";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { Sidebar } from "./components/Sidebar";
import { type SaveStatus, StatusBar } from "./components/StatusBar";
import {
  createAmytisFrontmatter,
  type FrontmatterValue,
  joinFrontmatter,
  type ParsedFrontmatter,
  parseFrontmatter,
  parseYamlFrontmatter,
  serializeFrontmatter,
} from "./lib/frontmatter";
import type { FileNode } from "./lib/types";
import { useTheme } from "./lib/useTheme";
import "./styles/global.css";
import "./App.css";

interface WorkspaceResult {
  name: string;
  rootPath: string;
  treeRoot: string;
  tree: FileNode[];
}

interface Toast {
  id: number;
  message: string;
}

type ModalState = { type: "new-file"; dirPath: string } | null;

const SAVE_DELAY_MS = 750;
const SIDEBAR_VISIBLE_KEY = "ovid:sidebarVisible";

function App() {
  const { resolvedTheme, setPreference } = useTheme();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [wordCount, setWordCount] = useState(0);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<ParsedFrontmatter>({});
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(
    () => localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== "false"
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  const frontmatterRef = useRef<string>("");
  const selectedPathRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores the latest unsaved markdown so file switches can flush it
  const pendingMarkdownRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;

    const path = selectedPathRef.current;
    const markdown = pendingMarkdownRef.current;
    if (!path || markdown === null) return;

    pendingMarkdownRef.current = null;
    const diskContent = joinFrontmatter(frontmatterRef.current, markdown);
    try {
      await invoke("write_file", { path, content: diskContent });
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to flush pending save:", err);
      showToast("Failed to save — check console for details");
    }
  }, [showToast]);

  const handleCloseFile = useCallback(async () => {
    await flushPendingSave();
    setSelectedFile(null);
    setFileContent("");
    setWordCount(0);
    setParsedFrontmatter({});
    setSaveStatus("saved");
    frontmatterRef.current = "";
    selectedPathRef.current = null;
    pendingMarkdownRef.current = null;
  }, [flushPendingSave]);

  const refreshTree = useCallback(async (): Promise<FileNode[]> => {
    try {
      const updated = await invoke<FileNode[]>("list_workspace");
      setTree(updated);
      return updated;
    } catch (err) {
      console.error("Failed to refresh tree:", err);
      return [];
    }
  }, []);

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
  }, [flushPendingSave, handleCloseFile, workspaceRoot]);

  async function handleOpenWorkspace() {
    await flushPendingSave();
    const result = await invoke<WorkspaceResult | null>("open_workspace");
    if (result) {
      setTree(result.tree);
      setWorkspaceName(result.name);
      setWorkspaceRoot(result.treeRoot);
      setSelectedFile(null);
      setFileContent("");
      setWordCount(0);
      setParsedFrontmatter({});
      setSaveStatus("saved");
      frontmatterRef.current = "";
      selectedPathRef.current = null;
      pendingMarkdownRef.current = null;
    }
  }

  async function handleSelectFile(node: FileNode) {
    await flushPendingSave();
    setWordCount(0);
    setParsedFrontmatter({});
    setSaveStatus("saved");
    const prevPath = selectedPathRef.current;
    selectedPathRef.current = node.path;
    pendingMarkdownRef.current = null;

    try {
      const raw = await invoke<string>("read_file", { path: node.path });
      if (selectedPathRef.current !== node.path) return;
      const { frontmatter, body } = parseFrontmatter(raw);
      frontmatterRef.current = frontmatter;
      setSelectedFile(node);
      setFileContent(body);
      setParsedFrontmatter(parseYamlFrontmatter(raw));
    } catch (err) {
      console.error("Failed to read file:", err);
      showToast("Failed to open file — check console for details");
      if (selectedPathRef.current === node.path) selectedPathRef.current = prevPath;
    }
  }

  function handleEditorChange(markdown: string) {
    if (!selectedFile) return;
    const pathToSave = selectedFile.path;
    setSaveStatus("unsaved");
    pendingMarkdownRef.current = markdown;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      pendingMarkdownRef.current = null;
      const diskContent = joinFrontmatter(frontmatterRef.current, markdown);
      try {
        await invoke("write_file", { path: pathToSave, content: diskContent });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Failed to save file:", err);
        showToast("Failed to save — check console for details");
      }
    }, SAVE_DELAY_MS);
  }

  function findNode(nodes: FileNode[], path: string): FileNode | undefined {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) {
        const found = findNode(n.children, path);
        if (found) return found;
      }
    }
  }

  async function handleNewFile(dirPath: string, filename: string) {
    setModal(null);
    const slug = filename.replace(/\.md$/, "");
    const filePath = `${dirPath}/${slug}.md`;
    const content = createAmytisFrontmatter(slug);
    try {
      await invoke("create_file", { path: filePath, content });
      const updated = await refreshTree();
      const newNode = findNode(updated, filePath);
      if (newNode) await handleSelectFile(newNode);
    } catch (err) {
      console.error("Failed to create file:", err);
      showToast(`Failed to create file: ${err}`);
    }
  }

  async function handleRename(node: FileNode, newName: string) {
    setRenamingPath(null);
    const dir = node.path.substring(0, node.path.lastIndexOf("/"));
    const ext = node.extension ?? ".md";
    const newPath = `${dir}/${newName}${newName.endsWith(ext) ? "" : ext}`;
    try {
      await invoke("rename_file", { oldPath: node.path, newPath });
      const updated = await refreshTree();
      if (selectedFile?.path === node.path) {
        const renamed = findNode(updated, newPath);
        if (renamed) {
          selectedPathRef.current = newPath;
          setSelectedFile(renamed);
        }
      }
    } catch (err) {
      console.error("Failed to rename file:", err);
      showToast(`Failed to rename: ${err}`);
    }
  }

  async function handleDelete(node: FileNode) {
    const confirmed = window.confirm(`Move "${node.name}" to Trash?`);
    if (!confirmed) return;
    try {
      await invoke("trash_file", { path: node.path });
      if (selectedFile?.path === node.path) await handleCloseFile();
      await refreshTree();
    } catch (err) {
      console.error("Failed to delete file:", err);
      showToast(`Failed to delete: ${err}`);
    }
  }

  async function handleFieldChange(key: string, value: FrontmatterValue) {
    if (!selectedFile) return;
    const updated = { ...parsedFrontmatter, [key]: value };
    setParsedFrontmatter(updated);
    const newFrontmatter = serializeFrontmatter(updated);
    frontmatterRef.current = newFrontmatter;
    // Use the pending markdown if an edit is in flight, otherwise re-read body
    const body =
      pendingMarkdownRef.current ??
      (await invoke<string>("read_file", { path: selectedFile.path })
        .then((raw) => parseFrontmatter(raw).body)
        .catch(() => ""));
    try {
      await invoke("write_file", {
        path: selectedFile.path,
        content: joinFrontmatter(newFrontmatter, body),
      });
    } catch (err) {
      console.error("Failed to save frontmatter:", err);
      showToast("Failed to save — check console for details");
    }
  }

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
            <EmptyState workspaceOpen={tree.length > 0} onOpenWorkspace={handleOpenWorkspace} />
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
          onConfirm={(name) => handleNewFile(modal.dirPath, name)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default App;
