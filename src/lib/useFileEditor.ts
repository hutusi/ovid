import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "./commands";
import { EXTERNAL_CHANGE_CONFLICT, FILE_TOO_LARGE } from "./commands/files";
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
type WritePerfName = "editor.writeFile" | "editor.flushPendingWrite" | "editor.writeFrontmatter";

/** How the user chose to resolve an external-change conflict. */
export type ConflictResolution = "reload" | "overwrite" | "dismiss";

function isExternalChangeConflict(err: unknown): boolean {
  return err instanceof Error && err.message === EXTERNAL_CHANGE_CONFLICT;
}

function isFileTooLarge(err: unknown): boolean {
  return err instanceof Error && err.message === FILE_TOO_LARGE;
}

export function useFileEditor({
  showToast,
  onConflict,
}: {
  showToast: (msg: string) => void;
  /** Called when a save is refused because the file changed on disk, so the
   *  host can surface the conflict prompt. Resolve via `resolveConflict`. */
  onConflict?: () => void;
}) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<ParsedFrontmatter>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [conflictActive, setConflictActive] = useState(false);

  const frontmatterRef = useRef<string>("");
  const selectedPathRef = useRef<string | null>(null);
  const selectedFileRef = useRef<FileNode | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);
  const editorFlushRef = useRef<(() => void) | null>(null);
  const inFlightWritesRef = useRef(new Set<Promise<void>>());
  // Tracks the full file content (frontmatter + body) as last written to or read from disk.
  // Used to distinguish our own saves from external changes in the workspace refresh loop.
  const lastSavedContentRef = useRef<string | null>(null);
  // Optimistic-concurrency token: the file's mtime as last read/written. Passed
  // to write_file so it can refuse a save that would clobber an external change.
  const lastSavedMtimeRef = useRef<number | null>(null);
  // The (path, markdown) of the write that hit a conflict, so an "overwrite"
  // resolution can force exactly that content back through writeMarkdown.
  const conflictRetryRef = useRef<{ path: string; markdown: string } | null>(null);
  // Ref mirror of conflictActive so async write handlers can guard re-entrancy.
  const conflictActiveRef = useRef(false);

  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // Best-effort flush on unmount — fire-and-forget since cleanup is
      // synchronous. Passes the expected mtime so it won't clobber an external
      // change (the primary quit path is the blocking close-guard flush).
      const path = selectedPathRef.current;
      const markdown = pendingMarkdownRef.current;
      if (path && markdown !== null) {
        void commands.files
          .write({
            path,
            content: joinFrontmatter(frontmatterRef.current, markdown),
            expectedMtime: lastSavedMtimeRef.current,
          })
          .catch(() => {});
      }
    };
  }, []);

  const trackWrite = useCallback((write: Promise<void>) => {
    inFlightWritesRef.current.add(write);
    write
      .finally(() => {
        inFlightWritesRef.current.delete(write);
      })
      // The caller owns `write` and handles its rejection; swallow here so this
      // bookkeeping chain can't surface a rejected write as an unhandled
      // rejection (which the global error handler would otherwise toast).
      .catch(() => {});
    return write;
  }, []);

  const awaitInFlightWrites = useCallback(async () => {
    const writes = Array.from(inFlightWritesRef.current);
    if (writes.length === 0) return;
    await Promise.all(writes);
  }, []);

  const writeMarkdown = useCallback(
    (path: string, markdown: string, perfName: WritePerfName, opts?: { force?: boolean }) => {
      const diskContent = joinFrontmatter(frontmatterRef.current, markdown);
      const expectedMtime = opts?.force ? null : lastSavedMtimeRef.current;
      return trackWrite(
        measureAsync(
          perfName,
          async () => {
            try {
              const newMtime = await commands.files.write({
                path,
                content: diskContent,
                expectedMtime,
              });
              if (selectedPathRef.current === path) {
                lastSavedContentRef.current = diskContent;
                lastSavedMtimeRef.current = newMtime;
              }
            } catch (err) {
              // Remember what we tried to write so an "overwrite" resolution can
              // force exactly this content back to disk.
              if (isExternalChangeConflict(err) && selectedPathRef.current === path) {
                conflictRetryRef.current = { path, markdown };
              }
              throw err;
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

  const triggerConflict = useCallback(() => {
    if (conflictActiveRef.current) return;
    conflictActiveRef.current = true;
    setConflictActive(true);
    setSaveStatus("unsaved");
    onConflict?.();
  }, [onConflict]);

  const flushPendingSave = useCallback(
    async ({ mode = "blocking" }: { mode?: FlushMode } = {}) => {
      editorFlushRef.current?.();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const path = selectedPathRef.current;
      const markdown = pendingMarkdownRef.current;
      // Background flushes (file switch / close / window blur) are fire-and-
      // forget and clear the pending ref optimistically below — by the time the
      // write could reject we may have already switched files, so there's
      // nowhere to sanely resolve a conflict and the pending edit is gone.
      // Force those writes (matching pre-conflict-detection behaviour); conflict
      // detection stays on the interactive paths (autosave, and blocking flushes
      // from Cmd+S / the quit close-guard).
      const pendingWrite =
        path && markdown !== null
          ? writeMarkdown(path, markdown, "editor.flushPendingWrite", {
              force: mode === "background",
            })
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
            // Surface the conflict prompt, but still throw so the caller (e.g.
            // the close-guard) treats the save as failed and doesn't proceed to
            // clobber the external change.
            if (isExternalChangeConflict(err)) triggerConflict();
            else {
              console.error("Failed to flush pending save:", err);
              showToast(t("errors.save_failed"));
            }
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
          if (isExternalChangeConflict(err)) {
            triggerConflict();
          } else {
            console.error("Failed to finish in-flight save:", err);
            showToast(t("errors.save_failed"));
          }
          throw err;
        }
      }
    },
    [awaitInFlightWrites, showToast, t, triggerConflict, writeMarkdown]
  );

  const clearConflict = useCallback(() => {
    conflictActiveRef.current = false;
    conflictRetryRef.current = null;
    setConflictActive(false);
  }, []);

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
    lastSavedMtimeRef.current = null;
    clearConflict();
  }, [clearConflict]);

  const handleCloseFile = useCallback(async () => {
    await flushPendingSave({ mode: "background" });
    resetFileState();
  }, [flushPendingSave, resetFileState]);

  /** Load a file's content + its mtime token, applying it to editor state.
   *  Shared by first-open and external-reload. Returns false if the selection
   *  changed underneath us. Throws if the read fails (caller toasts). */
  const applyDiskContent = useCallback(
    async (node: FileNode): Promise<boolean> => {
      const raw = await commands.files.read({ path: node.path });
      if (selectedPathRef.current !== node.path) return false;
      const mtime = await commands.files.getMtime({ path: node.path }).catch(() => null);
      if (selectedPathRef.current !== node.path) return false;
      const { frontmatter, body } = parseFrontmatter(raw);
      frontmatterRef.current = frontmatter;
      lastSavedContentRef.current = raw;
      lastSavedMtimeRef.current = mtime;
      pendingMarkdownRef.current = null;
      clearConflict();
      // Update all state only after a successful read so a failure leaves the
      // previous file's metadata intact on screen.
      setWordCount(0);
      setParsedFrontmatter(parseYamlFrontmatter(frontmatter));
      setSaveStatus("saved");
      setFileContent(body);
      setSelectedFile(node);
      return true;
    },
    [clearConflict]
  );

  async function handleSelectFile(node: FileNode) {
    await flushPendingSave({ mode: "background" });
    const prevPath = selectedPathRef.current;
    selectedPathRef.current = node.path;
    pendingMarkdownRef.current = null;

    try {
      await applyDiskContent(node);
    } catch (err) {
      console.error("Failed to read file:", err);
      showToast(t(isFileTooLarge(err) ? "errors.file_too_large" : "errors.open_file_failed"));
      if (selectedPathRef.current === node.path) selectedPathRef.current = prevPath;
    }
  }

  const reloadSelectedFileFromDisk = useCallback(
    async (node: FileNode): Promise<boolean> => {
      if (selectedPathRef.current !== node.path) return false;
      try {
        return await applyDiskContent(node);
      } catch (err) {
        console.error("Failed to reload file:", err);
        showToast(t(isFileTooLarge(err) ? "errors.file_too_large" : "errors.reload_file_failed"));
        return false;
      }
    },
    [applyDiskContent, showToast, t]
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
        if (isExternalChangeConflict(err)) {
          // Pause autosave and prompt; the pending markdown is retained so
          // "overwrite" can force it and "dismiss" retries on the next save.
          if (pendingMarkdownRef.current === snapshot) setSaveStatus("unsaved");
          triggerConflict();
          return;
        }
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
      if (isExternalChangeConflict(err)) {
        triggerConflict();
        return;
      }
      console.error("Failed to save frontmatter:", err);
      showToast(t("errors.save_failed"));
    }
  }

  const resolveConflict = useCallback(
    async (resolution: ConflictResolution) => {
      conflictActiveRef.current = false;
      setConflictActive(false);
      const retry = conflictRetryRef.current;
      conflictRetryRef.current = null;

      if (resolution === "reload") {
        const node = selectedFileRef.current;
        if (node) await reloadSelectedFileFromDisk(node);
        return;
      }
      if (resolution === "overwrite") {
        if (!retry) return;
        setSaveStatus("saving");
        try {
          await writeMarkdown(retry.path, retry.markdown, "editor.writeFile", { force: true });
          if (selectedPathRef.current === retry.path) {
            if (pendingMarkdownRef.current !== null) pendingMarkdownRef.current = null;
            setSaveStatus("saved");
          }
        } catch (err) {
          console.error("Failed to overwrite on conflict:", err);
          showToast(t("errors.save_failed"));
          setSaveStatus("unsaved");
        }
        return;
      }
      // "dismiss": leave the file unsaved; a later save re-triggers the prompt.
      setSaveStatus("unsaved");
    },
    [reloadSelectedFileFromDisk, writeMarkdown, showToast, t]
  );

  return {
    selectedFile,
    setSelectedFile,
    fileContent,
    wordCount,
    setWordCount,
    parsedFrontmatter,
    saveStatus,
    conflictActive,
    resolveConflict,
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
