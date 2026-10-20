import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "./commands";
import { EXTERNAL_CHANGE_CONFLICT, FILE_MISSING, FILE_TOO_LARGE } from "./commands/files";
import {
  DEFAULT_DISK_FORMAT,
  type DiskTextFormat,
  detectDiskFormat,
  encodeDiskText,
} from "./diskText";
import {
  editFrontmatterField,
  type FrontmatterValue,
  joinFrontmatter,
  loadFrontmatterBlock,
  type ParsedFrontmatter,
  parseFrontmatter,
  parseYamlFrontmatter,
  projectFrontmatter,
} from "./frontmatter";
import { measureAsync } from "./perf";
import { frontmatterLineOffset as computeFrontmatterLineOffset } from "./searchJump";
import type { FileNode, SaveStatus } from "./types";

const SAVE_DELAY_MS = 750;
// Property-panel/title edits rewrite the whole file; coalesce keystrokes on a
// shorter debounce than body autosave so the panel still feels immediate.
const FIELD_SAVE_DELAY_MS = 300;
type FlushMode = "blocking" | "background";
/** A debounced property-panel/title edit: the (path, body, frontmatter) it
 *  was made against, and its generation (see fieldGenRef). */
type PendingFieldSave = { path: string; body: string; frontmatter: string; gen: number };
type WritePerfName = "editor.writeFile" | "editor.flushPendingWrite" | "editor.writeFrontmatter";

/** The document the editor shows, as one atomically-updated value.
 *
 *  - `docId` identifies one open-file *session*: it changes when a different
 *    file is opened and survives renames, so the editor (keyed by it) is not
 *    remounted — with stale content — when its file moves.
 *  - `loadId` changes on every load or reload from disk. The editor re-applies
 *    `body` when it changes, not when the string differs, so an external
 *    revert back to the originally-loaded text still lands.
 *  - `mountGen` changes when the editor must be remounted under the same
 *    session (error-boundary retry, the file's folder moved) — `body` then
 *    carries the current text, never the text from when the file was opened.
 */
export interface EditorDocument {
  docId: number;
  loadId: number;
  mountGen: number;
  body: string;
}

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** Why a save was refused in a way only the user can resolve: the file
 *  changed on disk since it was read, or it no longer exists at all. */
export type SaveBlock = "changed" | "missing";

/** How the user chose to resolve a blocked save. "reload" / "overwrite" answer
 *  a changed file; "recreate" / "discard" a missing one; "dismiss" either. */
export type ConflictResolution = "reload" | "overwrite" | "dismiss" | "recreate" | "discard";

function classifySaveError(err: unknown): SaveBlock | null {
  if (!(err instanceof Error)) return null;
  if (err.message === EXTERNAL_CHANGE_CONFLICT) return "changed";
  if (err.message === FILE_MISSING) return "missing";
  return null;
}

function isFileTooLarge(err: unknown): boolean {
  return err instanceof Error && err.message === FILE_TOO_LARGE;
}

export function useFileEditor({
  showToast,
  onConflict,
}: {
  showToast: (msg: string) => void;
  /** Called when a save is refused because the file changed on disk or no
   *  longer exists, so the host can surface the matching prompt. Resolve via
   *  `resolveConflict`. */
  onConflict?: (reason: SaveBlock) => void;
}) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [editorDocument, setEditorDocument] = useState<EditorDocument>({
    docId: 0,
    loadId: 0,
    mountGen: 0,
    body: "",
  });
  // Monotonic id sources plus a mirror of the live document, so async handlers
  // can derive the next value without a functional state update (whose
  // updater must stay side-effect free).
  const editorDocumentRef = useRef(editorDocument);
  // The path whose content the current editor document holds (null when no
  // file is loaded). Unlike selectedPathRef it only moves once a read lands.
  const loadedPathRef = useRef<string | null>(null);
  const nextDocIdRef = useRef(1);
  const nextLoadIdRef = useRef(1);
  // Lines the current file's frontmatter occupies. Set atomically with the
  // editor document in applyDiskContent so a search jump maps its full-file
  // line number to a body line using this file's offset, never the previous one.
  const [frontmatterLineOffset, setFrontmatterLineOffset] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [parsedFrontmatter, setParsedFrontmatter] = useState<ParsedFrontmatter>({});
  // The YAML parse error of the open file's frontmatter, or null. While set,
  // property edits are refused and the panel is read-only — rewriting a block
  // we can't read would destroy every field in it.
  const [frontmatterError, setFrontmatterError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [conflictActive, setConflictActive] = useState(false);
  const [conflictReason, setConflictReason] = useState<SaveBlock>("changed");

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
  const lastWrittenByPathRef = useRef(new Map<string, { content: string; version: string }>());
  // Tracks the full file content (frontmatter + body) as last written to or read from disk.
  // Used to distinguish our own saves from external changes in the workspace refresh loop.
  const lastSavedContentRef = useRef<string | null>(null);
  // Optimistic-concurrency token: the file's content-hash version as last
  // read/written. Passed to write_file so it can refuse a save that would
  // clobber an external change.
  const lastSavedVersionRef = useRef<string | null>(null);
  // The open file's on-disk format (BOM, line endings), re-applied on every
  // save so the editor's LF output doesn't turn a CRLF file into a mixed one.
  const diskFormatRef = useRef<DiskTextFormat>(DEFAULT_DISK_FORMAT);
  // The (path, markdown) of the write that hit a conflict, so an "overwrite"
  // resolution can force exactly that content back through writeMarkdown.
  const conflictRetryRef = useRef<{ path: string; markdown: string } | null>(null);
  // Ref mirror of conflictActive so async write handlers can guard re-entrancy.
  const conflictActiveRef = useRef(false);
  const conflictReasonRef = useRef<SaveBlock>("changed");
  // Set when the user chose "keep editing" on a missing-file prompt: autosave
  // stops retrying (each retry would re-prompt) until the file is recreated,
  // reloaded or closed. A switch/close/quit still flushes — and so re-prompts,
  // because leaving must not silently drop the edits.
  const missingPausedRef = useRef(false);
  // Debounced property-panel/title edit awaiting its write, captured as a
  // (path, body, frontmatter) snapshot at edit time so a file switch can't
  // bleed the next file's state into the write. A write refused by a conflict
  // or a missing file puts it back, so it stays pending until it is saved or
  // explicitly discarded.
  const pendingFieldSaveRef = useRef<PendingFieldSave | null>(null);
  // Generation of the newest property edit, bumped by every edit and every
  // drop of a pending one. A field write that fails while it is no longer the
  // newest was superseded — by a later edit, whose frontmatter carries it, or
  // by a write or discard that settled it — and must not be put back or
  // reverted: either would bring its older frontmatter back over the newer.
  const fieldGenRef = useRef(0);
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
      opts?: { force?: boolean; frontmatter?: string; create?: boolean }
    ) => {
      // Queue-time snapshots, refreshed at start time only while `path` is
      // still the selected file — the refs then still describe this file (an
      // earlier queued write may have advanced the version token). After a
      // switch the refs describe the newly-opened file and must not bleed
      // into a write that is still queued for the previous one; such a write
      // falls back to what the chain last wrote (or these snapshots).
      const queuedFrontmatter = opts?.frontmatter ?? frontmatterRef.current;
      const queuedVersion = lastSavedVersionRef.current;
      const queuedFormat = diskFormatRef.current;
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
        const diskContent = encodeDiskText(
          joinFrontmatter(frontmatter, body),
          stillSelected ? diskFormatRef.current : queuedFormat
        );
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
              // `create` recreates a file that vanished: make its folder again
              // if needed, then create it exclusively (never clobbering a file
              // that reappeared meanwhile).
              const newVersion = opts?.create
                ? await commands.files
                    .ensureDir({ path: path.slice(0, path.lastIndexOf("/")) })
                    .then(() => commands.files.create({ path, content: diskContent }))
                : await commands.files.write({ path, content: diskContent, expectedVersion });
              lastWrittenByPathRef.current.set(path, { content: diskContent, version: newVersion });
              if (selectedPathRef.current === path) {
                lastSavedContentRef.current = diskContent;
                lastSavedVersionRef.current = newVersion;
              }
            } catch (err) {
              // Remember what we tried to write so an "overwrite" resolution can
              // force exactly this content back to disk.
              if (classifySaveError(err) !== null && selectedPathRef.current === path) {
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

  const triggerConflict = useCallback(
    (reason: SaveBlock) => {
      if (conflictActiveRef.current) return;
      conflictActiveRef.current = true;
      conflictReasonRef.current = reason;
      setConflictReason(reason);
      setConflictActive(true);
      setSaveStatus("unsaved");
      onConflict?.(reason);
    },
    [onConflict]
  );

  /** Publish a freshly read frontmatter block to the panel: its display
   *  projection, or — when the YAML doesn't parse — the error that makes the
   *  panel read-only. */
  const applyFrontmatterProjection = useCallback((block: string) => {
    const loaded = loadFrontmatterBlock(block);
    setParsedFrontmatter(loaded.ok ? projectFrontmatter(loaded.data) : {});
    setFrontmatterError(loaded.ok ? null : loaded.error);
  }, []);

  /** Revert in-memory frontmatter to the last content known to be on disk —
   *  used when a debounced field write fails, so the properties panel doesn't
   *  keep showing a value that was never persisted. */
  const revertFrontmatterToLastSaved = useCallback(() => {
    const raw = lastSavedContentRef.current;
    if (raw === null) return;
    const { frontmatter } = parseFrontmatter(raw);
    frontmatterRef.current = frontmatter;
    applyFrontmatterProjection(frontmatter);
    // Restore the search-jump offset too — otherwise it keeps the failed
    // edit's frontmatter line count after the panel reverts.
    setFrontmatterLineOffset(computeFrontmatterLineOffset(raw));
  }, [applyFrontmatterProjection]);

  const handleFieldSaveError = useCallback(
    (pending: PendingFieldSave, err: unknown) => {
      const { path } = pending;
      const superseded = pending.gen !== fieldGenRef.current;
      // Prompt only while the failed path is still the selected file — the
      // conflict overlay's reload/overwrite act on the current selection, so
      // prompting after a switch would target the wrong file. (Transitions
      // await the field save, so this guard is defense in depth.)
      const block = classifySaveError(err);
      if (block !== null && selectedPathRef.current === path) {
        // Keep the edit pending, as a refused body write keeps its markdown:
        // after "keep editing", a switch, close or quit must still find
        // something to save — and so flush and prompt again — rather than
        // leave as if nothing were unsaved.
        if (!superseded) pendingFieldSaveRef.current = pending;
        triggerConflict(block);
        return;
      }
      console.error("Failed to save frontmatter:", err);
      showToast(t("errors.save_failed"));
      if (selectedPathRef.current !== path) return;
      // A newer edit's own write decides the panel and the status dot;
      // reverting here would strand it (panel shows old, disk later new).
      if (superseded) return;
      // Revert the panel to the last-saved frontmatter (the failed edit is
      // discarded, with the toast as notice). The dot then reflects whatever
      // body edit is still pending, not the abandoned field write — and never
      // stays stuck on "saving".
      revertFrontmatterToLastSaved();
      setSaveStatus(pendingMarkdownRef.current !== null ? "unsaved" : "saved");
    },
    [triggerConflict, showToast, t, revertFrontmatterToLastSaved]
  );

  const cancelFieldSaveTimer = useCallback(() => {
    if (fieldSaveTimerRef.current) {
      clearTimeout(fieldSaveTimerRef.current);
      fieldSaveTimerRef.current = null;
    }
  }, []);

  /** Drop the pending property edit — another write saved it, or the user
   *  discarded it — and supersede any write of it still in flight. */
  const discardFieldSave = useCallback(() => {
    pendingFieldSaveRef.current = null;
    fieldGenRef.current += 1;
    cancelFieldSaveTimer();
  }, [cancelFieldSaveTimer]);

  /** Whether the open file has edits that aren't on disk yet. A keystroke
   *  still inside the editor's serialize debounce is flushed out first, so it
   *  counts too. */
  const hasLocalEdits = useCallback((): boolean => {
    editorFlushRef.current?.();
    return pendingMarkdownRef.current !== null || pendingFieldSaveRef.current !== null;
  }, []);

  /** Write the debounced field edit now. Returns the write promise (rejection
   *  already surfaced via handleFieldSaveError) or null when nothing pends. */
  const flushFieldSave = useCallback((): Promise<void> | null => {
    const pending = pendingFieldSaveRef.current;
    pendingFieldSaveRef.current = null;
    cancelFieldSaveTimer();
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
      .catch((err) => handleFieldSaveError(pending, err));
    return save;
  }, [cancelFieldSaveTimer, writeMarkdown, handleFieldSaveError]);

  const flushPendingSave = useCallback(
    async ({ mode = "blocking" }: { mode?: FlushMode } = {}) => {
      editorFlushRef.current?.();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // The file is gone and the user chose to keep editing: the blur/hide
      // flush holds the edits like autosave does — retrying would re-open the
      // prompt every time the user switched apps. A blocking flush (switch,
      // close, quit) still writes, and so prompts again.
      if (mode === "background" && missingPausedRef.current) return;

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
            const block = classifySaveError(err);
            if (block !== null) {
              triggerConflict(block);
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
            const block = classifySaveError(err);
            if (block !== null) triggerConflict(block);
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
          const block = classifySaveError(err);
          if (block !== null) {
            triggerConflict(block);
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
    missingPausedRef.current = false;
    setConflictActive(false);
  }, []);

  const publishEditorDocument = useCallback((next: EditorDocument) => {
    editorDocumentRef.current = next;
    setEditorDocument(next);
  }, []);

  /** The body as it stands right now: the unsaved edit if there is one, else
   *  the last content written to or read from disk. Unlike the document's
   *  load-time `body`, this includes everything autosaved since the open. */
  const getCurrentBody = useCallback((): string => {
    if (pendingMarkdownRef.current !== null) return pendingMarkdownRef.current;
    const raw = lastSavedContentRef.current;
    return raw === null ? editorDocumentRef.current.body : parseFrontmatter(raw).body;
  }, []);

  /** Remount the editor under the same session with the current body — the
   *  error-boundary retry and folder-moving renames use it. */
  const remountEditor = useCallback(() => {
    const prev = editorDocumentRef.current;
    publishEditorDocument({ ...prev, mountGen: prev.mountGen + 1, body: getCurrentBody() });
  }, [getCurrentBody, publishEditorDocument]);

  /** Follow a rename of the open file (or of a folder containing it). The
   *  session — and with it the mounted editor, its undo history and any
   *  pending edit — carries over to the new path; pending writes that were
   *  queued under the old path move with it. */
  const renameSelection = useCallback(
    (oldPath: string, newPath: string, node: FileNode) => {
      selectedPathRef.current = newPath;
      if (loadedPathRef.current === oldPath) loadedPathRef.current = newPath;
      setSelectedFile(node);
      if (pendingFieldSaveRef.current?.path === oldPath) {
        pendingFieldSaveRef.current = { ...pendingFieldSaveRef.current, path: newPath };
      }
      if (conflictRetryRef.current?.path === oldPath) {
        conflictRetryRef.current = { ...conflictRetryRef.current, path: newPath };
      }
      // Relative image paths resolve against the file's folder, which the
      // mounted image views captured at creation; remount when it moved.
      if (dirname(oldPath) !== dirname(newPath)) remountEditor();
    },
    [remountEditor]
  );

  const resetFileState = useCallback(() => {
    setSelectedFile(null);
    loadedPathRef.current = null;
    publishEditorDocument({
      docId: nextDocIdRef.current++,
      loadId: nextLoadIdRef.current++,
      mountGen: 0,
      body: "",
    });
    setFrontmatterLineOffset(0);
    setWordCount(0);
    setParsedFrontmatter({});
    setFrontmatterError(null);
    setSaveStatus("saved");
    frontmatterRef.current = "";
    selectedPathRef.current = null;
    pendingMarkdownRef.current = null;
    lastSavedContentRef.current = null;
    lastSavedVersionRef.current = null;
    diskFormatRef.current = DEFAULT_DISK_FORMAT;
    discardFieldSave();
    clearConflict();
  }, [clearConflict, discardFieldSave, publishEditorDocument]);

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

  /** Load a file's content + its version token, applying it to editor state.
   *  Shared by first-open (`newSession`: a new docId, so a fresh editor) and
   *  external-reload (same docId: the mounted editor swaps content in place).
   *  Returns false if the selection changed underneath us. Throws if the read
   *  fails (caller toasts). */
  const applyDiskContent = useCallback(
    async (
      node: FileNode,
      { newSession, keepLocalEdits = false }: { newSession: boolean; keepLocalEdits?: boolean }
    ): Promise<boolean> => {
      // One consistent snapshot: content paired with the content-hash version
      // it's valid against (the token is intrinsic to the bytes, so there's no
      // read-time race). Throws (→ caller toasts) if the file is unreadable or
      // too large.
      const { content: raw, version } = await commands.files.readVersioned({ path: node.path });
      if (selectedPathRef.current !== node.path) return false;
      // Edits typed while the read was in flight win over the disk version:
      // the reload is abandoned, and their save then meets the external change
      // as a conflict the user resolves — never a silent overwrite of either.
      if (keepLocalEdits && hasLocalEdits()) return false;
      const { frontmatter, body } = parseFrontmatter(raw);
      frontmatterRef.current = frontmatter;
      lastSavedContentRef.current = raw;
      lastSavedVersionRef.current = version;
      diskFormatRef.current = detectDiskFormat(raw);
      pendingMarkdownRef.current = null;
      // Cancel any debounced field write — its content is now stale against
      // the freshly-read version, so letting it fire would clobber the reloaded
      // (possibly externally-changed) frontmatter.
      discardFieldSave();
      clearConflict();
      // Update all state only after a successful read so a failure leaves the
      // previous file's metadata intact on screen.
      setWordCount(0);
      applyFrontmatterProjection(frontmatter);
      setSaveStatus("saved");
      const prev = editorDocumentRef.current;
      loadedPathRef.current = node.path;
      publishEditorDocument({
        docId: newSession ? nextDocIdRef.current++ : prev.docId,
        loadId: nextLoadIdRef.current++,
        mountGen: newSession ? 0 : prev.mountGen,
        body,
      });
      // Commit the frontmatter line offset atomically with the body so a
      // search jump can't map its file-line number using the previous file's
      // offset. `raw` is `frontmatter + body`.
      setFrontmatterLineOffset(computeFrontmatterLineOffset(raw));
      setSelectedFile(node);
      return true;
    },
    [
      applyFrontmatterProjection,
      clearConflict,
      discardFieldSave,
      hasLocalEdits,
      publishEditorDocument,
    ]
  );

  /** Returns true when the file was read and is now the active selection —
   *  callers use this to record session side-effects (tabs, recents) only for
   *  opens that actually succeeded. */
  async function handleSelectFile(node: FileNode): Promise<boolean> {
    // Re-selecting the open file (clicking its tab or sidebar row again) is
    // not a reload: re-reading would reset the cursor and undo history and
    // re-baseline the session word count for no change.
    if (node.path === loadedPathRef.current && node.path === selectedPathRef.current) {
      setSelectedFile(node);
      return true;
    }
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
      return await applyDiskContent(node, { newSession: true });
    } catch (err) {
      console.error("Failed to read file:", err);
      showToast(t(isFileTooLarge(err) ? "errors.file_too_large" : "errors.open_file_failed"));
      if (selectedPathRef.current === node.path) selectedPathRef.current = prevPath;
      return false;
    }
  }

  /** Replace the open file's content with what is on disk. By default this
   *  refuses (returns false) when there are local edits — including one typed
   *  after the caller decided to reload — since a reload would discard them;
   *  `discardLocalEdits` is for the user's explicit "discard & reload". */
  const reloadSelectedFileFromDisk = useCallback(
    async (
      node: FileNode,
      { discardLocalEdits = false }: { discardLocalEdits?: boolean } = {}
    ): Promise<boolean> => {
      if (selectedPathRef.current !== node.path) return false;
      if (!discardLocalEdits && hasLocalEdits()) return false;
      try {
        return await applyDiskContent(node, {
          newSession: false,
          keepLocalEdits: !discardLocalEdits,
        });
      } catch (err) {
        console.error("Failed to reload file:", err);
        showToast(t(isFileTooLarge(err) ? "errors.file_too_large" : "errors.reload_file_failed"));
        return false;
      }
    },
    [applyDiskContent, hasLocalEdits, showToast, t]
  );

  /** Receive serialized markdown from the editor that shows document `docId`.
   *
   *  Stable, and scoped to its document: an edit from an editor whose session
   *  is no longer the open one — the outgoing editor's unmount flush after a
   *  switch, a serialize that lands late — is dropped instead of being written
   *  into the newly-opened file's pending state (from where the next flush
   *  would have saved it into the wrong file). Edits typed while a switch is
   *  reading the next file are dropped for the same reason. */
  const handleEditorChange = useCallback(
    (markdown: string, docId: number) => {
      const path = loadedPathRef.current;
      if (docId !== editorDocumentRef.current.docId || path === null) return;
      if (selectedPathRef.current !== path) return;
      setSaveStatus("unsaved");
      pendingMarkdownRef.current = markdown;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null;
        // Resolve the target when the timer fires, not when it was set: a
        // rename in between moved the document, and a switch made it stale.
        if (editorDocumentRef.current.docId !== docId) return;
        // The file is gone and the user chose to keep editing: hold the edit
        // (still "unsaved") rather than re-prompt on every pause in typing.
        if (missingPausedRef.current) return;
        const pathToSave = loadedPathRef.current;
        const snapshot = pendingMarkdownRef.current;
        if (snapshot === null || pathToSave === null) return;
        setSaveStatus("saving");
        try {
          await writeMarkdown(pathToSave, snapshot, "editor.writeFile");
          if (pendingMarkdownRef.current === snapshot) {
            pendingMarkdownRef.current = null;
            setSaveStatus("saved");
          }
        } catch (err) {
          const block = classifySaveError(err);
          if (block !== null) {
            // Pause autosave and prompt; the pending markdown is retained so
            // "overwrite"/"recreate" can write it and "dismiss" keeps it.
            if (pendingMarkdownRef.current === snapshot) setSaveStatus("unsaved");
            triggerConflict(block);
            return;
          }
          console.error("Failed to save file:", err);
          showToast(t("errors.save_failed"));
          // Roll back to unsaved so the dot doesn't sit on "saving" forever after
          // a failed write; the pending markdown is retained for the next attempt.
          if (pendingMarkdownRef.current === snapshot) setSaveStatus("unsaved");
        }
      }, SAVE_DELAY_MS);
    },
    [writeMarkdown, triggerConflict, showToast, t]
  );

  const handleEditorDirty = useCallback(() => {
    setSaveStatus("unsaved");
  }, []);

  /** Register the mounted editor's pending-serialize flush; returns the
   *  matching unregister, which only clears the slot if it still holds this
   *  flush (so an outgoing editor can't clear its successor's). */
  const registerEditorFlush = useCallback((flush: () => void) => {
    editorFlushRef.current = flush;
    return () => {
      if (editorFlushRef.current === flush) editorFlushRef.current = null;
    };
  }, []);

  /** Apply a property edit to a file that is *not* the open one — a cover
   *  upload or WeChat publish that finished after the user moved on. A
   *  versioned read-modify-write of that file alone, queued through
   *  enqueueWrite so a flush (and quit) still waits for it; retried once if
   *  the file changes underneath it. */
  const writeFieldToFile = useCallback(
    (path: string, key: string, value: FrontmatterValue): Promise<void> => {
      const attempt = async (): Promise<"done" | "invalid" | "conflict"> => {
        const { content, version } = await commands.files.readVersioned({ path });
        const { frontmatter, body } = parseFrontmatter(content);
        const edit = editFrontmatterField(frontmatter, key, value);
        if (!edit.ok) return "invalid";
        if (edit.block === frontmatter) return "done";
        try {
          await commands.files.write({
            path,
            content: encodeDiskText(joinFrontmatter(edit.block, body), detectDiskFormat(content)),
            expectedVersion: version,
          });
          return "done";
        } catch (err) {
          if (classifySaveError(err) === "changed") return "conflict";
          throw err;
        }
      };
      return enqueueWrite(path, async () => {
        try {
          let outcome = await attempt();
          if (outcome === "conflict") outcome = await attempt();
          if (outcome === "invalid") showToast(t("errors.frontmatter_invalid"));
          else if (outcome === "conflict") showToast(t("errors.save_failed"));
        } catch (err) {
          console.error("Failed to save frontmatter:", err);
          showToast(t("errors.save_failed"));
        }
      });
    },
    [enqueueWrite, showToast, t]
  );

  /** Set one frontmatter field of the file at `path`.
   *
   *  The path is explicit — bound when the edit is made, not read from state
   *  when it lands — because some edits finish asynchronously (a cover image
   *  upload, a WeChat publish). If the user switched files meanwhile, the edit
   *  goes to the file it was made on instead of the one now open. */
  const handleFieldChange = useCallback(
    async (path: string, key: string, value: FrontmatterValue) => {
      if (path !== selectedPathRef.current || path !== loadedPathRef.current) {
        await writeFieldToFile(path, key, value);
        return;
      }
      // Edit the raw block, never a rebuild from the display projection: nested
      // maps, lists of maps, timestamps and keys the panel doesn't show must all
      // survive a title edit. Unparseable YAML is refused, not overwritten.
      const edit = editFrontmatterField(frontmatterRef.current, key, value);
      if (!edit.ok) {
        showToast(t("errors.frontmatter_invalid"));
        return;
      }
      if (edit.block === frontmatterRef.current) return;
      const newFrontmatter = edit.block;
      setParsedFrontmatter(parseYamlFrontmatter(newFrontmatter));
      frontmatterRef.current = newFrontmatter;
      // Keep the search-jump offset correct when a property edit changes the
      // frontmatter's line count (offset is otherwise only recomputed on load).
      setFrontmatterLineOffset(computeFrontmatterLineOffset(newFrontmatter));

      // The body comes from the live pending edit when dirty, else from the last
      // content known to be on disk — no re-read needed; an external change is
      // caught by the write's version check instead of raced by a read.
      const body =
        pendingMarkdownRef.current ?? parseFrontmatter(lastSavedContentRef.current ?? "").body;
      // Mark unsaved *now*, before the debounce — otherwise the revision poll
      // sees a "saved" file with a pending property write and may reload it,
      // refreshing the version so the debounced write then silently overwrites
      // the external change. (Same reason handleEditorChange marks unsaved up front.)
      setSaveStatus("unsaved");
      // Debounce the whole-file rewrite: per-keystroke title edits coalesce into
      // one write. The eventual write routes through writeMarkdown (tracked +
      // per-path ordered) so flushPendingSave's awaitInFlightWrites still covers
      // it, and flushPendingSave itself flushes or supersedes the debounce on
      // switch/close/quit. See flushFieldSave.
      fieldGenRef.current += 1;
      pendingFieldSaveRef.current = {
        path,
        body,
        frontmatter: newFrontmatter,
        gen: fieldGenRef.current,
      };
      if (fieldSaveTimerRef.current) clearTimeout(fieldSaveTimerRef.current);
      fieldSaveTimerRef.current = setTimeout(() => {
        fieldSaveTimerRef.current = null;
        // Held, like body autosave, while a missing file awaits a decision.
        if (missingPausedRef.current) return;
        void flushFieldSave();
      }, FIELD_SAVE_DELAY_MS);
    },
    [flushFieldSave, showToast, t, writeFieldToFile]
  );

  const resolveConflict = useCallback(
    async (resolution: ConflictResolution) => {
      const reason = conflictReasonRef.current;
      conflictActiveRef.current = false;
      setConflictActive(false);
      const retry = conflictRetryRef.current;
      conflictRetryRef.current = null;

      if (resolution === "reload") {
        const node = selectedFileRef.current;
        if (node) await reloadSelectedFileFromDisk(node, { discardLocalEdits: true });
        return;
      }
      if (resolution === "overwrite") {
        if (!retry) return;
        // The forced write carries the live frontmatter, so it also saves a
        // property edit held pending since the conflict.
        const heldField = pendingFieldSaveRef.current;
        setSaveStatus("saving");
        try {
          await writeMarkdown(retry.path, retry.markdown, "editor.writeFile", { force: true });
          if (selectedPathRef.current === retry.path) {
            if (pendingMarkdownRef.current !== null) pendingMarkdownRef.current = null;
            if (heldField?.path === retry.path && pendingFieldSaveRef.current === heldField) {
              discardFieldSave();
            }
            setSaveStatus("saved");
          }
        } catch (err) {
          console.error("Failed to overwrite on conflict:", err);
          showToast(t("errors.save_failed"));
          setSaveStatus("unsaved");
        }
        return;
      }
      if (resolution === "recreate") {
        const path = loadedPathRef.current;
        if (!path || path !== selectedPathRef.current) return;
        missingPausedRef.current = false;
        // A pending property edit is already in frontmatterRef, which the
        // recreating write carries: hold its own write meanwhile (it would
        // only hit the gap) and drop it once the file exists again. If the
        // recreate fails it stays pending, so leaving still saves or prompts.
        const heldField = pendingFieldSaveRef.current;
        cancelFieldSaveTimer();
        const body = getCurrentBody();
        setSaveStatus("saving");
        try {
          await writeMarkdown(path, body, "editor.writeFile", { create: true });
          if (pendingMarkdownRef.current === body) pendingMarkdownRef.current = null;
          if (heldField !== null && pendingFieldSaveRef.current === heldField) discardFieldSave();
          setSaveStatus(
            pendingMarkdownRef.current === null && pendingFieldSaveRef.current === null
              ? "saved"
              : "unsaved"
          );
        } catch (err) {
          console.error("Failed to recreate file:", err);
          showToast(t("errors.save_failed"));
          setSaveStatus("unsaved");
        }
        return;
      }
      if (resolution === "discard") {
        // Drop the edits; the host then closes the file (it has nothing on
        // disk left to show).
        missingPausedRef.current = false;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        pendingMarkdownRef.current = null;
        discardFieldSave();
        setSaveStatus("saved");
        return;
      }
      // "dismiss": leave the edits pending. A changed file re-prompts on the
      // next save; a missing one holds its autosave until a decision. (The
      // write that prompted may have been superseded by one that landed, and
      // then nothing is left unsaved.)
      if (reason === "missing") missingPausedRef.current = true;
      setSaveStatus(
        pendingMarkdownRef.current !== null || pendingFieldSaveRef.current !== null
          ? "unsaved"
          : "saved"
      );
    },
    [
      cancelFieldSaveTimer,
      discardFieldSave,
      getCurrentBody,
      reloadSelectedFileFromDisk,
      writeMarkdown,
      showToast,
      t,
    ]
  );

  return {
    selectedFile,
    setSelectedFile,
    editorDocument,
    getCurrentBody,
    remountEditor,
    renameSelection,
    frontmatterLineOffset,
    wordCount,
    setWordCount,
    parsedFrontmatter,
    frontmatterError,
    saveStatus,
    conflictActive,
    conflictReason,
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
