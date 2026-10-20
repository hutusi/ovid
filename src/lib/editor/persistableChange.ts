import type { Transaction } from "@tiptap/pm/state";

/** Transaction meta that marks a document change as not worth persisting —
 *  set it on programmatic rewrites that must not mark the file dirty. (Loads
 *  and reloads use `setContent({ emitUpdate: false })`, which never emits an
 *  update at all, so they need no meta.) */
export const SKIP_PERSIST_META = "ovid/skipPersist";

/** Whether an editor `update` represents an edit that must reach disk.
 *
 *  Judged on the *root* transaction Tiptap hands to `onUpdate`, not on focus:
 *  Find & Replace, image alt/src inputs and the code-block language picker all
 *  change the document while focus sits in their own inputs, and gating on
 *  `editor.isFocused` silently dropped those edits.
 *
 *  It must not be "any update" either. Tiptap emits `update` when the root
 *  *or an appended* transaction changed the doc, and StarterKit's
 *  TrailingNode appends a paragraph to a document that ends in a code block,
 *  table or image on the first transaction of any kind — a mount-time
 *  selection restore, an IME composition meta, a focus event. Persisting those
 *  would rewrite a file the user merely opened. */
export function isPersistableUpdate(transaction: Transaction): boolean {
  return transaction.docChanged && transaction.getMeta(SKIP_PERSIST_META) !== true;
}
