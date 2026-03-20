import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export type BackspaceAction =
  | { type: "liftListItem"; itemType: "listItem" | "taskItem" }
  | { type: "liftBlockquote" }
  | { type: "unwrapHeading" }
  | { type: "unwrapEmptyCodeBlock" }
  | { type: "preserveCodeBlock" };

export function getBackspaceAction(state: EditorState): BackspaceAction | null {
  const { selection } = state;

  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;
  if ($from.parentOffset !== 0) {
    return null;
  }

  const isEmptyTextblock = $from.parent.content.size === 0;

  if ($from.parent.type.name === "codeBlock") {
    if (isEmptyTextblock) {
      return { type: "unwrapEmptyCodeBlock" };
    }

    return { type: "preserveCodeBlock" };
  }

  if ($from.parent.type.name === "heading") {
    if (isEmptyTextblock) {
      return null;
    }

    return { type: "unwrapHeading" };
  }

  if ($from.parent.type.name !== "paragraph") {
    return null;
  }

  for (let depth = $from.depth - 1; depth >= 0; depth--) {
    const node = $from.node(depth);

    if (node.type.name === "listItem") {
      return $from.index(depth) === 0 ? { type: "liftListItem", itemType: "listItem" } : null;
    }

    if (node.type.name === "taskItem") {
      return $from.index(depth) === 0 ? { type: "liftListItem", itemType: "taskItem" } : null;
    }

    if (node.type.name === "blockquote") {
      if (isEmptyTextblock) {
        return null;
      }

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
    return editor.commands.liftListItem(action.itemType);
  }

  if (action.type === "liftBlockquote") {
    return editor.commands.lift("blockquote");
  }

  if (action.type === "unwrapEmptyCodeBlock") {
    return editor.commands.clearNodes();
  }

  if (action.type === "preserveCodeBlock") {
    return true;
  }

  if (action.type === "unwrapHeading") {
    return editor.commands.setParagraph();
  }

  const _exhaustive: never = action;
  return _exhaustive;
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
