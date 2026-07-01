import type { Editor } from "@tiptap/core";

interface MarkdownStorage {
  getMarkdown(): string;
}

/** `tiptap-markdown`'s storage shape isn't in the public Storage type, so
 *  every call site had to redeclare its own `as any` to reach it. One typed
 *  accessor instead of N untyped casts. */
export function getMarkdownStorage(editor: Editor): MarkdownStorage {
  // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown storage has no public type
  return (editor.storage as any).markdown;
}
