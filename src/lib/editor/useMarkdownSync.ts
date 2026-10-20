import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef } from "react";
import { measureSync } from "../perf";
import { getMarkdownStorage } from "../tiptap/markdownStorage";

const MARKDOWN_SERIALIZE_DELAY_MS = 150;

interface UseMarkdownSyncOptions {
  /** Receives the serialized markdown after the debounce (or a flush). Read
   *  through a ref, so a new identity per render is fine. */
  onChange?: (markdown: string) => void;
  /** Editor.tsx's seam to the session: lets the file-save path force the
   *  pending serialization out before writing to disk. Returns the matching
   *  unregister, which clears the registration only if it is still ours — an
   *  outgoing editor's cleanup must not clear the incoming editor's flush. */
  registerPendingFlush?: (flush: () => void) => () => void;
}

/** Owns the debounced markdown serialization pipeline: schedule on user
 *  edits, flush on demand / unmount, cancel before a whole-doc rewrite.
 *  Extracted from Editor.tsx so the timing rules live in one place.
 *
 *  Every returned callback is stable for the hook's lifetime. `onChange` is
 *  held in a ref rather than listed as a dependency: its identity changes on
 *  most parent renders, and a dependency would re-run the unmount-flush
 *  effect's cleanup each time — a synchronous full-document serialize on
 *  every render with an edit pending, defeating the debounce. */
export function useMarkdownSync({ onChange, registerPendingFlush }: UseMarkdownSyncOptions) {
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestEditorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const serializeMarkdown = useCallback(
    (editorInstance: Editor) =>
      measureSync(
        "editor.markdownSerialize",
        () => getMarkdownStorage(editorInstance).getMarkdown(),
        {
          docSize: editorInstance.state.doc.content.size,
        }
      ),
    []
  );

  /** Keep the "last seen" editor current — the unmount flush and the
   *  session-registered flush serialize whatever editor last updated. */
  const setCurrentEditor = useCallback((editor: Editor | null) => {
    latestEditorRef.current = editor;
  }, []);

  const cancelPendingSerialize = useCallback(() => {
    if (pendingTimerRef.current === null) return;
    clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
  }, []);

  const flushPendingSerialization = useCallback(
    (editorInstance: Editor | null = latestEditorRef.current) => {
      const hadPending = pendingTimerRef.current !== null;
      cancelPendingSerialize();
      const emit = onChangeRef.current;
      if (!hadPending || !editorInstance || !emit) return;
      emit(serializeMarkdown(editorInstance));
    },
    [cancelPendingSerialize, serializeMarkdown]
  );

  const scheduleSerialize = useCallback(
    (editor: Editor) => {
      if (!onChangeRef.current) return;
      cancelPendingSerialize();
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        onChangeRef.current?.(serializeMarkdown(editor));
      }, MARKDOWN_SERIALIZE_DELAY_MS);
    },
    [cancelPendingSerialize, serializeMarkdown]
  );

  useEffect(() => {
    if (!registerPendingFlush) return;
    return registerPendingFlush(() => flushPendingSerialization());
  }, [flushPendingSerialization, registerPendingFlush]);

  // Flush on unmount so a fast file-switch can't drop the trailing edit.
  // flushPendingSerialization is stable, so this cleanup runs only on unmount.
  useEffect(() => {
    return () => {
      flushPendingSerialization();
    };
  }, [flushPendingSerialization]);

  return {
    serializeMarkdown,
    setCurrentEditor,
    cancelPendingSerialize,
    flushPendingSerialization,
    scheduleSerialize,
  };
}
