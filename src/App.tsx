import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { StatusBar } from "./components/StatusBar";
import { FileNode } from "./lib/types";
import "./styles/global.css";
import "./App.css";

function App() {
  const [tree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [wordCount, setWordCount] = useState(0);

  function handleOpenWorkspace() {
    // TODO: integrate Tauri dialog to pick a folder
    console.log("open workspace");
  }

  function handleSelectFile(node: FileNode) {
    setSelectedFile(node);
    setWordCount(0);
  }

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar
          tree={tree}
          selectedPath={selectedFile?.path ?? null}
          onSelect={handleSelectFile}
          onOpenWorkspace={handleOpenWorkspace}
          workspaceName={null}
        />
        <Editor
          key={selectedFile?.path ?? "empty"}
          onWordCount={setWordCount}
        />
      </div>
      <StatusBar
        fileName={selectedFile?.name ?? null}
        wordCount={wordCount}
      />
    </div>
  );
}

export default App;
