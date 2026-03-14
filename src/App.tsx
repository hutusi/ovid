import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { StatusBar } from "./components/StatusBar";
import { FileNode } from "./lib/types";
import { parseFrontmatter, joinFrontmatter, parseYamlFrontmatter, ParsedFrontmatter } from "./lib/frontmatter";
import { useTheme } from "./lib/useTheme";
import "./styles/global.css";
import "./App.css";

interface WorkspaceResult {
  name: string;
  rootPath: string;
  tree: FileNode[];
}

const SAVE_DELAY_MS = 750;

function App() {
  const { resolvedTheme, setPreference } = useTheme();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [wordCount, setWordCount] = useState(0);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<ParsedFrontmatter>({});
  const [propertiesOpen, setPropertiesOpen] = useState(true);

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

  async function flushPendingSave() {
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
    } catch (err) {
      console.error("Failed to flush pending save:", err);
    }
  }

  async function handleOpenWorkspace() {
    await flushPendingSave();
    const result = await invoke<WorkspaceResult | null>("open_workspace");
    if (result) {
      setTree(result.tree);
      setWorkspaceName(result.name);
      setSelectedFile(null);
      setFileContent("");
      setWordCount(0);
      setParsedFrontmatter({});
      frontmatterRef.current = "";
      selectedPathRef.current = null;
      pendingMarkdownRef.current = null;
    }
  }

  async function handleSelectFile(node: FileNode) {
    // Flush any pending save for the outgoing file before switching
    await flushPendingSave();

    setSelectedFile(node);
    setFileContent("");
    setWordCount(0);
    setParsedFrontmatter({});
    selectedPathRef.current = node.path;
    pendingMarkdownRef.current = null;

    try {
      const raw = await invoke<string>("read_file", { path: node.path });
      if (selectedPathRef.current !== node.path) return;
      const { frontmatter, body } = parseFrontmatter(raw);
      frontmatterRef.current = frontmatter;
      setFileContent(body);
      setParsedFrontmatter(parseYamlFrontmatter(raw));
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  }

  function handleEditorChange(markdown: string) {
    if (!selectedFile) return;
    // Capture path now — selectedFile state may change before timeout fires
    const pathToSave = selectedFile.path;
    pendingMarkdownRef.current = markdown;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      pendingMarkdownRef.current = null;
      const diskContent = joinFrontmatter(frontmatterRef.current, markdown);
      try {
        await invoke("write_file", { path: pathToSave, content: diskContent });
      } catch (err) {
        console.error("Failed to save file:", err);
      }
    }, SAVE_DELAY_MS);
  }

  const hasFrontmatter = Object.keys(parsedFrontmatter).length > 0;

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar
          tree={tree}
          selectedPath={selectedFile?.path ?? null}
          onSelect={handleSelectFile}
          onOpenWorkspace={handleOpenWorkspace}
          workspaceName={workspaceName}
        />
        <div className="editor-column">
          {selectedFile && hasFrontmatter && (
            <PropertiesPanel
              frontmatter={parsedFrontmatter}
              isOpen={propertiesOpen}
              onToggle={() => setPropertiesOpen((v) => !v)}
            />
          )}
          <Editor
            key={selectedFile?.path ?? "empty"}
            content={fileContent}
            onWordCount={setWordCount}
            onChange={handleEditorChange}
          />
        </div>
      </div>
      <StatusBar
        fileName={selectedFile?.name ?? null}
        wordCount={wordCount}
        resolvedTheme={resolvedTheme}
        onToggleTheme={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}
      />
    </div>
  );
}

export default App;
