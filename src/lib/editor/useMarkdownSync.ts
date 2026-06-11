import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef } from "react";
import { measureSync } from "../perf";

const MARKDOWN_SERIALIZE_DELAY_MS = 150;

interface UseMarkdownSyncOptions {
  /** Receives the serialized markdown after the debounce (or a flush). */
  onChange?: (markdown: string) => void;
  /** Editor.tsx's seam to the session: lets the file-save path force the
   *  pending serialization out before writing to disk. */
  registerPendingFlush?: (flush: (() => void) | null) => void;
}

/** Owns the debounced markdown serialization pipeline: schedule on user
 *  edits, flush on demand / unmount, cancel before a whole-doc rewrite.
 *  Extracted from Editor.tsx so the timing rules live in one place. */
export function useMarkdownSync({ onChange, registerPendingFlush }: UseMarkdownSyncOptions) {
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestEditorRef = useRef<Editor | null>(null);

  const serializeMarkdown = useCallback(
    (editorInstance: Editor) =>
      measureSync(
        "editor.markdownSerialize",
        // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown storage has no public type
        () => (editorInstance.storage as any).markdown.getMarkdown() as string,
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
      if (!hadPending || !editorInstance || !onChange) return;
      onChange(serializeMarkdown(editorInstance));
    },
    [cancelPendingSerialize, onChange, serializeMarkdown]
  );

  const scheduleSerialize = useCallback(
    (editor: Editor) => {
      if (!onChange) return;
      cancelPendingSerialize();
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        onChange(serializeMarkdown(editor));
      }, MARKDOWN_SERIALIZE_DELAY_MS);
    },
    [cancelPendingSerialize, onChange, serializeMarkdown]
  );

  useEffect(() => {
    if (!registerPendingFlush) return;
    registerPendingFlush(() => flushPendingSerialization());
    return () => registerPendingFlush(null);
  }, [flushPendingSerialization, registerPendingFlush]);

  // Flush on unmount so a fast file-switch can't drop the trailing edit.
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
