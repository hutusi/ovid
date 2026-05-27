import type { Editor } from "@tiptap/react";
import { useEffect } from "react";
import { listenEvent } from "../commands/internal";
import {
  commandCanRun,
  type EditorCommandCtx,
  editorCommands,
  getEditorCommandById,
  shortcutMatches,
} from "./commands";

/**
 * Wire keyboard shortcuts and Tauri menu-action events to the editor
 * command table. Replaces the five separate global keydown useEffects
 * and the seventeen-case menu-action switch that previously lived in
 * Editor.tsx.
 *
 * Two effects:
 * - `keydown` on window (capture-false) iterates the table for the
 *   first command whose shortcut matches and whose `when` guard
 *   allows. Captures preventDefault before delegating to `run`.
 * - `menu-action` listener looks the payload up by id and runs the
 *   command, suppressing all commands when the inline link dialog is
 *   open — matches the global guard the old listener applied.
 *
 * The ctx object is reconstructed every render (closure-captured
 * `editor`, `setLinkDialog`, etc.). React's dependency array catches
 * any drift.
 */
export function useEditorCommands(
  editor: Editor | null,
  ctx: Omit<EditorCommandCtx, "editor">
): void {
  useEffect(() => {
    if (!editor) return;
    const fullCtx: EditorCommandCtx = { ...ctx, editor };
    function onKeyDown(e: KeyboardEvent) {
      for (const cmd of editorCommands) {
        if (!cmd.keys) continue;
        if (!shortcutMatches(cmd.keys, e)) continue;
        if (!commandCanRun(cmd, fullCtx)) continue;
        e.preventDefault();
        void cmd.run(fullCtx);
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, ctx]);

  useEffect(() => {
    if (!editor) return;
    const fullCtx: EditorCommandCtx = { ...ctx, editor };
    return listenEvent<string>("menu-action", (payload) => {
      // Globally suppress when the link dialog is open — matches the
      // pre-table behavior of the menu listener (Editor.tsx:662).
      if (fullCtx.linkDialogOpen) return;
      const cmd = getEditorCommandById(payload);
      if (!cmd) return;
      void cmd.run(fullCtx);
    });
  }, [editor, ctx]);
}
