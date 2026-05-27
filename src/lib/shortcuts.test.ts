import { describe, expect, it } from "bun:test";
import {
  bindingConflictsWithTiptap,
  findCommandsWithoutShortcutEntry,
  findEditorEntriesWithoutCommand,
  shortcuts,
  shortcutsByCategory,
} from "./shortcuts";

describe("shortcuts module", () => {
  it("every id is unique", () => {
    const ids = shortcuts.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("editor-source entries match the editor command table", () => {
    // If this fails, either the entry in shortcuts.ts has the wrong keys
    // or the corresponding row in editorCommands has drifted.
    expect(findEditorEntriesWithoutCommand()).toEqual([]);
  });

  it("every keyboard-bound editor command has a shortcuts.ts entry", () => {
    // If this fails, someone added a `keys` binding to editorCommands but
    // didn't list it here — the help dialog and docs would miss it.
    expect(findCommandsWithoutShortcutEntry()).toEqual([]);
  });

  it("groups every entry into a category bucket", () => {
    const grouped = shortcutsByCategory();
    const total = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(shortcuts.length);
  });
});

describe("bindingConflictsWithTiptap", () => {
  it("flags Cmd+Shift+I as conflicting with Tiptap Mod-i (the pre-fix bug)", () => {
    // The shift-letter normalization rule is the whole reason this helper
    // exists. Cmd+Shift+I must be reported as colliding with italic, even
    // though italic's literal binding is Mod-i.
    const conflict = bindingConflictsWithTiptap({ mod: true, shift: true, key: "i" });
    expect(conflict).not.toBeNull();
    expect(conflict?.tiptap.id).toBe("tiptap-italic");
  });

  it("flags Cmd+Shift+B as conflicting with Tiptap Mod-b (Bold)", () => {
    // Latent class-of-bug net: if anyone binds Cmd+Shift+B to anything,
    // this fires before they hit the same trap.
    const conflict = bindingConflictsWithTiptap({ mod: true, shift: true, key: "b" });
    expect(conflict).not.toBeNull();
    expect(conflict?.tiptap.id).toBe("tiptap-bold");
  });

  it("flags Cmd+E as conflicting with Tiptap Code (the redundant-binding bug)", () => {
    // Exact match. The pre-fix format-code keys: {mod, key: "e"} hit this.
    const conflict = bindingConflictsWithTiptap({ mod: true, key: "e" });
    expect(conflict).not.toBeNull();
    expect(conflict?.tiptap.id).toBe("tiptap-code");
  });

  it("does NOT flag Cmd+Alt+I (the post-fix insert-image binding)", () => {
    // The fix relies on alt distinguishing Cmd+Alt+I from Mod-i. If this
    // ever starts flagging, the fix is broken.
    expect(bindingConflictsWithTiptap({ mod: true, alt: true, key: "i" })).toBeNull();
  });

  it("does NOT flag Cmd+K (insert-link, no Tiptap default)", () => {
    expect(bindingConflictsWithTiptap({ mod: true, key: "k" })).toBeNull();
  });

  it("does NOT flag Cmd+Shift+V (paste-plain, browser-handled key)", () => {
    // Tiptap doesn't bind Mod-Shift-v or Mod-v (paste is browser-native),
    // so this should be clean.
    expect(bindingConflictsWithTiptap({ mod: true, shift: true, key: "v" })).toBeNull();
  });
});
