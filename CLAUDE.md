# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Ovid** is a minimalist, elegant desktop GUI application for managing [Amytis](https://github.com/hutusi/amytis) content workspaces — a native desktop alternative to Obsidian, purpose-built for the Amytis workspace format.

Built with **Tauri 2 + React + TypeScript + Vite + Tailwind CSS v4**, using **Bun** as the package manager and **Biome** as the linter/formatter.

## Commands

```bash
bun install              # Install dependencies
bun run tauri dev        # Run with hot reload (requires Rust)
bun run build            # Build frontend only
bun run tauri build      # Build distributable app
bun run validate         # Type-check + lint + tests + build + cargo test (run before committing)
bun run lint             # Biome check
bun run lint:fix         # Biome auto-fix
bun run test             # Bun unit tests
bun tsc --noEmit         # Type-check without emitting
```

Single test runs:

```bash
bun test src/lib/frontmatter.test.ts                # Run a single test file
bun test --test-name-pattern "parses frontmatter"   # Filter by test name
cargo test --manifest-path src-tauri/Cargo.toml     # Rust tests only
```

Tests are colocated as `*.test.ts` next to the implementation (e.g. `src/lib/frontmatter.test.ts`, `src/lib/tiptap/FindReplace.test.ts`).

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

**`src/App.tsx`** — Root component; composes top-level state from custom hooks (`useWorkspace`, `useFileEditor`, `useGit`, `useGitUiController`, `useTheme`, `useToast`, `useEditorPreferences`, `useWordCountGoal`, `useRecentFiles`, `useRecentWorkspaces`, `useOpenTabs`, `useContentTypes`) and owns local UI flags (sidebar/properties visibility, zen/typewriter mode, dialog open states). Also manages `sidebarMode` (`"content" | "files"` persisted per workspace in `localStorage`), `filesTree` (separate `FileNode[]` for Files mode loaded via `loadFilesTree`), and `fileViewerNode` (non-markdown file selected for `FileViewer` preview). `handleSidebarSelect` routes non-markdown selections to `FileViewer`; `closeActiveTabOrFile` closes the FileViewer first when it is active. `openFileByPath` is the canonical single entry point for opening a file by path from any surface (switcher, search, recents, auto-reopen, tab bar); it clears `fileViewerNode`, looks up the node in `flatFiles` (with a synthetic-node fallback), then calls `handleSelectFile` + `pushRecent` + `openTab` in one step.

**`src/components/`** — UI components (list is representative, not exhaustive)
- `Editor.tsx` — Tiptap WYSIWYG editor; StarterKit + Markdown + Typography + Link + Table (+ TableCell/Header/Row) + Mathematics + Placeholder + CodeBlockLowlight + TaskList/TaskItem (from `@tiptap/extension-list`) + custom extensions in `src/lib/tiptap/`
- `BubbleMenu.tsx` — Floating formatting toolbar (Bold, Italic, Strike, Code, Link) shown on text selection
- `FindReplaceBar.tsx` — Find & replace bar (`Cmd+H`); live match highlighting, navigate, replace one/all
- `TableControls.tsx` — Floating table toolbar (add/delete rows and columns) shown when cursor is in a table
- `Sidebar.tsx` — Dual-mode file tree with a segmented Content / Files toggle. Content mode shows only `.md` / `.mdx` files (with `collapseIndexNodes` and `sortTree`). Files mode shows the full project tree (via `filterNoiseDirs` + `sortTreeAlpha`); non-markdown files show a generic icon and reduced context menu. Mode is persisted per workspace in `localStorage`.
- `TabBar.tsx` — Open-file tab strip above the editor; drag-to-reorder, middle-click or close button to close, hidden in zen mode and only rendered with 2+ tabs
- `StatusBar.tsx` — Filename, word count, dark mode toggle, zen/typewriter toggles
- `PropertiesPanel.tsx` — Collapsible bar above editor for frontmatter metadata; always shown for any open markdown file; displays an empty state with add-field prompts when the file has no frontmatter
- `SearchPanel.tsx` — Full-text search panel (replaces sidebar); queries run in Rust; draft files are displayed with reduced opacity to match sidebar and switcher styling
- `FileSwitcher.tsx` — `Cmd+P` command palette; receives `files: FlatFile[]` (the independent flat index from `useWorkspace`) rather than the hierarchical tree, so lazy sidebar loads never make discovery incomplete
- Git UI: `GitSyncPopover.tsx`, `BranchSwitcher.tsx`, `NewBranchDialog.tsx`, `RenameBranchDialog.tsx`, `DeleteBranchDialog.tsx`, `CommitDialog.tsx` — surface the Tauri git commands; coordinated by `useGitUiController`
- File lifecycle: `NewFileDialog.tsx`, `RenamePathDialog.tsx` — create/rename via Tauri commands
- `UpdateDialog.tsx` — surfaces Tauri updater state
- `WechatPublishDialog.tsx` — multi-phase dialog for publishing to WeChat Official Account: credential entry (persisted to app config dir via Rust), publish, and success/error states. Lazily imported in `App.tsx`. Calls `get_wechat_credentials_status`, `set_wechat_credentials`, `clear_wechat_credentials`, and `wechat_publish_draft` Tauri commands. The "ready" phase has editable title, author (pre-filled from frontmatter `author` or workspace `defaultAuthor` from `site.config.ts`), digest with a 54-char counter and warning color at 50+ chars (pre-filled from frontmatter `excerpt`/`description` or auto-generated via `extractExcerpt`), optional content_source_url text input, and toggles for allow-comments (`need_open_comment`) and appreciation (`can_reward`; hint shown that it requires Original/原创 on the account), local image count (via `countLocalImages`), math block warning (via `hasMathBlocks`), and a cover image warning when none is set. When the file has `wechatMediaId` in frontmatter the dialog enters update mode: the button label changes to "Update Draft" and `wechat_publish_draft` is called with `existing_media_id`; on success `onSuccess(mediaId, updated)` writes the media_id back to frontmatter via `handleFieldChange`. The "publishing" phase listens for `wechat-upload-progress` Tauri events and shows "Uploading image N of M…" as each body image is uploaded. Cover image is optional — its absence shows a warning but does not block publishing.
- `LinkDialog.tsx`, `WorkspaceSwitcher.tsx` — plain-CSS modal dialogs
- `FontSettings.tsx`, `CodeBlockView.tsx` — Custom CSS-positioned panels (no Portal); code blocks support copy and custom language labels
- `FileViewer.tsx` — Read-only preview for non-markdown files selected in Files mode. `getFileViewKind(node)` maps file extension to `"image" | "text" | null`; images use `convertFileSrc`, text is loaded via `read_file` with a stale-async guard. Shown in place of the editor when `fileViewerNode` is set.
- `ContentTypeIcon.tsx`, `EmptyState.tsx`, `PerfPanel.tsx` — icons, no-workspace state, perf overlay (gated by `isPerfLoggingEnabled`)
- `ErrorBoundary.tsx` — React error boundary wrapping the editor; surfaces render errors instead of blank screen
- `Modal.css` — Shared plain-CSS primitives for all modal dialogs (overlay, panel, buttons, inputs, badge, checkbox label)
- `ui/command.tsx` — Thin wrapper around `cmdk` for the file switcher; styled with design tokens
- `ui/input.tsx` — Plain input wrapper used by Sidebar filter and SearchPanel

Sidebar/session behavior:
- **Dual mode** — Content mode shows only markdown files; Files mode shows the full project tree rooted at `workspace_root` (not `tree_root`). Mode is toggled via a segmented two-button control and persisted per workspace.
- Folders containing only `index.md` or `index.mdx` are presented as a single content item in the sidebar and file switcher (via `collapseIndexNodes`); the node carries `containerDirPath` and a small badge indicator. Status bar path and rename dialog use the actual file path, not the folder name.
- Sidebar expansion is selective: shallow folders open by default, deeper branches fold by default, and manual collapse overrides auto-expansion
- On launch, the app auto-reopens the last workspace and attempts to restore the most recently opened file in that workspace

**`src/lib/`** — hooks and helpers (representative, not exhaustive)

State hooks (composed in `App.tsx`):
- `useWorkspace.ts` — workspace open/close, file tree, current path; also maintains `flatFiles: FlatFile[]` — an independent flat index updated only from full `list_workspace` walks (never from lazy `loadDirectoryChildren` calls) so `Cmd+P` and `openFileByPath` always have the complete file list
- `useFileEditor.ts` — current file content, dirty tracking, save coordination
- `useGit.ts` — git state (branch, status, remotes); polls via Tauri commands
- `useGitUiController.ts` — coordinates git dialogs (commit, branch CRUD, sync popover)
- `useContentTypes.ts` — Amytis content type discovery (only when workspace is Amytis)
- `useRecentFiles.ts` / `useRecentWorkspaces.ts` — per-workspace and global MRU lists
- `useOpenTabs.ts` — per-workspace open-file tab list (cap 8) with localStorage persistence; `useWorkspace` keeps it in sync via `onPathRenamed`/`onPathRemoved` callbacks
- `useEditorPreferences.ts`, `useWordCountGoal.ts` — user preferences in `localStorage`
- `useToast.ts` — toast queue surfaced by `App.tsx`
- `useTheme.ts` — system/manual dark mode; syncs to `localStorage`; applies `data-theme` on `<html>`
- `useFocusTrap.ts` — modal dialogs: auto-focus first element, trap Tab/Shift+Tab, restore focus on close

Pure helpers:
- `types.ts` — Shared interfaces (`FileNode`, `WorkspaceState`)
- `frontmatter.ts` / `frontmatterSchema.ts` — `parseFrontmatter` / `joinFrontmatter` (raw round-trip), `parseYamlFrontmatter` (js-yaml), and Amytis-aware schema lookups
- `appRestore.ts` — last-workspace and last-file restoration on launch
- `sidebarUtils.ts` — `collapseIndexNodes` (fold index-only dirs into a single node), `filterNoiseDirs` (strip `node_modules`, `dist`, `.git`, etc. for Files mode), `sortTreeAlpha` (dirs-first alpha sort for Files mode), `sortTree` / `sortNodes` (content-type priority sort for Content mode), `rollupGitStatus`, `filterTree`, `getSidebarDisplayName`, `needsPageDivider`
- `fileSearch.ts` — `FlatFile` type, `flattenTree` (flattens a `FileNode[]` into `FlatFile[]`, applying `collapseIndexNodes` and skipping unloaded branches), `score` / `compareFiles` (fuzzy ranking with recency tie-breaking) used by `FileSwitcher`; `sidebarExpansion.ts` — `findAncestorPaths` derives ancestor directory paths from path segments (not tree traversal) so sidebar reveal works even when branches have `children: null` from lazy loading; `markdown.ts`, `codeBlockLanguages.ts`, `imageUtils.ts`, `postPath.ts`, `gitAutoFetch.ts`, `gitUi.ts`, `utils.ts`, `perf.ts`
- `wechatHtml.ts` — Five exported functions: `markdownToWechatHtml(markdown)` converts Markdown to inline-styled HTML (headless Tiptap → `applyWechatStyles` → `sanitizeForWechat`; strips math with a `hasMath` flag; requires browser DOM); `sanitizeForWechat(html)` strips `data-*`/`aria-*`/`id` attributes, removes non-absolute `href` values, replaces `<input type="checkbox">` with ☑/☐, and unwraps `<label>` elements (WeChat rejects all of these); `extractExcerpt(markdown, maxLen?)` strips markdown syntax and returns the first non-empty line truncated to `maxLen` (default 54); `hasMathBlocks(markdown)` returns true if the markdown contains any `$$...$$` or `$...$` LaTeX expressions; `countLocalImages(markdown)` counts markdown images whose `src` is a local path (not `http/https/data:`). The last four are DOM-free and covered by `wechatHtml.test.ts`. Internal helper `replaceNewlinesWithBr` walks text nodes inside `<pre><code>` and replaces `\n` with `<br>` elements — WeChat strips `white-space` from inline styles so literal newlines would otherwise collapse to spaces.

**`src/theme.ts`** — Static theme constants consumed by components alongside the `useTheme` hook.

**`src/lib/tiptap/`**
- `FindReplace.ts` — ProseMirror plugin + Tiptap extension for find & replace; `collectMatches` exported for testing
- `TextFolding.ts` — Heading-level fold/unfold via chevron widgets; `getHeadingRanges` exported for testing
- `InlineEditMode.ts` — Shows `[` and `](url)` decorations around links when cursor is inside one; URL hint is clickable
- `LinkPreview.ts` — Hover tooltip showing link URL
- `ActiveHeadingIndicator.ts` — Decorates the active heading with its current `H1`-`H6` level while editing
- `Footnotes.ts` — Decorates raw Markdown footnote references and definition paragraphs so footnotes remain readable without adding custom document nodes
- `ListBackspace.ts` — Intercepts start-of-text `Backspace` for structural blocks so lists, task lists, blockquotes, headings, and code blocks unwrap predictably instead of merging backward
- `ImageRenderer.tsx` — React node view for images; resolves workspace-relative paths via Tauri (replaces the stock `@tiptap/extension-image`)
- `taskLists.ts` — Markdown-aware task list normalization (typing rules + paste/load fixups) layered on top of `@tiptap/extension-list`

**`src/styles/`**
- `global.css` — Tailwind `@theme` block (single source of truth for design tokens + utility classes); `[data-theme="dark"]` overrides; `:root` for non-theme constants (font sizes, layout, shadows)
- `editor.css` — ProseMirror / Tiptap prose typography

**`src-tauri/`** — Rust backend (Tauri 2). Code is split by domain: `state.rs` (shared `WorkspaceState` / `WechatState` / cache types), `paths.rs` (path validation + atomic write helpers), `perf.rs`, `workspace/` (`FileNode`, tree walking, frontmatter cache, workspace commands), `files.rs` (read/write/create/rename/trash), `search.rs`, `content_types.rs`, `git/` (commands, parsers, error classifiers, push/branch arg builders), `assets.rs`, `wechat/` (creds, token, upload, publish), `menu.rs` (`AboutState` + menu building), `app.rs`. `lib.rs` is a thin coordinator: it declares modules, owns `run()`, and registers every Tauri command via `tauri::generate_handler!`. For workspace-scoped file operations, path arguments are validated against the open workspace root before filesystem reads/writes.

Workspace and file lifecycle:
- `open_workspace` (folder picker) / `open_workspace_at_path` — async, tokio oneshot; uses `list_dir_shallow` for a fast initial render, then the frontend fires a background `list_workspace` call to complete the flat index
- `list_workspace`, `list_workspace_children` — initial tree and lazy directory expansion; `list_workspace_children` accepts `allFiles: Option<bool>`: when `false` (Content mode) it validates against `tree_root` and filters non-markdown/dotfiles; when `true` (Files mode) it validates against `workspace_root` and includes all files including dotfiles
- `read_file`, `write_file` — `read_file` validates against `workspace_root` (not `tree_root`) so files outside the Amytis `content/` subtree can be previewed; `write_file` uses atomic temp-file + rename
- `create_file`, `create_dir`, `ensure_dir` — new files/folders inside the workspace
- `rename_file`, `duplicate_entry`, `trash_file` — rename, copy, and OS-trash operations
- `save_asset`, `save_asset_from_bytes`, `pick_image_file` — image asset import: `save_asset` copies a file-path source (drag-and-drop), `save_asset_from_bytes` writes raw bytes (clipboard paste); both save to the active file's sibling `images/` directory, falling back to `<workspace_root>/images/`

Private helpers (not Tauri commands):
- `list_dir_shallow(path, all_files, cache)` — shallow directory listing; when `all_files=false` skips dotfiles and directories with no markdown descendants; when `all_files=true` includes all files and dotfiles
- `has_markdown_descendant(path)` — recursively checks if a directory contains any `.md`/`.mdx` file; skips dotfiles and symlinks to avoid infinite loops

Search and content metadata:
- `search_workspace` — full-text search; ranked results
- `get_content_types` — Amytis content type discovery from `site.config.ts`

Git (graceful no-op when no `.git` is found):
- Read: `get_git_status`, `get_git_commit_changes`, `get_git_branch`, `get_git_branches`, `get_git_remote_branches`, `get_git_remote_info`
- Write: `git_commit`, `git_push`, `git_pull`, `git_fetch`, `git_switch_branch`, `git_create_branch`, `git_rename_branch`, `git_delete_branch`, `git_checkout_remote_branch`
- `open_git_remote` — open the remote URL for the current repo in the system browser

WeChat integration:
- `get_wechat_credentials_status` — returns `{ app_id: Option<String>, has_secret: bool }` without exposing the secret
- `set_wechat_credentials` — saves AppID and AppSecret to `<app_config_dir>/wechat_credentials.json` (chmod 600)
- `clear_wechat_credentials` — removes stored credentials file
- `wechat_publish_draft` — full publish pipeline: fetch/cache access token, upload body images to WeChat CDN, upload cover image as permanent material, create or update draft via WeChat MP API; returns `{ media_id: String, updated: bool }`. When `existing_media_id` is supplied, attempts `draft/update` first; falls back to `draft/add` only on errcode 40007 (invalid/expired media_id); all other error codes surface as failures. Accepts `asset_root: Option<String>` to resolve root-relative image paths (e.g. `/images/cover.jpg`) against the workspace's `public/` dir; `digest: Option<String>` is passed through as-is; `content_source_url: Option<String>`, `need_open_comment: bool`, and `can_reward: bool` are forwarded to the article object. Body image URLs with `asset://`, `data:`, or `blob:` schemes are skipped (non-fatal). Emits a `wechat-upload-progress` event (`{ current: usize, total: usize }`) before each local body image upload so the frontend can show incremental progress. `resolve_wechat_asset_path` handles all three path forms: root-relative (against `asset_root` or workspace root), relative (against `base_dir`), and absolute filesystem paths.

App lifecycle:
- `restart_app` — used by the updater after install

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
- **No persistent toolbar** — no fixed toolbar above the editor; the bubble menu appears transiently on text selection and disappears after use; keyboard-first design remains the primary affordance
- **Tailwind-first design tokens** — all color and font tokens live in `@theme` in `global.css`; generates both CSS variables (`var(--color-surface)`) and utility classes (`bg-surface`) simultaneously; dark mode overrides in `[data-theme="dark"]`; never add a `@theme inline` bridge layer
- **`cmdk`** for the file switcher — keyboard-navigable fuzzy search; does not use Portal so it works correctly in Tauri's WebView; wrapped in `ui/command.tsx`
- **`useFocusTrap`** for all modal dialogs — every `role="dialog"` element must attach the `useFocusTrap` ref; handles initial focus, Tab cycling, and focus restoration on close

## Amytis Workspace

An Amytis workspace is identified by the presence of `site.config.ts` + `content/` directory. Content files are `.md` with YAML frontmatter. Frontmatter is parsed with `js-yaml`, stripped from the editor view, and displayed in the properties panel. The raw frontmatter block is always written back verbatim to preserve formatting.

When persisting per-workspace UI state that depends on the file tree, note that Amytis workspaces may use `content/` as the tree root even when the workspace root is the project root; recent-file restore logic must account for both paths.

## Internationalization

Supported languages: **English** (`en`) and **Simplified Chinese** (`zh-CN`). Language preference is stored in `localStorage` under `ovid:language` and detected on startup by `i18next-browser-languagedetector` (localStorage → navigator).

**Locale files**: `src/locales/en.json` and `src/locales/zh-CN.json` — nested JSON, dot-notation keys. Both files must have identical key structure; `src/lib/i18n.test.ts` enforces parity.

**React components**: use `useTranslation()` from `react-i18next`. Call `t("section.key")` for static strings and `t("key", { count })` for plurals (i18next resolves `_one`/`_other` suffixes automatically).

**Pure helpers** (non-React modules like `src/lib/gitUi.ts`): accept a `Translate` type parameter — `type Translate = (key: string, vars?: Record<string, unknown>) => string` — instead of importing `TFunction`. This keeps the module framework-free and trivially testable with a plain `mockT` function. Thread `t` from the nearest hook (`useTranslation` in `useGitUiController.ts`).

**CSS-only text** (the H1-duplicate warning in `editor.css`): `content: var(--h1-warning-text, "…fallback…")`. `src/lib/i18n.ts` sets `--h1-warning-text` on `<html>` via `JSON.stringify(i18n.t("editor.h1_warning"))` after init and on every `languageChanged` event.

**Rust native menus**: the frontend calls `invoke("set_menu_language", { labels })` after i18n initialises and again on language toggle. `labels` is a `Record<string, string>` built by `buildMenuLabels(t)` in `src/lib/menuLabels.ts`. On startup (before the WebView loads), `initial_menu_labels()` in `src-tauri/src/menu.rs` uses `sys-locale` to read the OS locale and parses `src/locales/*.json` (embedded via `include_str!`) to seed the menu in the right language from frame one.

**Adding a translation key**:
1. Add the key to **both** `en.json` and `zh-CN.json` under the appropriate section.
2. Use `t("section.key")` in the component or pass `Translate` to the helper.
3. For Rust menu items, also add the key to `MENU_KEYS` in `src/lib/menuLabels.ts`.
4. Run `bun run validate` — the parity test in `i18n.test.ts` will fail if either locale file is missing the key.

## Error Handling

- Tauri Rust commands return `Result<T, String>` — errors surface as rejected promises in the frontend
- Display errors via the toast system (`showToast` in `App.tsx`) — never `console.error` for user-visible failures; `ErrorBoundary` wraps the editor and surfaces render errors instead of blank screen
- Path validation happens in Rust (`read_file` / `write_file` reject paths outside workspace root)

## Context Compression Hints

When compressing conversation history, preserve in priority order:

1. **Architecture decisions** — especially any deviations from constraints in this file
2. **Modified files and key changes** — which files changed and why
3. **Tauri command changes** — Rust-side commands being added/modified (separate from frontend)
4. **Verification status** — current `bun run validate` pass/fail state
5. **Open TODOs and rollback notes**
6. **Tool output** — can be dropped; keep pass/fail summary only

## Reference Docs

- [ROADMAP.md](./ROADMAP.md) — phased plan; complete the current phase before starting the next
- [AGENTS.md](./AGENTS.md) — sibling guidance file with overlapping conventions; keep the two in sync if either changes
- `docs/git-workflow.md` — branch and merge conventions
- `docs/release-checklist.md`, `docs/updater-plan.md`, `docs/updater-release-runbook.md` — release and updater procedures
