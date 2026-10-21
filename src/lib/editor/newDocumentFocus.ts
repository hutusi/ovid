import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Where the caret goes when a just-created file opens. A new post's body is
 * the scaffold placeholder ("Write your content here..."); when the last
 * block is exactly that text, return its range so the first keystroke
 * replaces it. Anything else (an empty note, an existing flow reopened by
 * Today's Flow, a workspace template) returns null: the caller puts the
 * caret at the end, and nothing the user wrote is ever selected.
 */
export function placeholderSelection(
  doc: ProseMirrorNode,
  placeholder: string
): { from: number; to: number } | null {
  const last = doc.lastChild;
  if (!last?.isTextblock || !placeholder) return null;
  if (last.textContent.trim() !== placeholder.trim()) return null;
  const from = doc.content.size - last.nodeSize + 1;
  return { from, to: from + last.content.size };
}
