import { describe, expect, it } from "bun:test";
import { bindingConflictsWithTiptap } from "../shortcuts";
import {
  commandCanRun,
  type EditorCommandCtx,
  editorCommands,
  getEditorCommandById,
  shortcutMatches,
} from "./commands";

// Menu-action payload ids that the previous Editor.tsx menu-action
// listener (Editor.tsx:658-738) handled. The table must keep covering
// every one of these so the native menu bar stays fully wired.
const EDITOR_MENU_PAYLOADS = [
  "format-bold",
  "format-italic",
  "format-strike",
  "format-code",
  "format-heading-1",
  "format-heading-2",
  "format-heading-3",
  "format-heading-4",
  "format-heading-5",
  "format-heading-6",
  "format-blockquote",
  "format-bullet-list",
  "format-ordered-list",
  "format-task-list",
  "format-markdown",
  "insert-link",
  "insert-image",
  "insert-code-block",
  "insert-hr",
  "insert-table",
] as const;

describe("editorCommands integrity", () => {
  it("every id is unique", () => {
    const ids = editorCommands.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("no two commands share the same keyboard shortcut", () => {
    const shortcuts = editorCommands
      .filter((c) => c.keys !== undefined)
      .map((c) => `${c.keys?.mod ? "mod+" : ""}${c.keys?.shift ? "shift+" : ""}${c.keys?.key}`);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("covers every menu payload the old Editor listener handled", () => {
    // Regression net: if a menu-routed command is dropped from the table,
    // the corresponding menu bar item becomes a no-op. The previous
    // implementation crashed loudly on missing cases; the table-driven
    // version silently no-ops, so this test is the safety rail.
    for (const payload of EDITOR_MENU_PAYLOADS) {
      const cmd = getEditorCommandById(payload);
      expect(cmd, `missing command for menu payload "${payload}"`).toBeDefined();
    }
  });

  it("no command-table shortcut collides with a Tiptap default", () => {
    // Catches the Cmd+Shift+I class of bug forever. ProseMirror's keymap
    // normalizes Mod-Shift-<letter> to Mod-<letter>, so a binding of
    // {mod, shift, key: "i"} silently double-fires with Tiptap's Italic.
    // The bindingConflictsWithTiptap helper encodes that rule.
    for (const cmd of editorCommands) {
      if (!cmd.keys) continue;
      const conflict = bindingConflictsWithTiptap(cmd.keys);
      expect(
        conflict,
        `editor command "${cmd.id}" shortcut collides with Tiptap default "${conflict?.tiptap.id}"`
      ).toBeNull();
    }
  });

  it("Cmd+Shift+B is not bound (would collide with Tiptap Bold)", () => {
    // Latent class-of-bug regression net. If anyone adds {mod, shift, key: "b"}
    // to a command, they hit the same trap as the original Cmd+Shift+I bug.
    // This test catches it at the table level (the no-Tiptap-collision test
    // above would also fire, but a named test makes the failure obvious).
    const collision = editorCommands.find(
      (c) => c.keys?.mod === true && c.keys?.shift === true && c.keys?.key.toLowerCase() === "b"
    );
    expect(collision, "Cmd+Shift+B must not be bound — collides with Tiptap Bold").toBeUndefined();
  });
});

describe("shortcutMatches", () => {
  // KeyboardEvent isn't part of bun:test's runtime; a plain object with the
  // five fields shortcutMatches reads is enough for the contract under test.
  function ev(
    opts: {
      metaKey?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      key?: string;
    } = {}
  ): KeyboardEvent {
    return {
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.ctrlKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      altKey: opts.altKey ?? false,
      key: opts.key ?? "",
    } as unknown as KeyboardEvent;
  }

  it("returns true on exact match", () => {
    expect(shortcutMatches({ mod: true, key: "k" }, ev({ metaKey: true, key: "k" }))).toBe(true);
    expect(shortcutMatches({ mod: true, key: "k" }, ev({ ctrlKey: true, key: "k" }))).toBe(true);
  });

  it("case-insensitive on key", () => {
    expect(shortcutMatches({ mod: true, key: "k" }, ev({ metaKey: true, key: "K" }))).toBe(true);
  });

  it("requires shift when bound, forbids it when unbound", () => {
    expect(
      shortcutMatches(
        { mod: true, shift: true, key: "v" },
        ev({ metaKey: true, shiftKey: true, key: "v" })
      )
    ).toBe(true);
    expect(
      shortcutMatches(
        { mod: true, shift: true, key: "v" },
        ev({ metaKey: true, shiftKey: false, key: "v" })
      )
    ).toBe(false);
    expect(
      shortcutMatches({ mod: true, key: "k" }, ev({ metaKey: true, shiftKey: true, key: "k" }))
    ).toBe(false);
  });

  it("requires alt when bound, forbids it when unbound", () => {
    // Cmd+Alt+I is the post-Cmd+Shift+I-conflict-fix binding for insert-image.
    // The matcher must distinguish it from Cmd+I (Tiptap italic).
    expect(
      shortcutMatches(
        { mod: true, alt: true, key: "i" },
        ev({ metaKey: true, altKey: true, key: "i" })
      )
    ).toBe(true);
    expect(
      shortcutMatches(
        { mod: true, alt: true, key: "i" },
        ev({ metaKey: true, altKey: false, key: "i" })
      )
    ).toBe(false);
    expect(
      shortcutMatches({ mod: true, key: "k" }, ev({ metaKey: true, altKey: true, key: "k" }))
    ).toBe(false);
  });

  it("returns false when mod is missing", () => {
    expect(shortcutMatches({ mod: true, key: "k" }, ev({ key: "k" }))).toBe(false);
  });
});

describe("commandCanRun", () => {
  function makeCtx(overrides: Partial<EditorCommandCtx>): EditorCommandCtx {
    return {
      // biome-ignore lint/suspicious/noExplicitAny: tests only need a few fields
      editor: { isFocused: true } as any,
      filePath: undefined,
      onError: undefined,
      setLinkDialog: () => {},
      setShowFindReplace: () => {},
      formatMarkdownSpacing: () => {},
      showFindReplace: false,
      linkDialogOpen: false,
      t: (k) => k,
      ...overrides,
    };
  }

  it("defaults to editor.isFocused when when is omitted", () => {
    const bold = getEditorCommandById("format-bold");
    expect(bold).toBeDefined();
    if (!bold) return;
    expect(commandCanRun(bold, makeCtx({}))).toBe(true);
    // biome-ignore lint/suspicious/noExplicitAny: tests only need a few fields
    expect(commandCanRun(bold, makeCtx({ editor: { isFocused: false } as any }))).toBe(false);
  });

  it("toggle-find-replace allows running when bar is open but editor unfocused", () => {
    const cmd = getEditorCommandById("toggle-find-replace");
    expect(cmd).toBeDefined();
    if (!cmd) return;
    // biome-ignore lint/suspicious/noExplicitAny: tests only need a few fields
    const blurred = { isFocused: false } as any;
    expect(commandCanRun(cmd, makeCtx({ editor: blurred, showFindReplace: false }))).toBe(false);
    expect(commandCanRun(cmd, makeCtx({ editor: blurred, showFindReplace: true }))).toBe(true);
  });
});
