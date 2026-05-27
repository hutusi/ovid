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

**`src/App.tsx`** — Root component; composes top-level state from custom hooks (`useOverlayStack`, `useFileEditor`, `useWorkspaceSession`, `useGit`, `useGitUiController`, `useFilesMode`, `useWorkspaceRevisionPoll`, `useGitFocusFetch`, `useMenuActions`, `useKeyboardShortcuts`, `useGitRefreshOnSave`, `useTheme`, `useToast`, `useEditorPreferences`, `useWordCountGoal`, `useRecentWorkspaces`, `useContentTypes`) and owns only the few UI flags that aren't overlays (sidebar visibility, zen/typewriter mode, cover image visibility). Every dialog/popover visibility lives in one tagged-union owned by `useOverlayStack`. Render output is composed from four top-level components: `Sidebar`/`SearchPanel` (left column), `EditorPane` (editor + properties), `StatusBar`, and `AppDialogs` (all overlays). `handleSidebarSelect` routes non-markdown selections to `FileViewer`; `closeActiveTabOrFile` closes the FileViewer first when it is active. `openFileByPath` is a thin wrapper that clears `fileViewerNode` and delegates to `useWorkspaceSession.openByPath` — the session enforces the "select + push recent + open tab" invariant so callers don't have to assemble it.

**`src/components/`** — UI components (list is representative, not exhaustive)
- `EditorPane.tsx` — Editor column + PropertiesPanel composite; owns the lazy `Editor` import and its preload effect; renders `TabBar`, cover-image banner, and the `FileViewer`/`Editor`/`EmptyState` trio. Exports `EditorViewState` type used by `App.tsx`.
- `AppDialogs.tsx` — All overlay/dialog rendering; 13 lazily-imported dialog components (`WorkspaceSwitcher`, `FileSwitcher`, `NewFileDialog`, `CommitDialog`, `BranchSwitcher`, `NewBranchDialog`, `RenameBranchDialog`, `DeleteBranchDialog`, `GitSyncPopover`, `PerfPanel`, `UpdateDialog`, `RenamePathDialog`, `WechatPublishDialog`) plus the toast container. Consumes the `OverlayStack` directly and renders by switching on `overlay.active?.kind` / `overlay.is(kind)`; visibility is never duplicated as a prop.
- `Editor.tsx` — Tiptap WYSIWYG editor; StarterKit + Markdown + Typography + Link + Table (+ TableCell/Header/Row) + Mathematics + Placeholder + CodeBlockLowlight + TaskList/TaskItem (from `@tiptap/extension-list`) + custom extensions in `src/lib/tiptap/`. Keyboard shortcuts and native menu actions are dispatched from a single declarative table — see `src/lib/editor/commands.ts` + `useEditorCommands` (ADR 0008).
- `BubbleMenu.tsx` — Floating formatting toolbar (Bold, Italic, Strike, Code, Link) shown on text selection
- `FindReplaceBar.tsx` — Find & replace bar (`Cmd+H`); live match highlighting, navigate, replace one/all
- `TableControls.tsx` — Floating table toolbar (add/delete rows and columns) shown when cursor is in a table
- `Sidebar.tsx` — Dual-mode file tree with a segmented Content / Files toggle. Content mode shows only `.md` / `.mdx` files (folder-backed posts collapsed via `collapseIndexNodes`, sorted by content-type priority). Files mode shows the full project tree (alpha-sorted, dirs first); non-markdown files show a generic icon and reduced context menu. The mode-specific projection is applied in `App.tsx` via `forContentMode` / `forFilesMode` selectors over the canonical workspace tree, so `Sidebar.tsx` is mode-unaware — it just renders whatever tree it's given. Mode is persisted per workspace in `localStorage`.
- `TabBar.tsx` — Open-file tab strip above the editor; drag-to-reorder, middle-click or close button to close, hidden in zen mode and only rendered with 2+ tabs
- `StatusBar.tsx` — Filename, word count, dark mode toggle, zen/typewriter toggles
- `PropertiesPanel.tsx` — Collapsible bar above editor for frontmatter metadata; always shown for any open markdown file; displays an empty state with add-field prompts when the file has no frontmatter
- `SearchPanel.tsx` — Full-text search panel (replaces sidebar); queries run in Rust; draft files are displayed with reduced opacity to match sidebar and switcher styling
- `FileSwitcher.tsx` — `Cmd+P` command palette; receives `files: FlatFile[]` (the markdown-only projection from `useWorkspace`'s `forContentMode` selector) rather than the hierarchical tree, so it always sees the full set of openable files regardless of sidebar mode
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
- **Single canonical tree, two views.** `useWorkspace` owns one recursively-walked tree from `workspace_root` (the Rust `walk_tree` filters noise dirs like `node_modules`/`.git`/build outputs at source). The sidebar projects it through `forContentMode` (scope into `content/`, drop dotfiles + non-markdown, prune empty dirs, collapse + sort) or `forFilesMode` (alpha-sort) at render time. Mutations refresh both views simultaneously — no more parallel `filesTree` going stale.
- Folders containing only `index.md` or `index.mdx` are presented as a single content item in the sidebar and file switcher (via `collapseIndexNodes`); the node carries `containerDirPath` and a small badge indicator. Status bar path and rename dialog use the actual file path, not the folder name.
- Sidebar expansion is selective: shallow folders open by default, deeper branches fold by default, and manual collapse overrides auto-expansion. There is no lazy directory loading — the canonical walk is recursive and the noise-dir filter keeps it bounded.
- On launch, the app auto-reopens the last workspace and attempts to restore the most recently opened file in that workspace

**`src/lib/`** — hooks and helpers (representative, not exhaustive)

State hooks (composed in `App.tsx`):
- `useOverlayStack.ts` — one tagged-union owner for every dialog/popover visibility (modal, switcher, workspaceSwitcher, search, update, wechatPublish, shortcutsHelp, commit, branchSwitcher, newBranch, renameBranch, deleteBranch, gitSyncPopover). Exposes `active` / `is(kind)` / `open(overlay)` / `close(kind?)` / `isBlocking`. See [ADR 0006](docs/adr/0006-overlay-stack-tagged-union.md) and the CONTEXT.md "Overlay model" section.
- `useWorkspaceSession.ts` — coordinator that composes `useWorkspace` + `useEditorSession` and owns the `sessionRef` bridge between them. The previous workaround that exposed the cycle at the App.tsx top level is encapsulated here. Returns the union of both hooks' APIs. See [ADR 0007](docs/adr/0007-workspace-session-coordinator.md).
- `useWorkspace.ts` — workspace open/close, the canonical recursively-walked tree (from `workspace_root`, with noise dirs filtered Rust-side), `flatFiles: FlatFile[]` (markdown-only projection used by `Cmd+P` and `openFileByPath`), and the file-lifecycle handlers (`handleNewFile`, `handleRename`, `handleDelete`, etc.). Lifecycle handlers fire `onPathCreated` / `onPathRenamed` / `onPathRemoved` callbacks so the editor session stays in sync without `useWorkspace` knowing about tabs, recents, or selection. Consumed via `useWorkspaceSession` from `App.tsx`.
- `useFileEditor.ts` — current file content, dirty tracking, auto-save coordination, frontmatter parse. Owns the save path. `App.tsx` calls it directly for editor-pane state (`fileContent`, `wordCount`, `parsedFrontmatter`, `saveStatus`), then passes a slim `FileEditorHandle` (`selectedFile`, `selectedPathRef`, `setSelectedFile`, `handleSelectFile`, `handleCloseFile`) into `useWorkspaceSession` so the open-file orchestration stays inside `useEditorSession`.
- `useEditorSession.ts` — the answer to "which file is the user editing right now, and what is its history?". Composes `useFileEditor` (passed in to break the dependency cycle with `useWorkspace`), `useOpenTabs`, and `useRecentFiles`. Owns `openFile(node)` / `openByPath(path)` (select + push recent + open tab as one step), `closeActive` (close tab and advance to neighbour, or close editor entirely), `notifyPathRenamed(old, new, lookup?)` and `notifyPathRemoved(path)` (keep tabs + recents + selection in lockstep on filesystem mutations). The pure helpers `selectionAfterRename` and `selectionShouldCloseAfterRemove` are exported for testing. Consumed via `useWorkspaceSession` from `App.tsx`.
- `useGit.ts` — git state (branch, status, remotes); polls via Tauri commands
- `useGitUiController.ts` — coordinates git dialogs (commit, branch CRUD, sync popover). Dialog *visibility* lives in the overlay stack (passed in as the `overlay` option); the controller owns dialog *data* (commit changes, branch lists) and constructs the overlay payload via `overlay.open({ kind: "commit", state: { ... } })`.
- `useFilesMode.ts` — owns `sidebarMode` and `fileViewerNode` only; persists mode per workspace in `localStorage`. The Files-mode tree itself is no longer a separate piece of state — it's a selector over `useWorkspace.tree`.
- `useWorkspaceRevisionPoll.ts` — polls `get_workspace_revision` every 2 s; reloads the tree and optionally the active file when the workspace changes on disk
- `useGitFocusFetch.ts` — triggers a background `git fetch` when the app window regains focus, subject to a cooldown
- `useKeyboardShortcuts.ts` — wires all global `keydown` shortcuts to app-level state and actions; takes `overlay: OverlayStack` and uses `overlay.isBlocking` to suppress shortcuts when a dialog is open
- `useGitRefreshOnSave.ts` — debounces a git-status refresh on the `unsaved → saved` transition; owns the debounce timer and previous-status refs internally
- `useMenuActions.ts` — subscribes to the native `menu-action` Tauri event (via `listenEvent` from the typed seam) and dispatches each *app-level* action to the appropriate handler; also owns `handleWechatCopy`. Takes `overlay: OverlayStack` and uses `overlay.isBlocking` for the suppress check. Editor-routed menu actions (`format-*`, `insert-*`) are handled separately by `useEditorCommands` inside the editor.
- `useContentTypes.ts` — Amytis content type discovery (only when workspace is Amytis)
- `useOpenTabs.ts` — per-workspace open-file tab list (cap 8) with localStorage persistence. Composed inside `useEditorSession`; not consumed directly from `App.tsx`.
- `useRecentFiles.ts` — per-workspace MRU list. Exposes `pushRecent` / `renameRecent` / `removeRecent` / `clearRecent` so in-memory state and localStorage stay in sync after path mutations. Composed inside `useEditorSession`.
- `useRecentWorkspaces.ts` — global MRU of opened workspaces.
- `useEditorPreferences.ts`, `useWordCountGoal.ts` — user preferences in `localStorage`
- `useToast.ts` — toast queue surfaced by `App.tsx`
- `useTheme.ts` — system/manual dark mode; syncs to `localStorage`; applies `data-theme` on `<html>`
- `useFocusTrap.ts` — modal dialogs: auto-focus first element, trap Tab/Shift+Tab, restore focus on close

Pure helpers:
- `types.ts` — Shared interfaces (`FileNode`, `WorkspaceState`, `ModalState`)
- `fileNode.ts` — `makeFileNodeFromPath`: construct a minimal `FileNode` from a plain path string (used when the full tree index is unavailable)
- `frontmatter.ts` / `frontmatterSchema.ts` — `parseFrontmatter` / `joinFrontmatter` (raw round-trip), `parseYamlFrontmatter` (js-yaml), and Amytis-aware schema lookups
- `appRestore.ts` — last-workspace and last-file restoration on launch
- `sidebarUtils.ts` — `forContentMode(tree, { workspaceRoot, treeRoot })` and `forFilesMode(tree)` are the two top-level mode projections applied in `App.tsx`. Internal helpers: `collapseIndexNodes`, `sortTree`/`sortNodes` (content-type priority), `sortTreeAlpha` (dirs-first alpha), `rollupGitStatus`, `filterTree` (sidebar query filter), `getSidebarDisplayName`, `needsPageDivider`. Noise-dir filtering moved to the Rust walk; there is no `filterNoiseDirs` here anymore.
- `fileSearch.ts` — `FlatFile` type, `flattenTree` (flattens a `FileNode[]` into `FlatFile[]`, applying `collapseIndexNodes`), `score` / `compareFiles` (fuzzy ranking with recency tie-breaking) used by `FileSwitcher`. `sidebarExpansion.ts` — `findAncestorPaths` derives ancestor directory paths from path segments. Other helpers: `markdown.ts`, `codeBlockLanguages.ts`, `imageUtils.ts`, `postPath.ts`, `gitAutoFetch.ts`, `gitUi.ts`, `utils.ts`, `perf.ts`
- `wechatHtml.ts` — Pure-string Markdown → WeChat-styled HTML pipeline backed by `markdown-it` (the same parser `tiptap-markdown` wraps internally). Five exports: `markdownToWechatHtml(markdown)` returns `{ html, hasMath }` — runs through a `markdown-it` instance whose custom renderer rules emit pre-styled HTML directly (no separate styling pass, no DOM, no Tiptap mount). Math (`$$...$$` and `$...$`) is stripped before parsing; `markdown-it-task-lists` handles `[ ]` / `[x]` and a single regex pass converts the resulting `<input type="checkbox">` to ☑/☐. `extractExcerpt(markdown, maxLen?)` strips markdown syntax and returns the first non-empty line truncated to `maxLen` (default 54). `hasMathBlocks(markdown)` returns true for any LaTeX block. `countLocalImages(markdown)` counts markdown images whose `src` isn't `http`/`https`/`data:`/`asset:`/`blob:`. The whole module is DOM-free and tested end-to-end via `wechatHtml.test.ts` (51 fixture tests covering headings, lists, code with newline preservation, tables with column alignment, ordered-list `start`, links with relative-href stripping, images, math, task lists, composition, and HTML-escape semantics).

**`src/lib/commands/`** — Typed seam over Tauri's `invoke()`. Every Rust command is reached via `commands.<domain>.<fn>()`; **nothing outside this directory imports `invoke` directly**. Files:
- `internal.ts` — `invokeCmd<T>(name, args?)` normalises Tauri's `string`-rejection into `Error` instances so callers can rely on `err.message`. `listenEvent<T>(name, handler)` returns a sync teardown for `useEffect` cleanup, hiding the async race in Tauri's `listen()`.
- `index.ts` — re-exports `commands` with one namespace per domain.
- `app.ts`, `assets.ts`, `contentTypes.ts`, `files.ts`, `git.ts`, `menu.ts`, `search.ts`, `wechat.ts`, `workspace.ts` — domain wrappers. Argument types are hand-typed in TS (camelCase, matching Tauri's auto-conversion of snake_case Rust params); return types are imported from `./generated/`.
- `generated/` — TypeScript types derived from Rust structs via `ts-rs`. Regenerated by `cargo test`; checked in. `bun run validate` includes `git diff --exit-code src/lib/commands/generated` so drift fails CI.

When adding a new Tauri command: derive `TS` on the Rust return struct (with `#[ts(export, export_to = "../../src/lib/commands/generated/")]`), add the wrapper function in the appropriate domain file, hand-type the Args interface mirroring the Rust fn signature. Drift between Rust args and TS args fails loudly at runtime (Tauri rejects unknown fields); drift between Rust returns and TS returns is caught by the validate guard.

**`src/theme.ts`** — Static theme constants consumed by components alongside the `useTheme` hook.

**`src/lib/editor/`** — editor command dispatch (ADR 0008)
- `commands.ts` — declarative table of every editor-routed command (keyboard shortcuts + native menu actions), plus the pure helpers `getEditorCommandById`, `shortcutMatches`, `commandCanRun`. Also hosts the private `pickAndInsertImage` helper used by the `insert-image` command. Adding a new editor command is one row here + (optionally) one entry in `src-tauri/src/menu.rs`.
- `useEditorCommands.ts` — two `useEffect`s (keyboard, menu) that dispatch from the table. Consumed by `Editor.tsx`.

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

Cross-language types: every Rust struct that crosses the IPC seam derives `ts_rs::TS` and exports its TypeScript shape into `src/lib/commands/generated/` on `cargo test`. The generated dir is checked in; `bun run validate` fails CI when it drifts from the Rust source. The frontend never references the Rust struct names directly — it imports the generated `.ts` files via the `commands/<domain>.ts` wrappers.

Workspace and file lifecycle:
- `open_workspace` (folder picker) / `open_workspace_at_path` — async, tokio oneshot; performs the canonical recursive `walk_tree` from `workspace_root` and returns the full tree in one round trip
- `list_workspace_tree` — re-walks the canonical tree from `workspace_root` and returns the full `FileNode[]`. Called by the frontend after every mutation and on the periodic revision poll. Replaces the previous `list_workspace` (content-only walk) and `list_workspace_children` (shallow lazy-load); the prior content-only / all-files split lives on the frontend as pure selectors (`forContentMode` / `forFilesMode`), not as Rust API variants.
- `read_file`, `write_file` — `read_file` validates against `workspace_root` (not `tree_root`) so files outside the Amytis `content/` subtree can be previewed; `write_file` uses atomic temp-file + rename
- `create_file`, `create_dir`, `ensure_dir` — new files/folders inside the workspace
- `rename_file`, `duplicate_entry`, `trash_file` — rename, copy, and OS-trash operations
- `save_asset`, `save_asset_from_bytes`, `pick_image_file` — image asset import: `save_asset` copies a file-path source (drag-and-drop), `save_asset_from_bytes` writes raw bytes (clipboard paste); both save to the active file's sibling `images/` directory, falling back to `<workspace_root>/images/`

Private helper (not a Tauri command):
- `walk_tree(path, cache)` — recursive walk producing every file, every directory, dotfiles included. Noise directories (`.git`, `node_modules`, `target`, `dist`, `build`, `.next`, `.nuxt`, `vendor`, `.cache`, `__pycache__`, `.tox`, `.venv`, `out`, `.turbo`, `.vercel`, `.parcel-cache`, …) are filtered at this layer, so callers don't have to. Mode filtering (markdown-only for content mode) lives in TS selectors.

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
- **Typed seam over `invoke()`** — the frontend never calls `invoke` directly; everything goes through `commands.<domain>.<fn>()` in `src/lib/commands/`. Return types are generated from Rust via `ts-rs`. The single catalog is the only place that knows about stringly-typed command names.
- **`useEditorSession` owns the open-file lifecycle** — the editor session (current file + tabs + recents + selection) is a single hook composing `useFileEditor` / `useOpenTabs` / `useRecentFiles`. `useWorkspace` notifies the session via `onPathCreated` / `onPathRenamed` / `onPathRemoved` callbacks; it never reaches into editor state directly. (ADR 0003)
- **`useWorkspaceSession` encapsulates the cycle** — the `sessionRef` bridge between `useWorkspace` (needs callbacks) and `useEditorSession` (built after the workspace) lives inside one coordinator hook instead of at the App.tsx top level. App.tsx composes the workspace+session in a single hook call. (ADR 0007)
- **One tagged-union owns every overlay** — `useOverlayStack` replaces twelve independent visibility booleans and the duplicated "is anything blocking?" check that previously lived in both `useKeyboardShortcuts` and `useMenuActions`. The rule "only one overlay can be active at a time" is enforced by the type, not by convention. (ADR 0006)
- **Keyboard shortcuts have a single source of truth** — `src/lib/shortcuts.ts` lists every shortcut (global + editor-command-table + Tiptap defaults) with a stable id, key combo, category, and i18n description key. The in-app Keyboard Shortcuts help dialog (`?` or Help → Keyboard Shortcuts) and `docs/shortcuts.md` both render from it. The Tiptap-conflict test in `src/lib/editor/commands.test.ts` runs every command-table shortcut through `bindingConflictsWithTiptap` to catch the ProseMirror shift-letter normalization trap (the original `Cmd+Shift+I` bug class) before it ships.
- **Editor commands are a declarative table** — every keyboard shortcut and native menu action dispatches from one table in `src/lib/editor/commands.ts`, via the `useEditorCommands` hook. Adding a new command is one row plus an optional entry in `src-tauri/src/menu.rs`; keyboard and menu surfaces cannot drift apart. (ADR 0008)
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

**Rust native menus**: the frontend calls `commands.menu.setLanguage({ labels })` after i18n initialises and again on language toggle. `labels` is a `Record<string, string>` built by `buildMenuLabels(t)` in `src/lib/menuLabels.ts`. On startup (before the WebView loads), `initial_menu_labels()` in `src-tauri/src/menu.rs` uses `sys-locale` to read the OS locale and parses `src/locales/*.json` (embedded via `include_str!`) to seed the menu in the right language from frame one.

**Adding a translation key**:
1. Add the key to **both** `en.json` and `zh-CN.json` under the appropriate section.
2. Use `t("section.key")` in the component or pass `Translate` to the helper.
3. For Rust menu items, also add the key to `MENU_KEYS` in `src/lib/menuLabels.ts`.
4. Run `bun run validate` — the parity test in `i18n.test.ts` will fail if either locale file is missing the key.

## Error Handling

- Tauri Rust commands return `Result<T, String>` — errors surface as rejected promises in the frontend. The `commands` wrapper layer in `src/lib/commands/internal.ts` normalises rejections to `Error` instances (`err.message` always populated), so catch blocks should use `err instanceof Error ? err.message : String(err)` rather than `String(err)` (the latter produces `"Error: msg"` after normalisation).
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
