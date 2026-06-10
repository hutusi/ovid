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

Coverage (not part of `validate` — run on demand):

```bash
bun run test:coverage       # TS coverage (text + coverage/lcov.info)
bun run coverage:rust       # Rust coverage summary (one-time: cargo install cargo-llvm-cov)
bun run coverage            # Both summaries

# HTML reports (open the printed path in a browser)
bun run coverage:html       # TS — requires lcov (`brew install lcov` for genhtml)
bun run coverage:rust:html  # Rust — uses cargo-llvm-cov built-in HTML
```

Tests are colocated as `*.test.ts` next to the implementation (e.g. `src/lib/frontmatter.test.ts`, `src/lib/tiptap/FindReplace.test.ts`).

**Hook tests** run under happy-dom via per-file opt-in (not a global preload — a globally-registered `document` changes Tiptap/ProseMirror's serialization path). Pattern:

```typescript
import { afterAll, beforeAll, describe, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import { registerHappyDom, unregisterHappyDom } from "../../scripts/test-setup";

beforeAll(registerHappyDom);
afterAll(unregisterHappyDom);

// renderHook(() => useFoo(args)) + act(...) — see useEditorSession.test.ts
// for the canonical example, useWorkspace.test.ts for the mock.module()
// pattern that stubs @tauri-apps/api/core's invoke.
```

See [ADR 0012](docs/adr/0012-react-testing-library-for-hooks.md). Pure-helper extraction remains the first choice for decision logic; the renderer is for orchestration that can't be extracted without distortion.

## Development Workflow

For a new feature or non-trivial change:

- **Branch.** Work on a dedicated `<type>/<topic>` branch off `main`, not directly on `main`.
- **Commit in focused slices.** One commit per logical slice (e.g. split a dead-code removal from the feature that replaces it). Keep `bun run validate` green at each commit so the branch stays bisectable. Use Conventional Commit messages; no `Co-Authored-By` trailers.
- **Tests + docs in the same change.** Add/extend tests for new behavior (Rust parsers, pure helpers, sidebar projections), and update docs when behavior or a documented concept changes — **CONTEXT.md** for concepts/seams, an **ADR** for a new decision, plus **README.md** / **ROADMAP.md** for user-facing capability. `bun run validate` fails on generated-type drift and locale-parity, so regenerate (`cargo test`) and keep both locale files in sync.
- **Commits** follow Conventional Commits: `feat | fix | refactor | perf | chore | docs | test | release`. Subject under ~70 chars; body explains *why*.
- **Open a PR** into `main` when the branch is green. Pushing, and opening PRs are actions the user authorizes — don't push or open a PR unless asked.

## Architecture

**[CONTEXT.md](CONTEXT.md) is the canonical description of the domain concepts and architectural seams** (Amytis workspace paths, the typed Tauri seam, sidebar projections, the file-lifecycle vocabulary, the overlay model, scaffolding & collections) — read it for the *why*. The decision history lives in `docs/adr/`. This section is just the map; read the source files for file-level detail.

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

Directory map:

- **`src/App.tsx`** — root component; composes the top-level hooks and owns only the few UI flags that aren't overlays (sidebar visibility, zen/typewriter mode, cover image visibility). No external state library. Render output is four top-level components: `Sidebar`/`SearchPanel`, `EditorPane`, `StatusBar`, `AppDialogs`.
- **`src/components/`** — UI components. All overlays/dialogs are rendered by `AppDialogs.tsx`, which composes per-domain dialog groups in `src/components/dialogs/` (`GitDialogs`, `WorkspaceDialogs`, `FileDialogs`, `WechatDialogs`); dialog *visibility* is never a prop — it lives in `useOverlayStack`. Dialogs themselves render through the shared `Modal.tsx` primitive. Non-markdown files selected in Files mode preview via `FileViewer.tsx`.
- **`src/lib/`** — hooks and pure helpers (workspace/editor/git session, sidebar projections in `sidebarUtils.ts`, `frontmatter.ts`, `amytisScaffold.ts`, `collection.ts`, `wechatHtml.ts`, …).
- **`src/lib/commands/`** — the **only** place that imports Tauri's `invoke`. One namespace per domain (`commands.<domain>.<fn>()`); `invokeCmd`/`listenEvent` normalise errors and event teardown; return types are generated from Rust via `ts-rs` into `generated/` (checked in; `bun run validate` fails on drift). See [ADR 0001](docs/adr/0001-typed-tauri-command-seam.md).
- **`src/lib/editor/`** — declarative table of every editor-routed command (keyboard + native menu), dispatched by `useEditorCommands`. Adding a command is one row + an optional `src-tauri/src/menu.rs` entry. See [ADR 0008](docs/adr/0008-editor-command-table.md).
- **`src/lib/tiptap/`** — custom Tiptap/ProseMirror extensions (find & replace, folding, footnotes, image renderer, task lists, …).
- **`src/styles/`** — `global.css` (Tailwind `@theme` block — the single source of truth for design tokens + `[data-theme="dark"]` overrides) and `editor.css` (prose typography).
- **`src-tauri/`** — Rust backend, split by domain (`workspace/`, `files.rs`, `search.rs`, `content_types/` — the site.config.ts parsers over one shared scanner, `git/`, `assets.rs`, `wechat/`, `menu.rs`, `creds_store.rs` — the shared secrets file store behind `git/creds.rs` and `wechat/creds.rs`, …). `lib.rs` is a thin coordinator that declares modules and registers commands. Path arguments for file operations are validated against the open workspace root.

Key principles (each has fuller treatment in CONTEXT.md / the cited ADR):

- **Single canonical tree, two pure projections.** `useWorkspace` owns one recursively-walked tree; the sidebar renders it through `forContentMode` / `forFilesMode` selectors (noise dirs filtered in the Rust walk). See CONTEXT.md "Sidebar projections", [ADR 0002](docs/adr/0002-unified-workspace-tree.md).
- **`useEditorSession` owns the open-file lifecycle** (current file + tabs + recents + selection); `useWorkspaceSession` encapsulates the workspace↔session callback cycle. See CONTEXT.md "File lifecycle vocabulary", [ADR 0003](docs/adr/0003-editor-session-owns-open-file-lifecycle.md) / [ADR 0007](docs/adr/0007-workspace-session-coordinator.md).
- **One tagged-union owns every overlay** (`useOverlayStack`) — "only one overlay active at a time" is enforced by the type. See CONTEXT.md "Overlay model", [ADR 0006](docs/adr/0006-overlay-stack-tagged-union.md).
- **Keyboard shortcuts have a single source of truth** — `src/lib/shortcuts.ts` lists every shortcut (global + editor-command-table + Tiptap defaults). The in-app help dialog renders from it; `docs/shortcuts.md` is hand-maintained to match. The conflict test in `src/lib/editor/commands.test.ts` guards the ProseMirror shift-letter normalization trap (the original `Cmd+Shift+I` bug class).
- **Content type is derived from the bucket folder, not frontmatter**; scaffolding via `amytisScaffold.buildNewContent` (mirrors the Amytis `new-*` scripts); `type: collection` series are rendered as in-place-editable link views. See CONTEXT.md "Content types, scaffolding & collections", [ADR 0009](docs/adr/0009-amytis-native-content-scaffolding.md) / [ADR 0010](docs/adr/0010-collections-as-link-views.md).
- **Window chrome is one continuous 36 px top strip** — sidebar header + editor top bar + properties header share `--topbar-height` and form a single Tauri drag region (`data-tauri-drag-region="deep"`). The strip carries only buttons; per-segment titles (workspace name, "METADATA"/"FRONTMATTER") sit in a dedicated row below it. See [ADR 0013](docs/adr/0013-unified-window-chrome.md).
- **Wiki links are a Tiptap node with frontmatter-only resolution** — `[[Target]]` / `[[Target|Display]]` is an inline atom node (`src/lib/tiptap/WikiLink.ts`) that round-trips through tiptap-markdown via `addStorage.markdown`. Resolution is alias-first then title (case-insensitive, notes-only) via a `NoteResolverIndex` built from frontmatter; no filename-slug fallback. Unresolved targets only materialize `notes/<slug>.md` on first navigation (anti-litter), via the existing `buildNewContent("note", …)` scaffold. A backlinks scanner (`src/lib/backlinks.ts`) feeds the "Linked references" section at the bottom of the editor scroll. See CONTEXT.md "Wiki links", [ADR 0016](docs/adr/0016-bidirectional-wiki-links.md).

Tech choices: **Tauri 2** (not Electron — smaller, faster, no Chromium), **Tiptap v3** (ProseMirror) + **`tiptap-markdown`**, **Bun**, **Biome**. No shared code with the TUI sibling (`ovid`) — reference it for domain logic only. All file I/O goes through Tauri commands / the FS plugin — never direct Node/Bun APIs in the frontend.

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
- **Use the `<Modal>` primitive** — all dialogs render through `src/components/Modal.tsx` (+ `<ModalActions>` for the Cancel/Confirm footer), which owns the overlay/backdrop/panel structure, `useFocusTrap`, dialog ARIA, Escape (with `stopPropagation`), and backdrop-click close; see [ADR 0017](docs/adr/0017-shared-modal-primitive.md). Pass dialog-specific keys (Enter-submit, list navigation) via the `onKeyDown` prop — it runs before the Escape handler; when Enter submits, check `e.target === inputRef.current` to avoid double-firing when focus is on a button
- **Custom popovers** — use a conditionally rendered positioned `<div>` with `useEffect` for click-outside and Escape key handling; see `FontSettings.tsx` or `CodeBlockView.tsx` for the pattern

### Window chrome / drag regions

- **Top strip is one 36 px region** — sidebar header, editor top bar, and properties panel header all consume `--topbar-height` from `:root` in `global.css` and use the inset bottom-border treatment (`box-shadow: inset 0 -1px 0 var(--color-border)`) for visual continuity across the seams
- **Use `data-tauri-drag-region="deep"`** — Tauri 2.11's bare `data-tauri-drag-region` is self-only (drag fires only on a direct click on the attributed element, descendants do not inherit). Use `"deep"` so clicks anywhere in the subtree drag the window. Intrinsically clickable descendants (`<button>`, `<a>`, `<input>`, contenteditable) auto-block, so buttons inside keep working with no annotation
- **Opt out HTML5-draggable subtrees with `data-tauri-drag-region="false"`** — Tauri's mousedown handler runs before the browser's `dragstart` and calls `preventDefault` + `stopImmediatePropagation` on matching regions, killing HTML5 drag. Any element with `draggable` inside a `"deep"` parent (today: `.tab-bar-item`) must opt out explicitly
- **Capability requirement** — `src-tauri/capabilities/default.json` must grant `core:window:allow-start-dragging`. The default `core:window` permission set does **not** include it; without it every drag region is wired up but inert (IPC rejection is silent)
- **Don't conditionally hide the editor top bar** — it must always render so the middle of the top edge stays draggable in every layout state. Zen mode is the exception (hidden via `.app[data-zen] .editor-top-bar { display: none }`)
- See [ADR 0013](docs/adr/0013-unified-window-chrome.md) for the full decision and the Tauri 2.11 walker rules

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

## Amytis Workspace

An Amytis workspace is identified by `site.config.ts` + a `content/` directory. Content files are `.md`/`.mdx` with YAML frontmatter, parsed with `js-yaml`, stripped from the editor view, and shown in the properties panel. On a plain editor save the raw frontmatter block is written back verbatim; *structured* edits (properties panel, collection `items:`) re-serialize it and do not preserve comments. Note that the sidebar's tree root may be `content/` while the workspace root is the project root — see CONTEXT.md "Amytis workspace" for the `workspaceRootPath` / `workspaceRoot` / `assetRoot` distinction that path and restore logic must respect.

## Internationalization

Supported languages: **English** (`en`) and **Simplified Chinese** (`zh-CN`); preference stored in `localStorage` under `ovid:language`, detected on startup by `i18next-browser-languagedetector`.

- **Locale files** `src/locales/en.json` and `zh-CN.json` — nested JSON, dot-notation keys. Both must have identical key structure; `src/lib/i18n.test.ts` enforces parity.
- **React components** use `useTranslation()` — `t("section.key")`, or `t("key", { count })` for plurals. **Pure helpers** take a `Translate` type param (`(key, vars?) => string`) instead of importing `TFunction`, threaded from the nearest hook.
- **Non-React surfaces:** CSS-only text uses a `--*-text` CSS var set in `src/lib/i18n.ts`; Rust native menus are seeded by `initial_menu_labels()` (`menu.rs`) on startup and updated via `commands.menu.setLanguage({ labels })` built by `buildMenuLabels` in `src/lib/menuLabels.ts`.

**Adding a translation key**:
1. Add the key to **both** `en.json` and `zh-CN.json` under the appropriate section.
2. Use `t("section.key")` in the component or pass `Translate` to the helper.
3. For Rust menu items, also add the key to `MENU_KEYS` in `src/lib/menuLabels.ts`.
4. Run `bun run validate` — the parity test in `i18n.test.ts` fails if either locale file is missing the key.

## Error Handling

- Tauri commands return `Result<T, String>`; the `commands` wrapper (`src/lib/commands/internal.ts`) normalises rejections to `Error` instances, so catch blocks should use `err instanceof Error ? err.message : String(err)`.
- Display errors via the toast system (`showToast` in `App.tsx`) — never `console.error` for user-visible failures; `ErrorBoundary` wraps the editor and surfaces render errors instead of a blank screen.
- Path validation happens in Rust — every containment check funnels through `ensure_within` in `src-tauri/src/paths.rs` (`read_file` / `write_file` / git commit selections reject paths outside the workspace root).

## Context Compression Hints

When compressing conversation history, preserve in priority order:

1. **Architecture decisions** — especially any deviations from constraints in this file
2. **Modified files and key changes** — which files changed and why
3. **Tauri command changes** — Rust-side commands being added/modified (separate from frontend)
4. **Verification status** — current `bun run validate` pass/fail state
5. **Open TODOs and rollback notes**
6. **Tool output** — can be dropped; keep pass/fail summary only

## Reference Docs

- [CONTEXT.md](./CONTEXT.md) — domain vocabulary & architectural seams (the *concepts* behind the code); update it in the same PR when a concept changes
- `docs/adr/` — architectural decision records (0001–0013)
- [ROADMAP.md](./ROADMAP.md) — phased plan; complete the current phase before starting the next
- [AGENTS.md](./AGENTS.md) — sibling guidance file with overlapping conventions; keep the two in sync if either changes
- `docs/shortcuts.md` — full keyboard shortcut reference (kept in sync with `src/lib/shortcuts.ts`)
- `docs/git-workflow.md` — branch and merge conventions
- `docs/release-checklist.md`, `docs/updater-plan.md`, `docs/updater-release-runbook.md` — release and updater procedures
