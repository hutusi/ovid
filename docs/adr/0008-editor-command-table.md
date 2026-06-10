# ADR 0008 — Editor command dispatch table

**Status:** Accepted
**Date:** 2026-05-27
**Implementing commits:** Track B on `refactor/simplify-overlay-session-commands`
- `refactor: introduce editor command table`
- `refactor: useEditorCommands wires keyboard + menu from one table`
- `refactor: move pickAndInsertImage into command table`

## Context

`Editor.tsx` previously had **six near-identical `useEffect`s** wiring
editor commands:

- Five global `keydown` handlers — Cmd+K (open link dialog), Cmd+E
  (toggle inline code), Cmd+Shift+V (paste plain), Cmd+Shift+I (insert
  image), Cmd+H (toggle find/replace bar). Each had the same shape:
  `window.addEventListener`, modifier-key check, `editor.isFocused`
  guard, `e.preventDefault()`, action, teardown.
- One menu-action `useEffect` (lines 658-738) with a 17-case switch
  statement covering every editor menu item the native menu bar could
  fire — `format-bold`, `format-italic`, headings 1-6, `insert-link`,
  `insert-image`, `insert-table`, etc.

Most commands had **both** a keyboard shortcut *and* a menu entry — but
the two surfaces were wired completely separately. Adding a new
shortcut-with-menu command required edits in two unrelated places, and
nothing caught drift (e.g., shortcut works, menu item silently no-ops
because someone forgot the case arm).

The 5 keyboard `useEffect`s also gave Editor.tsx five places to grow
when adding a new shortcut, and five teardowns to keep correct.

## Decision

Replace the six `useEffect`s with **one declarative command table**
plus **one `useEditorCommands` hook** that dispatches from it.

### The table — `src/lib/editor/commands.ts`

```ts
export interface EditorCommand {
  id: string;                                          // menu-action payload
  keys?: { mod: true; shift?: boolean; key: string };  // optional shortcut
  when?: (ctx: EditorCommandCtx) => boolean;           // defaults to editor.isFocused
  run: (ctx: EditorCommandCtx) => void | Promise<void>;
}

export const editorCommands: EditorCommand[] = [
  { id: "insert-link", keys: { mod: true, key: "k" },
    run: ({ editor, setLinkDialog }) =>
      setLinkDialog({ href: editor.getAttributes("link").href ?? "" }) },
  { id: "format-code", keys: { mod: true, key: "e" },
    run: ({ editor }) => editor.chain().focus().toggleCode().run() },
  // … 23 more rows
];
```

Three small pure helpers are exported alongside (`getEditorCommandById`,
`shortcutMatches`, `commandCanRun`) so the hook stays tiny and the
table behavior is unit-testable without React.

### The hook — `src/lib/editor/useEditorCommands.ts`

Two `useEffect`s, one for each event source. Both iterate the same
table:

- **Keyboard** — single `keydown` listener on `window`. Iterates the
  table; first command whose shortcut matches and whose `when` guard
  allows wins. Captures `preventDefault` before delegating to `run`.
- **Menu** — `listenEvent<string>("menu-action", …)` from
  `src/lib/commands/internal`, replacing the manual `listen` +
  `mounted`/`unlisten` dance. Looks the payload up by id and runs the
  command, suppressed globally when `linkDialogOpen` is true (matches
  the pre-existing global guard at Editor.tsx:662).

### Edge cases preserved

- **Cmd+E intercept** before WKWebView's "Use Selection for Find" —
  listener stays on `window` (not on the editor DOM).
- **Cmd+H "open even when editor unfocused but bar is visible"** —
  encoded as `when: (ctx) => ctx.editor.isFocused || ctx.showFindReplace`.
- **Global linkDialog suppress** — handled in the menu-dispatch `useEffect`
  before lookup, not in `when` (it only applies to menu, not keyboard).

### Helper migration

`pickAndInsertImage` — the small Tauri-backed helper that opens a file
picker, copies the image into the workspace, and inserts a markdown
image — moved from `Editor.tsx:48-66` into `commands.ts` as a private
function used by `insert-image`. Drag-drop and clipboard-paste image
flows still use `commands.assets.saveFromBytes` directly in
`editorProps`.

## Consequences

**Positive:**
- Adding a new editor command is one row in `editorCommands`, plus
  (optionally) one entry in `src-tauri/src/menu.rs`. Drift between
  keyboard and menu surfaces is impossible — they read the same table.
- `Editor.tsx` shrinks by ~150 lines (six `useEffect`s + helper).
- The completeness test in `commands.test.ts` asserts every
  menu-routed id from the pre-refactor listener still exists in the
  table — a regression net for "menu items silently became no-ops."
- The pure helpers (`shortcutMatches`, `commandCanRun`,
  `getEditorCommandById`) are unit-testable without rendering React or
  mounting Tiptap.
- The menu listener uses `listenEvent` (the project's typed Tauri
  wrapper), collapsing the awkward `mounted`/`unlisten` race-handler
  dance.

**Negative / accepted:**
- The context object (`EditorCommandCtx`) is reconstructed every
  render. React's dependency arrays catch drift. Memoizing the
  context in Editor.tsx (via `useMemo`) keeps the keydown effect from
  re-binding on every keystroke.
- Commands that need closure-captured Editor.tsx state
  (`formatMarkdownSpacing`, `setShowFindReplace`, etc.) flow through
  the ctx interface. This is the price of separating data (the table)
  from state (the React component) — accepted because the table is
  the more reusable and testable artifact.

## Cross-references

- `src/lib/editor/commands.ts` — the table + pure helpers + the
  private `pickAndInsertImage`.
- `src/lib/editor/useEditorCommands.ts` — the two-`useEffect` hook
  consumed by `Editor.tsx`.
- `src/lib/editor/commands.test.ts` — uniqueness, shortcut-collision,
  menu-payload-completeness, and helper tests.
- `src-tauri/src/menu.rs` — emits `menu-action` events with the
  payload strings the table reads.
- `src/lib/menuLabels.ts` `MENU_KEYS` — the localized labels that go
  with the menu payloads. A future test could cross-reference these
  with the command table for end-to-end menu coverage.

## Amendment (2026-06)

[ADR 0018](0018-global-action-dispatch-table.md) extends this pattern to
the *global* (non-editor) actions: `src/lib/appActions.ts` is the table,
`useKeyboardShortcuts` / `useMenuActions` are the adapters, and the
menu-payload cross-check suggested above now exists in
`appActions.test.ts` for the global vocabulary.
