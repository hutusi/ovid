/**
 * Single source of truth for every keyboard shortcut in Ovid.
 *
 * Consumed by:
 *   - the in-app Keyboard Shortcuts help dialog
 *   - docs/shortcuts.md (hand-maintained to match this module)
 *   - the conflict-with-Tiptap-defaults test in
 *     `src/lib/editor/commands.test.ts`
 *
 * Adding or changing a shortcut means an entry here AND wiring it in its
 * source location (`useKeyboardShortcuts.ts`, `src/lib/editor/commands.ts`,
 * or — for Tiptap — relying on the extension's own binding). The
 * `editorCommands[].keys` test asserts that every editor-source entry here
 * matches a real command-table row.
 */

import { editorCommands } from "./editor/commands";

export type ShortcutCategory =
  | "navigation"
  | "files"
  | "editing"
  | "format"
  | "view"
  | "git"
  | "help";

export type ShortcutSource = "global" | "editor" | "tiptap";

export interface ShortcutKeys {
  /** Cmd on macOS / Ctrl elsewhere. */
  mod: boolean;
  shift?: boolean;
  alt?: boolean;
  /** macOS-only Ctrl pressed *in addition* to mod (i.e. Cmd+Ctrl). Used
   *  by zen mode (Ctrl+Cmd+Z) to avoid conflicting with Cmd+Shift+Z
   *  (Redo). */
  ctrl?: boolean;
  /** Lowercased KeyboardEvent.key value, or a single non-letter character
   *  like "\\" or "/", or a named key like "Escape". */
  key: string;
}

export interface ShortcutEntry {
  /** Stable identifier. For editor-source entries this must match the
   *  matching `editorCommands[].id`. Used by the conflict test and as the
   *  React key in the help dialog. */
  id: string;
  keys: ShortcutKeys;
  /** i18n key under `shortcuts.<key>` in src/locales/*.json. */
  descriptionKey: string;
  category: ShortcutCategory;
  source: ShortcutSource;
  /** Optional human-readable note (e.g. "macOS only", "Tiptap default"). */
  note?: string;
}

// ─── Tiptap defaults ──────────────────────────────────────────────────────
//
// The bindings StarterKit + the Editor.tsx extension set add for us. Listed
// so the in-app help dialog can render them and so the conflict test can
// validate that we never bind the same combo a second time.

const TIPTAP_DEFAULT_ENTRIES: ShortcutEntry[] = [
  {
    id: "tiptap-bold",
    keys: { mod: true, key: "b" },
    descriptionKey: "format_bold",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-italic",
    keys: { mod: true, key: "i" },
    descriptionKey: "format_italic",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-code",
    keys: { mod: true, key: "e" },
    descriptionKey: "format_code",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-strike",
    keys: { mod: true, shift: true, key: "s" },
    descriptionKey: "format_strike",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-heading-1",
    keys: { mod: true, alt: true, key: "1" },
    descriptionKey: "format_heading_1",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-heading-2",
    keys: { mod: true, alt: true, key: "2" },
    descriptionKey: "format_heading_2",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-heading-3",
    keys: { mod: true, alt: true, key: "3" },
    descriptionKey: "format_heading_3",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-heading-4",
    keys: { mod: true, alt: true, key: "4" },
    descriptionKey: "format_heading_4",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-heading-5",
    keys: { mod: true, alt: true, key: "5" },
    descriptionKey: "format_heading_5",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-heading-6",
    keys: { mod: true, alt: true, key: "6" },
    descriptionKey: "format_heading_6",
    category: "format",
    source: "tiptap",
  },
  {
    id: "tiptap-undo",
    keys: { mod: true, key: "z" },
    descriptionKey: "edit_undo",
    category: "editing",
    source: "tiptap",
  },
  {
    id: "tiptap-redo",
    keys: { mod: true, shift: true, key: "z" },
    descriptionKey: "edit_redo",
    category: "editing",
    source: "tiptap",
  },
  {
    id: "tiptap-list-indent",
    keys: { mod: false, key: "Tab" },
    descriptionKey: "list_indent",
    category: "editing",
    source: "tiptap",
    note: "in_list_item",
  },
  {
    id: "tiptap-list-dedent",
    keys: { mod: false, shift: true, key: "Tab" },
    descriptionKey: "list_dedent",
    category: "editing",
    source: "tiptap",
    note: "in_list_item",
  },
];

// ─── Global shortcuts (useKeyboardShortcuts.ts) ───────────────────────────

const GLOBAL_ENTRIES: ShortcutEntry[] = [
  {
    id: "toggle-sidebar",
    keys: { mod: true, key: "\\" },
    descriptionKey: "toggle_sidebar",
    category: "view",
    source: "global",
  },
  {
    id: "toggle-properties",
    keys: { mod: true, shift: true, key: "p" },
    descriptionKey: "toggle_properties",
    category: "view",
    source: "global",
  },
  {
    id: "toggle-search",
    keys: { mod: true, shift: true, key: "f" },
    descriptionKey: "toggle_search",
    category: "navigation",
    source: "global",
  },
  {
    id: "zen-mode",
    keys: { mod: true, ctrl: true, key: "z" },
    descriptionKey: "zen_mode",
    category: "view",
    source: "global",
  },
  {
    id: "file-switcher",
    keys: { mod: true, key: "p" },
    descriptionKey: "file_switcher",
    category: "navigation",
    source: "global",
  },
  {
    id: "open-workspace",
    keys: { mod: true, key: "o" },
    descriptionKey: "open_workspace",
    category: "files",
    source: "global",
  },
  {
    id: "switch-workspace",
    keys: { mod: true, shift: true, key: "o" },
    descriptionKey: "switch_workspace",
    category: "files",
    source: "global",
  },
  {
    id: "new-file",
    keys: { mod: true, key: "n" },
    descriptionKey: "new_file",
    category: "files",
    source: "global",
  },
  {
    id: "today-flow",
    keys: { mod: true, shift: true, key: "t" },
    descriptionKey: "today_flow",
    category: "files",
    source: "global",
  },
  {
    id: "save",
    keys: { mod: true, key: "s" },
    descriptionKey: "save",
    category: "files",
    source: "global",
  },
  {
    id: "close-file",
    keys: { mod: true, key: "w" },
    descriptionKey: "close_file",
    category: "files",
    source: "global",
  },
  {
    id: "git-commit",
    keys: { mod: true, shift: true, key: "g" },
    descriptionKey: "git_commit",
    category: "git",
    source: "global",
  },
  {
    id: "show-shortcuts",
    keys: { mod: false, shift: true, key: "?" },
    descriptionKey: "show_shortcuts",
    category: "help",
    source: "global",
    note: "no_modifier",
  },
];

// ─── Editor command table (src/lib/editor/commands.ts) ────────────────────

const EDITOR_ENTRIES: ShortcutEntry[] = [
  {
    id: "insert-link",
    keys: { mod: true, key: "k" },
    descriptionKey: "insert_link",
    category: "editing",
    source: "editor",
  },
  {
    id: "paste-plain",
    keys: { mod: true, shift: true, key: "v" },
    descriptionKey: "paste_plain",
    category: "editing",
    source: "editor",
  },
  // insert-image has no keyboard shortcut: Cmd+Shift+I collides with
  // Tiptap italic (shift-letter normalization) and Cmd+Alt+I is the
  // universal browser DevTools shortcut. The Insert menu, drag-drop,
  // and clipboard paste cover the use case.
  {
    id: "toggle-find-replace",
    keys: { mod: true, key: "h" },
    descriptionKey: "toggle_find_replace",
    category: "editing",
    source: "editor",
    note: "macos_hide_conflict",
  },
];

export const shortcuts: ShortcutEntry[] = [
  ...GLOBAL_ENTRIES,
  ...EDITOR_ENTRIES,
  ...TIPTAP_DEFAULT_ENTRIES,
];

// ─── Conflict detection ───────────────────────────────────────────────────

/**
 * Encodes the ProseMirror keymap shift-letter normalization rule: a Tiptap
 * binding `Mod-<letter>` *also* matches `Mod-Shift-<letter>` events,
 * because Shift can be a naming modifier for capitalising the letter. This
 * is what made Cmd+Shift+I fire italic alongside our insert-image command
 * before the fix.
 *
 * Returns true when `ours` would dispatch a Tiptap default in addition to
 * the intended command.
 */
function isLetterKey(key: string): boolean {
  return key.length === 1 && /[a-z]/i.test(key);
}

export function bindingConflictsWithTiptap(ours: ShortcutKeys): { tiptap: ShortcutEntry } | null {
  for (const t of TIPTAP_DEFAULT_ENTRIES) {
    const tk = t.keys;
    if (tk.mod !== ours.mod) continue;
    if (!!tk.alt !== !!ours.alt) continue;
    // Cmd+Ctrl combos (e.g. zen-mode's Ctrl+Cmd+Z) carry an extra
    // modifier that Tiptap bindings don't have; ProseMirror's keymap
    // requires exact modifier matching outside the shift-letter
    // fallback, so combos with mismatched ctrl don't conflict.
    if (!!tk.ctrl !== !!ours.ctrl) continue;
    if (tk.key.toLowerCase() !== ours.key.toLowerCase()) continue;

    // Exact-shift match → always a conflict (same combo).
    if (!!tk.shift === !!ours.shift) {
      return { tiptap: t };
    }
    // Shift-letter normalization: Tiptap Mod-<letter> matches our
    // Mod-Shift-<letter>, *and* the reverse (Tiptap Mod-Shift-<letter>
    // matches our Mod-<letter> via the same fallback path).
    if (isLetterKey(tk.key)) {
      return { tiptap: t };
    }
  }
  return null;
}

/** Look up by id. */
export function getShortcutById(id: string): ShortcutEntry | undefined {
  return shortcuts.find((s) => s.id === id);
}

/** Group for the help dialog. */
export function shortcutsByCategory(): Record<ShortcutCategory, ShortcutEntry[]> {
  const out: Record<ShortcutCategory, ShortcutEntry[]> = {
    navigation: [],
    files: [],
    editing: [],
    format: [],
    view: [],
    git: [],
    help: [],
  };
  for (const s of shortcuts) out[s.category].push(s);
  return out;
}

// ─── Cross-checks (used by the tests) ─────────────────────────────────────

/** Every editor-source entry must have a corresponding `editorCommands[]`
 *  row with a matching `keys` binding. Surfaces drift in either direction. */
export function findEditorEntriesWithoutCommand(): ShortcutEntry[] {
  return EDITOR_ENTRIES.filter((entry) => {
    const cmd = editorCommands.find((c) => c.id === entry.id);
    if (!cmd?.keys) return true;
    return (
      cmd.keys.mod !== entry.keys.mod ||
      !!cmd.keys.shift !== !!entry.keys.shift ||
      !!cmd.keys.alt !== !!entry.keys.alt ||
      cmd.keys.key.toLowerCase() !== entry.keys.key.toLowerCase()
    );
  });
}

/** Every command-table entry with `keys` must appear in shortcuts.ts. */
export function findCommandsWithoutShortcutEntry(): string[] {
  return editorCommands
    .filter((c) => c.keys !== undefined)
    .filter((c) => !EDITOR_ENTRIES.find((e) => e.id === c.id))
    .map((c) => c.id);
}
