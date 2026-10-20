import { LogicalPosition } from "@tauri-apps/api/dpi";

interface KeyLike {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/** Shift+F10 or the keyboard's Menu key: open a row's context menu. */
export function isContextMenuKey(e: KeyLike): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}

/** Cmd+Backspace (Ctrl+Backspace elsewhere): Finder's Move to Trash. */
export function isTrashKey(e: KeyLike): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "Backspace";
}

/** F2: rename, as in Finder's and Explorer's file lists. */
export function isRenameKey(e: KeyLike): boolean {
  return e.key === "F2" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
}

/** Where a row's context menu opens from the keyboard: just below the
 *  start of the row, in window coordinates (the webview fills the window).
 *  A mouse-opened menu passes no position and appears at the pointer. */
export function rowMenuPosition(row: Element): LogicalPosition {
  const rect = row.getBoundingClientRect();
  return new LogicalPosition(Math.round(rect.left + 16), Math.round(rect.bottom));
}
