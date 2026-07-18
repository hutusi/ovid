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
import { frontmatterLineOffset as computeFrontmatterLineOffset } from "./searchJump";
import type { FileNode, SaveStatus } from "./types";

const SAVE_DELAY_MS = 750;
// Property-panel/title edits rewrite the whole file; coalesce keystrokes on a
// shorter debounce than body autosave so the panel still feels immediate.
const FIELD_SAVE_DELAY_MS = 300;
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
  // Lines the current file's frontmatter occupies. Set atomically with
  // fileContent in applyDiskContent so a search jump maps its full-file line
  // number to a body line using this file's offset, never the previous one.
  const [frontmatterLineOffset, setFrontmatterLineOffset] = useState(0);
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
  // Tail of the write queue per file path — see enqueueWrite.
  const writeChainsRef = useRef(new Map<string, Promise<void>>());
  // What the chain most recently wrote to each path (content + mtime). Lets a
  // write that starts after its file was deselected compose against what
  // actually landed, instead of a stale queue-time snapshot; entries live only
  // while the path's chain is non-empty.
  const lastWrittenByPathRef = useRef(new Map<string, { content: string; version: number }>());
  // Tracks the full file content (frontmatter + body) as last written to or read from disk.
  // Used to distinguish our own saves from external changes in the workspace refresh loop.
  const lastSavedContentRef = useRef<string | null>(null);
  // Optimistic-concurrency token: the file's content-hash version as last
  // read/written. Passed to write_file so it can refuse a save that would
  // clobber an external change.
  const lastSavedVersionRef = useRef<number | null>(null);
  // The (path, markdown) of the write that hit a conflict, so an "overwrite"
  // resolution can force exactly that content back through writeMarkdown.
  const conflictRetryRef = useRef<{ path: string; markdown: string } | null>(null);
  // Ref mirror of conflictActive so async write handlers can guard re-entrancy.
  const conflictActiveRef = useRef(false);
  // Debounced property-panel/title edit awaiting its write, captured as a
  // (path, body, frontmatter) snapshot at edit time so a file switch can't
  // bleed the next file's state into the write.
  const pendingFieldSaveRef = useRef<{ path: string; body: string; frontmatter: string } | null>(
    null
  );
  const fieldSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  /** Start `start` only after every earlier write to the same path has
   *  settled. Autosave, frontmatter edits, and flushes can otherwise overlap
   *  in flight, letting an older payload land on disk after a newer one (or
   *  trip the mtime check against our own previous write). A failed
   *  predecessor doesn't block successors; the returned promise reflects this
   *  write alone. */
  const enqueueWrite = useCallback((path: string, start: () => Promise<void>) => {
    const prev = writeChainsRef.current.get(path);
    const write = prev ? prev.catch(() => {}).then(start) : start();
    writeChainsRef.current.set(path, write);
    inFlightWritesRef.current.add(write);
    write
      .finally(() => {
        inFlightWritesRef.current.delete(write);
        if (writeChainsRef.current.get(path) === write) {
          writeChainsRef.current.delete(path);
          lastWrittenByPathRef.current.delete(path);
        }
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
    (
      path: string,
      markdown: string | (() => string),
      perfName: WritePerfName,
      opts?: { force?: boolean; frontmatter?: string }
    ) => {
      // Queue-time snapshots, refreshed at start time only while `path` is
      // still the selected file — the refs then still describe this file (an
      // earlier queued write may have advanced the version token). After a
      // switch the refs describe the newly-opened file and must not bleed
      // into a write that is still queued for the previous one; such a write
      // falls back to what the chain last wrote (or these snapshots).
      const queuedFrontmatter = opts?.frontmatter ?? frontmatterRef.current;
      const queuedVersion = lastSavedVersionRef.current;
      return enqueueWrite(path, () => {
        const stillSelected = selectedPathRef.current === path;
        // A thunk body (debounced field save) resolves once predecessors have
        // settled, so it composes against the freshest body — not the one from
        // when the edit was made.
        const body = typeof markdown === "function" ? markdown() : markdown;
        const frontmatter =
          stillSelected && opts?.frontmatter === undefined
            ? frontmatterRef.current
            : queuedFrontmatter;
        const diskContent = joinFrontmatter(frontmatter, body);
        const lastWritten = lastWrittenByPathRef.current.get(path);
        const expectedVersion = opts?.force
          ? null
          : stillSelected
            ? lastSavedVersionRef.current
            : (lastWritten?.version ?? queuedVersion);
        return measureAsync(
          perfName,
          async () => {
            try {
              const newVersion = await commands.files.write({
                path,
                content: diskContent,
                expectedVersion,
              });
              lastWrittenByPathRef.current.set(path, { content: diskContent, version: newVersion });
              if (selectedPathRef.current === path) {
                lastSavedContentRef.current = diskContent;
                lastSavedVersionRef.current = newVersion;
              }
            } catch (err) {
              // Remember what we tried to write so an "overwrite" resolution can
              // force exactly this content back to disk.
              if (isExternalChangeConflict(err) && selectedPathRef.current === path) {
                conflictRetryRef.current = { path, markdown: body };
              }
              throw err;
            }
          },
          {
            contentLength: diskContent.length,
          }
        );
      });
    },
    [enqueueWrite]
  );

  // Best-effort flush on unmount. Declared after writeMarkdown so it can route
  // through it — fire-and-forget (cleanup is synchronous) but still chained
  // behind any in-flight write to the same path (never landing stale-last) and
  // non-forced so it won't clobber an external change. The primary quit path
  // is the blocking close-guard flush.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (fieldSaveTimerRef.current) clearTimeout(fieldSaveTimerRef.current);
      const path = selectedPathRef.current;
      const markdown = pendingMarkdownRef.current;
      if (path && markdown !== null) {
        writeMarkdown(path, markdown, "editor.flushPendingWrite").catch(() => {});
      } else if (pendingFieldSaveRef.current) {
        // Field-only edit still in its debounce window (the pending field save
        // can only belong to the selected file — any switch/close flushed it).
        const pending = pendingFieldSaveRef.current;
        writeMarkdown(pending.path, pending.body, "editor.writeFrontmatter", {
          frontmatter: pending.frontmatter,
        }).catch(() => {});
      }
    };
  }, [writeMarkdown]);

  const triggerConflict = useCallback(() => {
    if (conflictActiveRef.current) return;
    conflictActiveRef.current = true;
    setConflictActive(true);
    setSaveStatus("unsaved");
    onConflict?.();
  }, [onConflict]);

  /** Revert in-memory frontmatter to the last content known to be on disk —
   *  used when a debounced field write fails, so the properties panel doesn't
   *  keep showing a value that was never persisted. */
  const revertFrontmatterToLastSaved = useCallback(() => {
    const raw = lastSavedContentRef.current;
    if (raw === null) return;
    const { frontmatter } = parseFrontmatter(raw);
    frontmatterRef.current = frontmatter;
    setParsedFrontmatter(parseYamlFrontmatter(frontmatter));
    // Restore the search-jump offset too — otherwise it keeps the failed
    // edit's frontmatter line count after the panel reverts.
    setFrontmatterLineOffset(computeFrontmatterLineOffset(raw));
  }, []);

  const handleFieldSaveError = useCallback(
    (path: string, err: unknown) => {
      // Prompt only while the failed path is still the selected file — the
      // conflict overlay's reload/overwrite act on the current selection, so
      // prompting after a switch would target the wrong file. (Transitions
      // await the field save, so this guard is defense in depth.)
      if (isExternalChangeConflict(err) && selectedPathRef.current === path) {
        triggerConflict();
        return;
      }
      console.error("Failed to save frontmatter:", err);
      showToast(t("errors.save_failed"));
      if (selectedPathRef.current !== path) return;
      if (pendingFieldSaveRef.current !== null) {
        // A newer property edit is already queued — its displayed value is
        // live and its own flush will persist it. Reverting here would strand
        // that edit (panel shows old, disk later shows new). Just keep unsaved.
        setSaveStatus("unsaved");
        return;
      }
      // Revert the panel to the last-saved frontmatter (the failed edit is
      // discarded, with the toast as notice). The dot then reflects whatever
      // body edit is still pending, not the abandoned field write — and never
      // stays stuck on "saving".
      revertFrontmatterToLastSaved();
      setSaveStatus(pendingMarkdownRef.current !== null ? "unsaved" : "saved");
    },
    [triggerConflict, showToast, t, revertFrontmatterToLastSaved]
  );

  const discardFieldSave = useCallback(() => {
    pendingFieldSaveRef.current = null;
    if (fieldSaveTimerRef.current) {
      clearTimeout(fieldSaveTimerRef.current);
      fieldSaveTimerRef.current = null;
    }
  }, []);

  /** Write the debounced field edit now. Returns the write promise (rejection
   *  already surfaced via handleFieldSaveError) or null when nothing pends. */
  const flushFieldSave = useCallback((): Promise<void> | null => {
    const pending = pendingFieldSaveRef.current;
    discardFieldSave();
    if (!pending) return null;
    // The body resolves when the write starts (after any queued predecessor
    // lands): prefer the live pending markdown, then the last content written
    // or read for this file, then the edit-time snapshot — so a slow in-flight
    // body write can't be clobbered by a stale field-save body.
    const resolveBody = () => {
      if (selectedPathRef.current === pending.path) {
        if (pendingMarkdownRef.current !== null) return pendingMarkdownRef.current;
        const raw = lastSavedContentRef.current;
        if (raw !== null) return parseFrontmatter(raw).body;
      } else {
        const written = lastWrittenByPathRef.current.get(pending.path);
        if (written !== undefined) return parseFrontmatter(written.content).body;
      }
      return pending.body;
    };
    if (selectedPathRef.current === pending.path) setSaveStatus("saving");
    const save = writeMarkdown(pending.path, resolveBody, "editor.writeFrontmatter", {
      frontmatter: pending.frontmatter,
    });
    save
      .then(() => {
        // Assert "saved" only when this was the latest transaction — no newer
        // field edit queued and no body autosave pending — so a slower write
        // can't flip the dot to saved while newer edits are still unsaved.
        if (
          selectedPathRef.current === pending.path &&
          pendingFieldSaveRef.current === null &&
          pendingMarkdownRef.current === null
        ) {
          setSaveStatus("saved");
        }
      })
      .catch((err) => handleFieldSaveError(pending.path, err));
    return save;
  }, [discardFieldSave, writeMarkdown, handleFieldSaveError]);

  const flushPendingSave = useCallback(
    async ({ mode = "blocking" }: { mode?: FlushMode } = {}) => {
      editorFlushRef.current?.();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const path = selectedPathRef.current;
      const markdown = pendingMarkdownRef.current;

      // A pending body write composes its payload at start time, so it already
      // carries the latest frontmatter — a debounced field save for the same
      // file is redundant then and is dropped. Otherwise flush it now so a
      // switch/close/quit can't lose a property edit sitting in the debounce
      // window.
      let fieldSave: Promise<void> | null = null;
      if (pendingFieldSaveRef.current !== null) {
        if (markdown !== null && path === pendingFieldSaveRef.current.path) {
          discardFieldSave();
        } else {
          fieldSave = flushFieldSave();
        }
      }

      // Background flushes are fire-and-forget with an optimistic clear below.
      // Only the close-guard's window-hide flush uses this mode, and it never
      // changes the selection — so the write carries the normal mtime token
      // (no force), and a rejection can always be resolved against the file
      // the user is still on: restore the pending edit, then either open the
      // conflict prompt or toast. File switch and close use the blocking mode
      // and abort their transition on failure — see handleSelectFile /
      // handleCloseFile and ADR 0020.
      const pendingWrite =
        path && markdown !== null
          ? writeMarkdown(path, markdown, "editor.flushPendingWrite")
          : null;

      if (pendingWrite) {
        if (mode === "background") {
          pendingWrite.catch((err) => {
            // Restore the edit first (unless a newer one superseded it) so a
            // later flush or the quit close-guard retries — a failed
            // fire-and-forget write must not drop content while the status
            // dot claims "saved".
            if (selectedPathRef.current === path && pendingMarkdownRef.current === null) {
              pendingMarkdownRef.current = markdown;
            }
            if (isExternalChangeConflict(err)) {
              triggerConflict();
              return;
            }
            console.error("Failed to flush pending save:", err);
            showToast(t("errors.save_failed"));
            if (selectedPathRef.current === path) setSaveStatus("unsaved");
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
        // The field save already surfaced its own failure (conflict prompt or
        // toast + revert); re-await it so the caller (e.g. the close-guard)
        // still treats the flush as failed.
        if (fieldSave) await fieldSave;
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
    [
      awaitInFlightWrites,
      discardFieldSave,
      flushFieldSave,
      showToast,
      t,
      triggerConflict,
      writeMarkdown,
    ]
  );

  const clearConflict = useCallback(() => {
    conflictActiveRef.current = false;
    conflictRetryRef.current = null;
    setConflictActive(false);
  }, []);

  const resetFileState = useCallback(() => {
    setSelectedFile(null);
    setFileContent("");
    setFrontmatterLineOffset(0);
    setWordCount(0);
    setParsedFrontmatter({});
    setSaveStatus("saved");
    frontmatterRef.current = "";
    selectedPathRef.current = null;
    pendingMarkdownRef.current = null;
    lastSavedContentRef.current = null;
    lastSavedVersionRef.current = null;
    discardFieldSave();
    clearConflict();
  }, [clearConflict, discardFieldSave]);

  /** Close the open file. By default this awaits the full outgoing save
   *  transaction and aborts the close (file stays open, edit intact, error
   *  already surfaced) when it fails or conflicts. `discard: true` skips the
   *  save entirely — for closes driven by the file's removal, where there is
   *  nothing left on disk to save to. Returns true when the file was closed,
   *  false when the close aborted — callers use this to remove the tab only
   *  after a successful close. */
  const handleCloseFile = useCallback(
    async ({ discard = false }: { discard?: boolean } = {}): Promise<boolean> => {
      if (!discard) {
        try {
          await flushPendingSave();
        } catch {
          // flushPendingSave surfaced the failure (toast or conflict prompt).
          return false;
        }
      }
      resetFileState();
      return true;
    },
    [flushPendingSave, resetFileState]
  );

  /** Load a file's content + its mtime token, applying it to editor state.
   *  Shared by first-open and external-reload. Returns false if the selection
   *  changed underneath us. Throws if the read fails (caller toasts). */
  const applyDiskContent = useCallback(
    async (node: FileNode): Promise<boolean> => {
      // One consistent snapshot: content paired with the content-hash version
      // it's valid against (the token is intrinsic to the bytes, so there's no
      // read-time race). Throws (→ caller toasts) if the file is unreadable or
      // too large.
      const { content: raw, version } = await commands.files.readVersioned({ path: node.path });
      if (selectedPathRef.current !== node.path) return false;
      const { frontmatter, body } = parseFrontmatter(raw);
      frontmatterRef.current = frontmatter;
      lastSavedContentRef.current = raw;
      lastSavedVersionRef.current = version;
      pendingMarkdownRef.current = null;
      // Cancel any debounced field write — its content is now stale against
      // the freshly-read version, so letting it fire would clobber the reloaded
      // (possibly externally-changed) frontmatter.
      discardFieldSave();
      clearConflict();
      // Update all state only after a successful read so a failure leaves the
      // previous file's metadata intact on screen.
      setWordCount(0);
      setParsedFrontmatter(parseYamlFrontmatter(frontmatter));
      setSaveStatus("saved");
      setFileContent(body);
      // Commit the frontmatter line offset atomically with the body so a
      // search jump can't map its file-line number using the previous file's
      // offset. `raw` is `frontmatter + body`.
      setFrontmatterLineOffset(computeFrontmatterLineOffset(raw));
      setSelectedFile(node);
      return true;
    },
    [clearConflict, discardFieldSave]
  );

  /** Returns true when the file was read and is now the active selection —
   *  callers use this to record session side-effects (tabs, recents) only for
   *  opens that actually succeeded. */
  async function handleSelectFile(node: FileNode): Promise<boolean> {
    // Await the outgoing file's complete save transaction (pending body
    // write, debounced field save, in-flight writes) and abort the switch
    // when it fails or conflicts — the selection hasn't moved yet, so the
    // toast or conflict dialog targets the file the user is still on, and no
    // edit can be dropped mid-transition.
    try {
      await flushPendingSave();
    } catch {
      // flushPendingSave surfaced the failure (toast or conflict prompt).
      return false;
    }
    const prevPath = selectedPathRef.current;
    selectedPathRef.current = node.path;
    pendingMarkdownRef.current = null;

    try {
      return await applyDiskContent(node);
    } catch (err) {
      console.error("Failed to read file:", err);
      showToast(t(isFileTooLarge(err) ? "errors.file_too_large" : "errors.open_file_failed"));
      if (selectedPathRef.current === node.path) selectedPathRef.current = prevPath;
      return false;
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
    // Keep the search-jump offset correct when a property edit changes the
    // frontmatter's line count (offset is otherwise only recomputed on load).
    setFrontmatterLineOffset(computeFrontmatterLineOffset(newFrontmatter));

    // The body comes from the live pending edit when dirty, else from the last
    // content known to be on disk — no re-read needed; an external change is
    // caught by the write's mtime check instead of raced by a read.
    const body =
      pendingMarkdownRef.current ?? parseFrontmatter(lastSavedContentRef.current ?? "").body;
    // Mark unsaved *now*, before the debounce — otherwise the revision poll
    // sees a "saved" file with a pending property write and may reload it,
    // refreshing the mtime so the debounced write then silently overwrites the
    // external change. (Same reason handleEditorChange marks unsaved up front.)
    setSaveStatus("unsaved");
    // Debounce the whole-file rewrite: per-keystroke title edits coalesce into
    // one write. The eventual write routes through writeMarkdown (tracked +
    // per-path ordered) so flushPendingSave's awaitInFlightWrites still covers
    // it, and flushPendingSave itself flushes or supersedes the debounce on
    // switch/close/quit. See flushFieldSave.
    pendingFieldSaveRef.current = { path: selectedFile.path, body, frontmatter: newFrontmatter };
    if (fieldSaveTimerRef.current) clearTimeout(fieldSaveTimerRef.current);
    fieldSaveTimerRef.current = setTimeout(() => {
      fieldSaveTimerRef.current = null;
      void flushFieldSave();
    }, FIELD_SAVE_DELAY_MS);
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
    frontmatterLineOffset,
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
