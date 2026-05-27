# Keyboard Shortcuts

Complete reference for every keyboard shortcut in Ovid. The in-app **Help → Keyboard Shortcuts** dialog (or press `?` from anywhere) renders the same list, sourced from `src/lib/shortcuts.ts`.

On macOS, `Cmd` is the ⌘ key and `Alt` is the ⌥ (Option) key. On Windows and Linux, substitute `Ctrl` for `Cmd`. Tiptap's heading shortcuts (`Cmd+Alt+1..6`) use `Cmd+Alt` on macOS and `Ctrl+Alt` elsewhere.

## Navigation

| Shortcut | Action |
|---|---|
| `Cmd+P` | Quick file switcher |
| `Cmd+Shift+F` | Full-text search |

## Files

| Shortcut | Action |
|---|---|
| `Cmd+N` | New file |
| `Cmd+Shift+T` | Today's flow |
| `Cmd+O` | Open workspace |
| `Cmd+Shift+O` | Switch workspace |
| `Cmd+S` | Save (force, bypass debounce) |
| `Cmd+W` | Close file or tab |

## Editing

| Shortcut | Action | Source |
|---|---|---|
| `Cmd+K` | Insert link | Ovid |
| `Cmd+Shift+V` | Paste as plain text | Ovid |
| `Cmd+H` | Find & replace | Ovid · macOS Hide may intercept |
| `Cmd+Z` | Undo | Tiptap |
| `Cmd+Shift+Z` | Redo | Tiptap |
| `Tab` | Indent (in list item) | Tiptap |
| `Shift+Tab` | Dedent (in list item) | Tiptap |

## Formatting

| Shortcut | Action | Source |
|---|---|---|
| `Cmd+B` | Bold | Tiptap |
| `Cmd+I` | Italic | Tiptap |
| `Cmd+E` | Inline code | Tiptap (also Format menu) |
| `Cmd+Shift+S` | Strikethrough | Tiptap (also Format menu) |
| `Cmd+Alt+1` | Heading 1 | Tiptap (also Format menu) |
| `Cmd+Alt+2` | Heading 2 | Tiptap (also Format menu) |
| `Cmd+Alt+3` | Heading 3 | Tiptap (also Format menu) |
| `Cmd+Alt+4` | Heading 4 | Tiptap (also Format menu) |
| `Cmd+Alt+5` | Heading 5 | Tiptap (also Format menu) |
| `Cmd+Alt+6` | Heading 6 | Tiptap (also Format menu) |

## View

| Shortcut | Action |
|---|---|
| `Cmd+\` | Toggle sidebar |
| `Cmd+Shift+P` | Toggle properties panel |
| `Ctrl+Cmd+Z` | Toggle zen mode (macOS) |
| `Esc` | Exit zen mode |

## Git

| Shortcut | Action |
|---|---|
| `Cmd+Shift+G` | Open commit dialog |

## Help

| Shortcut | Action |
|---|---|
| `?` | Show Keyboard Shortcuts dialog |

---

## Notes for contributors

- **Single source of truth:** `src/lib/shortcuts.ts`. The in-app help dialog renders from this module; this doc is hand-maintained to stay in sync. A test (`src/lib/shortcuts.test.ts`) asserts that every editor-source entry in `shortcuts.ts` matches the actual `editorCommands` row.
- **Tiptap conflict trap.** ProseMirror's keymap normalizes `Mod-Shift-<letter>` to `Mod-<letter>` when the bound key is a single letter, so a binding like `{mod, shift, key: "i"}` collides with Tiptap's `Mod-i` Italic and both handlers fire. This was the original `Cmd+Shift+I` bug. The `bindingConflictsWithTiptap` helper in `src/lib/shortcuts.ts` encodes the rule; `src/lib/editor/commands.test.ts` runs every command-table shortcut through it so future bindings cannot silently re-introduce the same class of bug.
- **DevTools shortcut trap.** `Cmd+Alt+I` (Mac) / `Ctrl+Shift+I` is the universal browser DevTools shortcut. Tauri's WebView inherits it, so binding either combo creates a conflict (worse in dev, present in some prod builds). Avoid them. This is why `insert-image` has no keyboard shortcut — every "natural" combo for it conflicts with something.
- **Native menu accelerators.** Where a shortcut also has a menu entry, the accelerator is declared in `src-tauri/src/menu.rs` so the macOS menu bar surfaces it. Adding a new menu shortcut means an entry in both `commands.ts` (or `useKeyboardShortcuts.ts`) *and* the accelerator string in `menu.rs`.
- **Cmd+H on macOS.** macOS reserves `Cmd+H` for "Hide Window." Tauri sometimes passes it through to the app, sometimes the OS intercepts first. If find/replace stops working on macOS in a future Tauri version, rebind this shortcut.
