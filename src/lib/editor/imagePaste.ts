import type { EditorView } from "@tiptap/pm/view";
import { mimeTypeToImageExtension, resolveImageExtension } from "../imageUtils";

// Image paste/drop handling for the editor, as plain factory functions —
// `editorProps.handlePaste` / `handleDrop` are ProseMirror callbacks baked
// in at useEditor() time, not React call sites, so there is no hook here
// (same reasoning as the editor command table, ADR 0008). The asset-save
// command is injected so the offset math and error routing are testable
// without Tauri.

export const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

type Translate = (key: string, vars?: Record<string, unknown>) => string;

export interface ImageHandlerDeps {
  /** The active file the asset save resolves relative paths against. */
  filePath: string | undefined;
  onError?: (msg: string) => void;
  t: Translate;
  /** `commands.assets.saveFromBytes` in production. */
  saveFromBytes: (args: {
    bytes: number[];
    extension: string;
    activeFilePath?: string;
  }) => Promise<string>;
}

interface SavedImage {
  name: string;
  relPath: string;
}

async function saveImageFiles(
  files: File[],
  toExtension: (file: File) => string,
  toName: (file: File) => string,
  errorKey: string,
  deps: ImageHandlerDeps
): Promise<SavedImage[]> {
  const results = await Promise.allSettled(
    files.map((file) => {
      const ext = toExtension(file);
      return file.arrayBuffer().then((buf) => {
        const bytes = Array.from(new Uint8Array(buf));
        return deps
          .saveFromBytes({ bytes, extension: ext, activeFilePath: deps.filePath })
          .then((relPath) => ({ name: toName(file), relPath }));
      });
    })
  );
  return results.flatMap((r) => {
    if (r.status === "fulfilled") return [r.value];
    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
    deps.onError?.(deps.t(errorKey, { reason }));
    return [];
  });
}

function insertImageNodes(view: EditorView, at: number, saved: SavedImage[]): void {
  view.focus();
  const tr = view.state.tr;
  let offset = 0;
  for (const { name, relPath } of saved) {
    const node = view.state.schema.nodes.image.create({ src: relPath, alt: name });
    tr.insert(at + offset, node);
    offset += node.nodeSize;
  }
  view.dispatch(tr);
}

/** ProseMirror `handlePaste` for image files on the clipboard. Returns
 *  false (lets the next handler run) when the clipboard has no images. */
export function createImagePasteHandler(deps: ImageHandlerDeps) {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((f) =>
      IMAGE_MIME.test(f.type)
    );
    if (imageFiles.length === 0) return false;
    event.preventDefault();
    // Capture insertion point now — the selection will be stale by the
    // time the async saves complete.
    const pasteFrom = view.state.selection.from;
    void saveImageFiles(
      imageFiles,
      (file) => mimeTypeToImageExtension(file.type),
      (file) => file.name || "pasted-image",
      "editor.paste_image_error",
      deps
    ).then((saved) => {
      if (saved.length === 0) return;
      const insertFrom = Math.min(pasteFrom, view.state.doc.content.size);
      insertImageNodes(view, insertFrom, saved);
    });
    return true;
  };
}

/** ProseMirror `handleDrop` for image files. dragDropEnabled is false in
 *  tauri.conf.json, so `File.path` is not populated by Tauri — bytes are
 *  read from the File object directly, consistent with clipboard paste. */
export function createImageDropHandler(deps: ImageHandlerDeps) {
  return (view: EditorView, event: DragEvent): boolean => {
    const imageFiles = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      IMAGE_MIME.test(f.type)
    );
    if (imageFiles.length === 0) return false;
    event.preventDefault();
    const dropX = event.clientX;
    const dropY = event.clientY;
    void saveImageFiles(
      imageFiles,
      resolveImageExtension,
      (file) => file.name.replace(/\.[^.]+$/, ""),
      "editor.drop_image_error",
      deps
    ).then((saved) => {
      if (saved.length === 0) return;
      const dropPos = view.posAtCoords({ left: dropX, top: dropY })?.pos;
      if (dropPos === undefined) return;
      insertImageNodes(view, dropPos, saved);
    });
    return true;
  };
}
