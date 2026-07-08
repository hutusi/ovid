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
| `Cmd+F` | Find (in document) | Ovid |
| `Cmd+H` | Find & replace | Ovid · macOS Hide may intercept |
| `Enter` / `Shift+Enter` | Next / previous match (in the find field) | Ovid |
| `Enter` / `Cmd+Enter` | Replace current / replace all (in the replace field) | Ovid |
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
| `Cmd+Shift+L` | Toggle sidebar |
| `Cmd+Shift+P` | Toggle properties panel |
| `Cmd+,` | Open preferences |
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

## Markdown shortcuts (typed patterns)

These are not keyboard chords — they are character sequences the editor recognizes as you type and transforms inline. They apply only in the editor body, not in the title or properties panel.

| Pattern | Result |
|---|---|
| `# `, `## `, `### ` … `###### ` | Heading 1–6 (at start of line) |
| `**word**` | **Bold** |
| `__word__` | **Bold** |
| `*word*` | *Italic* |
| `_word_` | *Italic* |
| `~~word~~` | ~~Strikethrough~~ |
| `` `word` `` | Inline code |
| `- ` or `* ` | Bullet list (at start of line) |
| `1. ` | Ordered list (at start of line) |
| `[ ] ` inside a bullet | Convert that bullet into a task list item |
| `> ` | Blockquote (at start of line) |
| `[text](url)` | Link with the given visible text and href |
| `![alt](src)` | Inline image — `src` is taken verbatim (local path or URL); resolution at render time goes through `resolveImageSrc` |
| `[[Target]]` | Wiki link to the note titled / aliased "Target" — click opens it, or creates `notes/<slug>.md` if it doesn't exist yet ([ADR 0016](adr/0016-bidirectional-wiki-links.md)) |
| `[[Target\|Display]]` | Wiki link to "Target" but rendered with the surface text "Display" |
| `---` | Horizontal rule |
| ` ``` ` | Code block |

### CJK behavior

Bold, italic, strikethrough, and image input rules in Ovid drop the upstream Tiptap "whitespace before `**`/`*`/`~~`/`![`" prefix so the shortcut also fires after Chinese/Japanese/Korean characters — e.g. `测试**word**` produces `测试`**word**, not literal asterisks; `你好![cat](src)` inserts an inline image instead of stranding the markdown as text. Italic uses negative lookbehind/lookahead (`(?<!\*)\*(?!\*)…`) to avoid prematurely italicizing the intermediate `**word*` state while you're typing bold, and the link rule carries `(?<!!)` so it doesn't cannibalise the `[alt](src)` slice of image syntax. See `src/components/Editor.tsx`, `src/lib/tiptap/markdownInputRules.test.ts`, and `src/lib/tiptap/ImageRenderer.test.ts` for the exact rules.

Structural rules (`# `, `- `, `> `, etc.) are *suppressed* on `compositionend` to avoid a CJK IME bug — see [ADR 0015](adr/0015-ime-composition-guard.md) for the rationale.

---

## Notes for contributors

- **Single source of truth:** `src/lib/shortcuts.ts`. The in-app help dialog renders from this module; this doc is hand-maintained to stay in sync. A test (`src/lib/shortcuts.test.ts`) asserts that every editor-source entry in `shortcuts.ts` matches the actual `editorCommands` row.
- **Tiptap conflict trap.** ProseMirror's keymap normalizes `Mod-Shift-<letter>` to `Mod-<letter>` when the bound key is a single letter, so a binding like `{mod, shift, key: "i"}` collides with Tiptap's `Mod-i` Italic and both handlers fire. This was the original `Cmd+Shift+I` bug. The `bindingConflictsWithTiptap` helper in `src/lib/shortcuts.ts` encodes the rule; `src/lib/editor/commands.test.ts` runs every command-table shortcut through it so future bindings cannot silently re-introduce the same class of bug.
- **DevTools shortcut trap.** `Cmd+Alt+I` (Mac) / `Ctrl+Shift+I` is the universal browser DevTools shortcut. Tauri's WebView inherits it, so binding either combo creates a conflict (worse in dev, present in some prod builds). Avoid them. This is why `insert-image` has no keyboard shortcut — every "natural" combo for it conflicts with something.
- **Native menu accelerators.** Where a shortcut also has a menu entry, the accelerator is declared in `src-tauri/src/menu.rs` so the macOS menu bar surfaces it. Adding a new menu shortcut means an entry in both `commands.ts` (or `useKeyboardShortcuts.ts`) *and* the accelerator string in `menu.rs`.
- **Cmd+H on macOS.** macOS reserves `Cmd+H` for "Hide Window." Tauri sometimes passes it through to the app, sometimes the OS intercepts first. If find/replace stops working on macOS in a future Tauri version, rebind this shortcut.
