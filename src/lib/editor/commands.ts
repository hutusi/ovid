// Side-effect imports for Tiptap module augmentations. The Table and Image
// extensions declare setImage / insertTable on the ChainedCommands interface;
// without these imports the test-tsconfig (which compiles in isolation from
// Editor.tsx's extension imports) flags them as missing.
import "@tiptap/extension-image";
import "@tiptap/extension-table";
import type { Editor } from "@tiptap/react";
import type React from "react";
import { commands } from "../commands";

/** Translator function shape, mirrors the project-wide Translate type used
 *  by pure helpers to stay framework-free. */
type Translate = (key: string, vars?: Record<string, unknown>) => string;

export interface EditorCommandCtx {
  editor: Editor;
  filePath?: string;
  onError?: (msg: string) => void;
  setLinkDialog: (d: { href: string } | null) => void;
  setShowFindReplace: React.Dispatch<React.SetStateAction<boolean>>;
  formatMarkdownSpacing: (editor: Editor) => void;
  /** True when the find/replace bar is visible. Cmd+H stays bindable while
   *  the bar has focus (so the user can press it again to dismiss). */
  showFindReplace: boolean;
  /** True when the inline link-edit dialog is open. Menu dispatch
   *  suppresses every command while it is — matches the global guard the
   *  old menu-action listener applied. */
  linkDialogOpen: boolean;
  t: Translate;
}

/** Open a system file picker, copy the chosen image into the active file's
 *  sibling images/ dir via commands.assets.save, and insert it at the
 *  cursor as a markdown image. Errors surface through onError (the toast
 *  channel) when available; otherwise they log to console.
 *
 *  Backs the insert-image menu action and the Cmd+Shift+I shortcut.
 *  Drag-drop and clipboard-paste flows use commands.assets.saveFromBytes
 *  directly in Editor.tsx's editorProps. */
async function pickAndInsertImage(
  editor: Editor,
  filePath: string | undefined,
  onError?: (msg: string) => void
): Promise<void> {
  try {
    const srcPath = await commands.assets.pickImage();
    if (!srcPath) return;
    const relPath = await commands.assets.save({ srcPath, activeFilePath: filePath });
    // Split on both / and \ to handle Windows paths correctly
    const fileName = (srcPath.split(/[/\\]/).pop() ?? "image").replace(/\.[^.]+$/, "");
    editor.chain().focus().setImage({ src: relPath, alt: fileName }).run();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const msg = `Failed to insert image: ${reason}`;
    if (onError) onError(msg);
    else console.error(msg);
  }
}

export interface EditorCommand {
  /** Menu-action payload string. Must match the id in `src-tauri/src/menu.rs`
   *  for menu-dispatched commands. Keyboard-only commands still need a
   *  unique id for table lookup and uniqueness tests. */
  id: string;
  /** Optional keyboard binding. `mod` is true for Cmd-on-mac /
   *  Ctrl-elsewhere; `shift` and `alt` default to false. `key` is the
   *  lowercased KeyboardEvent.key value.
   *
   *  Note on `shift`+letter combos: ProseMirror's keymap normalizes a
   *  bound `Mod-<letter>` to also match `Mod-Shift-<letter>` events
   *  (because Shift can be a "naming" modifier for capitalising the
   *  letter). So a binding of `{mod, shift, key: "i"}` will collide with
   *  Tiptap's `Mod-i` Italic binding — both fire. Prefer `alt` for
   *  letter-based command shortcuts that overlap a Tiptap default. The
   *  Tiptap-conflict test in `src/lib/shortcuts.ts` catches this. */
  keys?: { mod: true; shift?: boolean; alt?: boolean; key: string };
  /** Guard for keyboard dispatch. Defaults to `editor.isFocused`. Menu
   *  dispatch does not consult `when` — it uses a global `linkDialogOpen`
   *  suppress instead, matching the old behavior. */
  when?: (ctx: EditorCommandCtx) => boolean;
  run: (ctx: EditorCommandCtx) => void | Promise<void>;
}

const focused = (ctx: EditorCommandCtx) => ctx.editor.isFocused;

/** The single source of truth for every editor-routed command. Keyboard
 *  shortcuts and menu actions are dispatched from this table — adding a
 *  new editor command is one row here plus (optionally) one entry in
 *  `src-tauri/src/menu.rs`. */
export const editorCommands: EditorCommand[] = [
  // Keyboard-bound commands (most also have menu entries)
  {
    id: "insert-link",
    keys: { mod: true, key: "k" },
    run: ({ editor, setLinkDialog }) => {
      const href = editor.getAttributes("link").href ?? "";
      setLinkDialog({ href });
    },
  },
  {
    // No `keys` binding: Tiptap's Code extension natively handles Cmd+E.
    // Binding it here too would dispatch the toggle twice (net no-op).
    // The id stays so the menu accelerator (defined in src-tauri/src/menu.rs)
    // still routes Format → Inline Code through this command.
    id: "format-code",
    run: ({ editor }) => {
      editor.chain().focus().toggleCode().run();
    },
  },
  {
    id: "paste-plain",
    keys: { mod: true, shift: true, key: "v" },
    run: ({ editor, onError }) => {
      navigator.clipboard
        .readText()
        .then((text) => {
          editor.view.dispatch(editor.view.state.tr.insertText(text));
        })
        .catch((err) => {
          const reason = err instanceof Error ? err.message : String(err);
          const msg = `Failed to read clipboard: ${reason}`;
          if (onError) onError(msg);
          else console.error(msg);
        });
    },
  },
  {
    // No keyboard shortcut. Cmd+Shift+I collides with Tiptap italic
    // (ProseMirror shift-letter normalization); Cmd+Alt+I is the
    // universal browser DevTools shortcut. Image insertion is
    // low-frequency and already covered by the Insert menu, drag-drop
    // from Finder, and clipboard paste — none of which need a hotkey.
    id: "insert-image",
    run: ({ editor, filePath, onError }) => pickAndInsertImage(editor, filePath, onError),
  },
  {
    id: "toggle-find-replace",
    keys: { mod: true, key: "h" },
    when: (ctx) => ctx.editor.isFocused || ctx.showFindReplace,
    run: ({ editor, setShowFindReplace }) => {
      setShowFindReplace((v) => {
        if (v) editor.chain().focus().run();
        return !v;
      });
    },
  },

  // Inline formatting
  {
    id: "format-bold",
    run: ({ editor }) => {
      editor.chain().focus().toggleBold().run();
    },
  },
  {
    id: "format-italic",
    run: ({ editor }) => {
      editor.chain().focus().toggleItalic().run();
    },
  },
  {
    id: "format-strike",
    run: ({ editor }) => {
      editor.chain().focus().toggleStrike().run();
    },
  },

  // Headings
  {
    id: "format-heading-1",
    run: ({ editor }) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    id: "format-heading-2",
    run: ({ editor }) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    id: "format-heading-3",
    run: ({ editor }) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    id: "format-heading-4",
    run: ({ editor }) => {
      editor.chain().focus().toggleHeading({ level: 4 }).run();
    },
  },
  {
    id: "format-heading-5",
    run: ({ editor }) => {
      editor.chain().focus().toggleHeading({ level: 5 }).run();
    },
  },
  {
    id: "format-heading-6",
    run: ({ editor }) => {
      editor.chain().focus().toggleHeading({ level: 6 }).run();
    },
  },

  // Block formatting
  {
    id: "format-blockquote",
    run: ({ editor }) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: "format-bullet-list",
    run: ({ editor }) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "format-ordered-list",
    run: ({ editor }) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "format-task-list",
    run: ({ editor }) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "format-markdown",
    run: ({ editor, formatMarkdownSpacing }) => formatMarkdownSpacing(editor),
  },

  // Insert
  {
    id: "insert-code-block",
    run: ({ editor }) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: "insert-hr",
    run: ({ editor }) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    id: "insert-table",
    run: ({ editor }) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
];

/** Helpers for testing + for the hook in commit 12. */

export function getEditorCommandById(id: string): EditorCommand | undefined {
  return editorCommands.find((c) => c.id === id);
}

export function shortcutMatches(
  keys: NonNullable<EditorCommand["keys"]>,
  e: KeyboardEvent
): boolean {
  if (keys.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (!!keys.shift !== e.shiftKey) return false;
  if (!!keys.alt !== e.altKey) return false;
  return e.key?.toLowerCase() === keys.key;
}

export function commandCanRun(cmd: EditorCommand, ctx: EditorCommandCtx): boolean {
  return (cmd.when ?? focused)(ctx);
}
