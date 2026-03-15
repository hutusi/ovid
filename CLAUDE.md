# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Ovid App** is a minimalist, elegant desktop GUI application for managing [Amytis](https://github.com/hutusi/amytis) content workspaces — a native desktop alternative to Obsidian, purpose-built for the Amytis workspace format.

Built with **Tauri 2 + React + TypeScript + Vite + Tailwind CSS v4**, using **Bun** as the package manager and **Biome** as the linter/formatter.

## Commands

```bash
bun install              # Install dependencies
bun run tauri dev        # Run with hot reload (requires Rust)
bun run build            # Build frontend only
bun run tauri build      # Build distributable app
bun run validate         # Type-check + lint + test (run before committing)
bun run lint             # Biome check
bun run lint:fix         # Biome auto-fix
bun run test             # Vitest unit tests
bun tsc --noEmit         # Type-check without emitting
```

## Architecture

Three-zone layout managed by `src/App.tsx`:

```
┌──────────────┬──────────────────────────────────┐
│  Sidebar     │  Editor                          │
│  (file tree) │  (Tiptap WYSIWYG)                │
│  240px       │  flex: 1                         │
└──────────────┴──────────────────────────────────┘
│  StatusBar (28px, dark)                         │
└─────────────────────────────────────────────────┘
```

**`src/App.tsx`** — Root component; owns all global state (workspace, selected file, word count).

**`src/components/`**
- `Editor.tsx` — Tiptap WYSIWYG editor (StarterKit + Markdown + Typography + Link + Image + Table + Mathematics + custom extensions)
- `BubbleMenu.tsx` — Floating formatting toolbar (Bold, Italic, Strike, Code, Link) shown on text selection
- `FindReplaceBar.tsx` — Find & replace bar (`Cmd+H`); live match highlighting, navigate, replace one/all
- `TableControls.tsx` — Floating table toolbar (add/delete rows and columns) shown when cursor is in a table
- `LinkDialog.tsx` — Modal for inserting/editing link URLs (`Cmd+K`)
- `CodeBlockView.tsx` — Custom node view for code blocks with language picker

**`src/components/`** — UI components (list is representative, not exhaustive)
- `Editor.tsx` — Tiptap WYSIWYG editor (StarterKit + Placeholder + Typography + Link + Image + tiptap-markdown)
- `Sidebar.tsx` — File tree; shows only `.md` / `.mdx` files
- `StatusBar.tsx` — Filename, word count, dark mode toggle, zen/typewriter toggles
- `PropertiesPanel.tsx` — Collapsible bar above editor showing parsed frontmatter fields
- `ErrorBoundary.tsx` — React error boundary wrapping the editor; surfaces render errors instead of blank screen

**`src/lib/tiptap/`**
- `FindReplace.ts` — ProseMirror plugin + Tiptap extension for find & replace; `collectMatches` exported for testing
- `TextFolding.ts` — Heading-level fold/unfold via chevron widgets; `getHeadingRanges` exported for testing
- `InlineEditMode.ts` — Shows `[` and `](url)` decorations around links when cursor is inside one; URL hint is clickable
- `LinkPreview.ts` — Hover tooltip showing link URL
- `SearchPanel.tsx` — Full-text search panel (replaces sidebar); queries run in Rust
- `FileSwitcher.tsx` — `Cmd+P` command palette; wraps `cmdk`
- `CommitDialog.tsx`, `LinkDialog.tsx`, `WorkspaceSwitcher.tsx` — Plain-CSS modal dialogs
- `FontSettings.tsx`, `CodeBlockView.tsx` — Custom CSS-positioned panels (no Portal)
- `Modal.css` — Shared plain-CSS primitives for all modal dialogs (overlay, panel, buttons, inputs, badge, checkbox label)
- `ui/command.tsx` — Thin wrapper around `cmdk` for the file switcher; styled with design tokens
- `ui/input.tsx` — Plain input wrapper used by Sidebar filter and SearchPanel

**`src/lib/`**
- `types.ts` — Shared interfaces (`FileNode`, `WorkspaceState`)
- `frontmatter.ts` — `parseFrontmatter` / `joinFrontmatter` (raw round-trip) + `parseYamlFrontmatter` (js-yaml)
- `useTheme.ts` — Hook for system/manual dark mode; syncs to `localStorage`; applies `data-theme` on `<html>`
- `useFocusTrap.ts` — Hook for modal dialogs: auto-focuses first element on open, traps Tab/Shift+Tab within bounds, restores focus on close

**`src/styles/`**
- `global.css` — Tailwind `@theme` block (single source of truth for design tokens + utility classes); `[data-theme="dark"]` overrides; `:root` for non-theme constants (font sizes, layout, shadows)
- `editor.css` — ProseMirror / Tiptap prose typography

**`src-tauri/`** — Rust backend (Tauri 2).
- `open_workspace` — folder picker dialog (async, tokio oneshot); walks file tree
- `read_file` / `write_file` — path-validated against workspace root; atomic saves via temp-file + rename

## Design Principles

Aesthetic:
- **Typora-style WYSIWYG** — markdown renders inline as you type; no split pane
- **Typography-first** — Georgia serif for prose, generous line height, 680px max-width
- **Minimal chrome** — sidebar collapses, no toolbar cluttering the editor
- **Keyboard-first** — primary actions are prioritized for keyboard use; every action must have a keyboard path, mouse is optional

Product (non-negotiable):
- **Writing first** — every feature must justify itself against the cost of distraction it adds
- **Files stay plain** — on-disk format is always valid `.md`; no app-specific syntax or metadata bleed
- **Amytis-native** — frontmatter, content types, and publish workflow are first-class, not afterthoughts
- **Graceful degradation** — features requiring git, Rust tools, or network access fail silently and informatively

Implementation:
- **Plain CSS over component libraries** — write `.css` files with `var(--color-*)` tokens; avoid third-party UI primitives that use Portal or complex abstraction layers
- **Accessible by default** — every interactive element must have an accessible name, correct role, and keyboard path; don't add UI without meeting these three requirements
- **Tokens in one place** — all design decisions (colors, fonts) live in `@theme` in `global.css`; components consume them, never redefine them

## UI Coding Rules

These rules encode hard-won lessons about what works in Tauri's WebView. Violations cause silent rendering failures or accessibility regressions.

### Styling

- **Use Tailwind utilities for layout and spacing** — `flex`, `gap-2`, `px-3`, `rounded`, etc. in TSX `className` strings
- **Use `var(--color-*)` in CSS files** — e.g. `color: var(--color-fg-muted)` in `.css` files; the equivalent Tailwind utility (e.g. `text-fg-muted`) in TSX `className` strings
- **Never use `style={{}}` for colors or typography** — extract to a CSS class; inline styles bypass the design token system and cannot be overridden by dark mode
- **All design tokens live in `@theme` in `global.css`** — never define color or font tokens in component CSS files or additional `:root` blocks
- **Dark mode via `[data-theme="dark"]`** — override token values in that selector block in `global.css`; use the `dark:` Tailwind variant (wired to `[data-theme="dark"]` via `@custom-variant`) for utility overrides in TSX

### Dialogs and Popovers

- **No portal-based components** — never use Radix UI Dialog, Popover, DropdownMenu, or any component that renders via `Portal` into `document.body`; CSS variable chains fail in Tauri's WebView outside the app's CSS tree
- **Plain CSS modals** — all dialogs use `Modal.css` primitives (`modal-overlay`, `modal-panel`, `modal-backdrop`, `modal-btn`, etc.); see existing dialogs for the pattern
- **Custom popovers** — use a conditionally rendered positioned `<div>` with `useEffect` for click-outside and Escape key handling; see `FontSettings.tsx` or `CodeBlockView.tsx` for the pattern
- **Always attach `useFocusTrap`** — every `role="dialog"` element must use the `useFocusTrap` hook; it handles initial focus, Tab/Shift+Tab containment, and focus restoration on close
- **Escape at the dialog level** — handle `onKeyDown` on the dialog `div`, not only on inputs; when Enter also submits, check `e.target === inputRef.current` to avoid double-firing when focus is on a button

### Accessibility

- **All inputs must have an accessible name** — use `aria-label` when there is no visible `<label htmlFor>`; applies inside composite components (TagInput, EditableValue, AddFieldRow, DateField)
- **All display-state buttons need `aria-label`** — when a button's text content may be empty (e.g. `EditableValue` with no value), set `aria-label` to a descriptive string
- **Toggle buttons need `aria-pressed`** — any button representing on/off state must include `aria-pressed={boolean}`; see StatusBar for examples
- **Use `<button type="button">`** — never put `onClick` on a `div` or `span`; the only exception is `role="presentation"` wrapper divs
- **Dialog ARIA** — every modal must have `role="dialog"`, `aria-modal="true"`, and `aria-label` describing its purpose

### Dependencies

- **No new `@radix-ui/*` packages** — the entire Radix UI family is removed; do not reintroduce any part of it
- **No shadcn/ui components** — `class-variance-authority` and the shadcn component pattern are removed; write plain TSX with CSS classes
- **No new portal-rendering libraries** — any UI library that renders to `document.body` outside the React tree will break in Tauri's WebView
- **Prefer native HTML elements** — `<select>`, `<input>`, `<button>`, `<details>` over third-party wrappers; only reach for a library when the native element genuinely cannot do the job (e.g. `cmdk` for keyboard-navigable fuzzy search)

## Key Design Decisions

- **Tauri 2** over Electron — smaller binary, faster, no Chromium overhead
- **Tiptap v3** (ProseMirror-based) for WYSIWYG — most mature ecosystem for this use case
- **`tiptap-markdown`** for markdown serialization/deserialization
- **Bun** as runtime and package manager — consistent with the TUI sibling project
- **No shared code** with the TUI (`ovid`) — different runtime APIs; reference TUI for domain logic only
- File I/O goes through **Tauri FS plugin** (`@tauri-apps/plugin-fs`) or Rust commands — never direct Node/Bun APIs
- **Global UI state in `App.tsx`** — workspace and editor state live in `App.tsx`; theme state is managed by the `useTheme` hook; no external state library (no Zustand, Redux, etc.)
- **No persistent toolbar** — keyboard-first design; no fixed toolbar above the editor; the bubble menu appears transiently on selection and disappears after use
- **No editor toolbar** — keyboard-first design; don't add toolbars or button bars to the editor
- **Tailwind-first design tokens** — all color and font tokens live in `@theme` in `global.css`; generates both CSS variables (`var(--color-surface)`) and utility classes (`bg-surface`) simultaneously; dark mode overrides in `[data-theme="dark"]`; never add a `@theme inline` bridge layer
- **`cmdk`** for the file switcher — keyboard-navigable fuzzy search; does not use Portal so it works correctly in Tauri's WebView; wrapped in `ui/command.tsx`
- **`useFocusTrap`** for all modal dialogs — every `role="dialog"` element must attach the `useFocusTrap` ref; handles initial focus, Tab cycling, and focus restoration on close

## Amytis Workspace

An Amytis workspace is identified by the presence of `site.config.ts` + `content/` directory. Content files are `.md` with YAML frontmatter. Frontmatter is parsed with `js-yaml`, stripped from the editor view, and displayed in the properties panel. The raw frontmatter block is always written back verbatim to preserve formatting.

## Error Handling

- Tauri Rust commands return `Result<T, String>` — errors surface as rejected promises in the frontend
- Display errors via `console.error` or in-UI feedback; `ErrorBoundary` wraps the editor and surfaces render errors
- Display errors via the toast system (`showToast` in `App.tsx`) — never `console.error` for user-visible failures; no global error boundary currently exists
- Path validation happens in Rust (`read_file` / `write_file` reject paths outside workspace root)

## Context Compression Hints

When compressing conversation history, preserve in priority order:

1. **Architecture decisions** — especially any deviations from constraints in this file
2. **Modified files and key changes** — which files changed and why
3. **Tauri command changes** — Rust-side commands being added/modified (separate from frontend)
4. **Verification status** — current `bun run validate` pass/fail state
5. **Open TODOs and rollback notes**
6. **Tool output** — can be dropped; keep pass/fail summary only

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phased plan. Features are organized into 8 phases; complete each phase before starting the next. Phases 1–8 are complete.
