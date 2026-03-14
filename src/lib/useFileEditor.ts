import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FrontmatterValue,
  joinFrontmatter,
  type ParsedFrontmatter,
  parseFrontmatter,
  parseYamlFrontmatter,
  serializeFrontmatter,
} from "./frontmatter";
import type { FileNode, SaveStatus } from "./types";

const SAVE_DELAY_MS = 750;

export function useFileEditor({ showToast }: { showToast: (msg: string) => void }) {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<ParsedFrontmatter>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const frontmatterRef = useRef<string>("");
  const selectedPathRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;

    const path = selectedPathRef.current;
    const markdown = pendingMarkdownRef.current;
    if (!path || markdown === null) return;

    const diskContent = joinFrontmatter(frontmatterRef.current, markdown);
    try {
      await invoke("write_file", { path, content: diskContent });
      if (pendingMarkdownRef.current === markdown) {
        pendingMarkdownRef.current = null;
        setSaveStatus("saved");
      }
    } catch (err) {
      console.error("Failed to flush pending save:", err);
      showToast("Failed to save — check console for details");
    }
  }, [showToast]);

  const resetFileState = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setWordCount(0);
    setParsedFrontmatter({});
    setSaveStatus("saved");
    frontmatterRef.current = "";
    selectedPathRef.current = null;
    pendingMarkdownRef.current = null;
  }, []);

  const handleCloseFile = useCallback(async () => {
    await flushPendingSave();
    resetFileState();
  }, [flushPendingSave, resetFileState]);

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
      saveTimerRef.current = null;
      const snapshot = pendingMarkdownRef.current;
      if (snapshot === null) return;
      const diskContent = joinFrontmatter(frontmatterRef.current, snapshot);
      try {
        await invoke("write_file", { path: pathToSave, content: diskContent });
        if (pendingMarkdownRef.current === snapshot) {
          pendingMarkdownRef.current = null;
          setSaveStatus("saved");
        }
      } catch (err) {
        console.error("Failed to save file:", err);
        showToast("Failed to save — check console for details");
      }
    }, SAVE_DELAY_MS);
  }

  async function handleFieldChange(key: string, value: FrontmatterValue) {
    if (!selectedFile) return;
    const updated = { ...parsedFrontmatter, [key]: value };
    setParsedFrontmatter(updated);
    const newFrontmatter = serializeFrontmatter(updated);
    frontmatterRef.current = newFrontmatter;

    let body: string;
    if (pendingMarkdownRef.current !== null) {
      body = pendingMarkdownRef.current;
    } else {
      try {
        const raw = await invoke<string>("read_file", { path: selectedFile.path });
        body = parseFrontmatter(raw).body;
      } catch (err) {
        console.error("Failed to read file body for frontmatter update:", err);
        showToast("Failed to load file — check console for details");
        return;
      }
    }

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

  return {
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
    handleEditorChange,
    handleFieldChange,
  };
}
