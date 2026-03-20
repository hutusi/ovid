import { Extension, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export type BackspaceAction =
  | { type: "liftListItem" }
  | { type: "liftBlockquote" }
  | { type: "unwrapHeading" };

export function getBackspaceAction(state: EditorState): BackspaceAction | null {
  const { selection } = state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;
  if ($from.parentOffset !== 0) {
    return null;
  }

  if ($from.parent.content.size === 0) {
    return null;
  }

  if ($from.parent.type.name === "heading") {
    return { type: "unwrapHeading" };
  }

  if ($from.parent.type.name !== "paragraph") {
    return null;
  }

  for (let depth = $from.depth - 1; depth >= 0; depth--) {
    const node = $from.node(depth);

    if (node.type.name === "listItem") {
      return $from.index(depth) === 0 ? { type: "liftListItem" } : null;
    }

    if (node.type.name === "blockquote") {
      return { type: "liftBlockquote" };
    }
  }

  return null;
}

export function applyBackspaceAction(editor: Editor): boolean {
  const action = getBackspaceAction(editor.state);
  if (!action) {
    return false;
  }

  if (action.type === "liftListItem") {
    return editor.commands.liftListItem("listItem");
  }

  if (action.type === "liftBlockquote") {
    return editor.commands.lift("blockquote");
  }

  return editor.commands.setParagraph();
}

export const ListBackspace = Extension.create({
  name: "listBackspace",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        return applyBackspaceAction(this.editor);
      },
    };
  },
});
