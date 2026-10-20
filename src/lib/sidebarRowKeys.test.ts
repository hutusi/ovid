import { describe, expect, it } from "bun:test";
import { isContextMenuKey, isRenameKey, isTrashKey } from "./sidebarRowKeys";

const none = { shiftKey: false, metaKey: false, ctrlKey: false, altKey: false };

describe("sidebar row keys", () => {
  it("opens the context menu on the Menu key or Shift+F10 only", () => {
    expect(isContextMenuKey({ ...none, key: "ContextMenu" })).toBe(true);
    expect(isContextMenuKey({ ...none, key: "F10", shiftKey: true })).toBe(true);
    expect(isContextMenuKey({ ...none, key: "F10" })).toBe(false);
    expect(isContextMenuKey({ ...none, key: "F10", shiftKey: true, metaKey: true })).toBe(false);
  });

  it("trashes on Cmd+Backspace or Ctrl+Backspace, not plain or shifted Backspace", () => {
    expect(isTrashKey({ ...none, key: "Backspace", metaKey: true })).toBe(true);
    expect(isTrashKey({ ...none, key: "Backspace", ctrlKey: true })).toBe(true);
    expect(isTrashKey({ ...none, key: "Backspace" })).toBe(false);
    expect(isTrashKey({ ...none, key: "Backspace", metaKey: true, shiftKey: true })).toBe(false);
    expect(isTrashKey({ ...none, key: "Delete", metaKey: true })).toBe(false);
  });

  it("renames on a bare F2", () => {
    expect(isRenameKey({ ...none, key: "F2" })).toBe(true);
    expect(isRenameKey({ ...none, key: "F2", shiftKey: true })).toBe(false);
  });
});
