import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "./commands";
import {
  type FrontmatterValue,
  joinFrontmatter,
  type ParsedFrontmatter,
  parseFrontmatter,
  parseYamlFrontmatter,
  serializeFrontmatter,
} from "./frontmatter";
import { setFrontmatterFieldValue } from "./frontmatterSchema";
import { measureAsync } from "./perf";
import type { FileNode, SaveStatus } from "./types";

const SAVE_DELAY_MS = 750;
type FlushMode = "blocking" | "background";

export function useFileEditor({ showToast }: { showToast: (msg: string) => void }) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<ParsedFrontmatter>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

  const frontmatterRef = useRef<string>("");
  const selectedPathRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);
  const editorFlushRef = useRef<(() => void) | null>(null);
  const inFlightWritesRef = useRef(new Set<Promise<void>>());
  // Tracks the full file content (frontmatter + body) as last written to or read from disk.
  // Used to distinguish our own saves from external changes in the workspace refresh loop.
  const lastSavedContentRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Best-effort flush on unmount — fire-and-forget since cleanup is synchronous
      const path = selectedPathRef.current;
      const markdown = pendingMarkdownRef.current;
      if (path && markdown !== null) {
        void commands.files.write({
          path,
          content: joinFrontmatter(frontmatterRef.current, markdown),
        });
      }
    };
  }, []);

  const trackWrite = useCallback((write: Promise<void>) => {
    inFlightWritesRef.current.add(write);
    write.finally(() => {
      inFlightWritesRef.current.delete(write);
    });
    return write;
  }, []);

  const awaitInFlightWrites = useCallback(async () => {
    const writes = Array.from(inFlightWritesRef.current);
    if (writes.length === 0) return;
    await Promise.all(writes);
  }, []);

  const writeMarkdown = useCallback(
    (
      path: string,
      markdown: string,
      perfName: "editor.writeFile" | "editor.flushPendingWrite" | "editor.writeFrontmatter"
    ) => {
      const diskContent = joinFrontmatter(frontmatterRef.current, markdown);
      return trackWrite(
        measureAsync(
          perfName,
          async () => {
            await commands.files.write({ path, content: diskContent });
            if (selectedPathRef.current === path) {
              lastSavedContentRef.current = diskContent;
            }
          },
          {
            contentLength: diskContent.length,
          }
        )
      );
    },
    [trackWrite]
  );

  const flushPendingSave = useCallback(
    async ({ mode = "blocking" }: { mode?: FlushMode } = {}) => {
      editorFlushRef.current?.();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const path = selectedPathRef.current;
      const markdown = pendingMarkdownRef.current;
      const pendingWrite =
        path && markdown !== null
          ? writeMarkdown(path, markdown, "editor.flushPendingWrite")
          : null;

      if (pendingWrite) {
        if (mode === "background") {
          pendingWrite.catch((err) => {
            console.error("Failed to flush pending save:", err);
            showToast(t("errors.save_failed"));
          });
        } else {
          try {
            await pendingWrite;
          } catch (err) {
            console.error("Failed to flush pending save:", err);
            showToast(t("errors.save_failed"));
            throw err;
          }
        }

        if (selectedPathRef.current === path && pendingMarkdownRef.current === markdown) {
          pendingMarkdownRef.current = null;
          setSaveStatus("saved");
        }
      }

      if (mode === "blocking") {
        try {
          await awaitInFlightWrites();
        } catch (err) {
          console.error("Failed to finish in-flight save:", err);
          showToast(t("errors.save_failed"));
          throw err;
        }
      }
    },
    [awaitInFlightWrites, showToast, t, writeMarkdown]
  );

  const resetFileState = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setWordCount(0);
    setParsedFrontmatter({});
    setSaveStatus("saved");
    frontmatterRef.current = "";
    selectedPathRef.current = null;
    pendingMarkdownRef.current = null;
    lastSavedContentRef.current = null;
  }, []);

  const handleCloseFile = useCallback(async () => {
    await flushPendingSave({ mode: "background" });
    resetFileState();
  }, [flushPendingSave, resetFileState]);

  async function handleSelectFile(node: FileNode) {
    await flushPendingSave({ mode: "background" });
    const prevPath = selectedPathRef.current;
    selectedPathRef.current = node.path;
    pendingMarkdownRef.current = null;

    try {
      const raw = await commands.files.read({ path: node.path });
      if (selectedPathRef.current !== node.path) return;
      const { frontmatter, body } = parseFrontmatter(raw);
      frontmatterRef.current = frontmatter;
      lastSavedContentRef.current = raw;
      // Update all state only after a successful read so a failure leaves the
      // previous file's metadata intact on screen.
      setWordCount(0);
      setParsedFrontmatter(parseYamlFrontmatter(frontmatter));
      setSaveStatus("saved");
      setFileContent(body);
      setSelectedFile(node);
    } catch (err) {
      console.error("Failed to read file:", err);
      showToast(t("errors.open_file_failed"));
      if (selectedPathRef.current === node.path) selectedPathRef.current = prevPath;
    }
  }

  const reloadSelectedFileFromDisk = useCallback(
    async (node: FileNode): Promise<boolean> => {
      if (selectedPathRef.current !== node.path) return false;

      try {
        const raw = await commands.files.read({ path: node.path });
        if (selectedPathRef.current !== node.path) return false;
        const { frontmatter, body } = parseFrontmatter(raw);
        frontmatterRef.current = frontmatter;
        lastSavedContentRef.current = raw;
        pendingMarkdownRef.current = null;
        setWordCount(0);
        setParsedFrontmatter(parseYamlFrontmatter(frontmatter));
        setSaveStatus("saved");
        setFileContent(body);
        setSelectedFile(node);
        return true;
      } catch (err) {
        console.error("Failed to reload file:", err);
        showToast(t("errors.reload_file_failed"));
        return false;
      }
    },
    [showToast, t]
  );

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
      setSaveStatus("saving");
      try {
        await writeMarkdown(pathToSave, snapshot, "editor.writeFile");
        if (pendingMarkdownRef.current === snapshot) {
          pendingMarkdownRef.current = null;
          setSaveStatus("saved");
        }
      } catch (err) {
        console.error("Failed to save file:", err);
        showToast(t("errors.save_failed"));
        // Roll back to unsaved so the dot doesn't sit on "saving" forever after
        // a failed write; the pending markdown is retained for the next attempt.
        if (pendingMarkdownRef.current === snapshot) setSaveStatus("unsaved");
      }
    }, SAVE_DELAY_MS);
  }

  const handleEditorDirty = useCallback(() => {
    setSaveStatus("unsaved");
  }, []);

  const registerEditorFlush = useCallback((flush: (() => void) | null) => {
    editorFlushRef.current = flush;
  }, []);

  async function handleFieldChange(key: string, value: FrontmatterValue) {
    if (!selectedFile) return;
    const updated = setFrontmatterFieldValue(parsedFrontmatter, key, value);
    setParsedFrontmatter(updated);
    const newFrontmatter = serializeFrontmatter(updated);
    frontmatterRef.current = newFrontmatter;

    let body: string;
    if (pendingMarkdownRef.current !== null) {
      body = pendingMarkdownRef.current;
    } else {
      try {
        const raw = await commands.files.read({ path: selectedFile.path });
        body = parseFrontmatter(raw).body;
      } catch (err) {
        console.error("Failed to read file body for frontmatter update:", err);
        showToast(t("errors.load_file_failed"));
        return;
      }
    }

    const filePath = selectedFile.path;
    // Route through writeMarkdown (which composes joinFrontmatter from the ref
    // we just set) so the write is tracked — flushPendingSave's
    // awaitInFlightWrites will wait for it, and lastSavedContentRef stays in
    // sync. A direct commands.files.write here would be invisible to the
    // save-coordination model and could be dropped by a concurrent
    // file-switch/close/quit.
    try {
      await writeMarkdown(filePath, body, "editor.writeFrontmatter");
    } catch (err) {
      console.error("Failed to save frontmatter:", err);
      showToast(t("errors.save_failed"));
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
    lastSavedContentRef,
    flushPendingSave,
    resetFileState,
    handleCloseFile,
    handleSelectFile,
    reloadSelectedFileFromDisk,
    handleEditorChange,
    handleEditorDirty,
    handleFieldChange,
    registerEditorFlush,
  };
}
