# Changelog

All notable changes to Ovid will be documented in this file.

The format is based on Keep a Changelog, adapted to match the project's
release cadence and Conventional Commit history.

## Unreleased

## 0.17.0 - 2026-08-08

### Added
- **External-change conflict detection**: saving no longer clobbers a file that
  changed on disk since it was read. Reads carry an opaque content-hash version
  token; a mismatched save opens a conflict dialog (keep mine / take disk)
  instead of silently overwriting, file creation is atomic, and existing file
  permissions are preserved on write. See ADR 0020.
- **Save-before-close flush**: pending autosaves (the last ~1 s of typing held
  by the debounce) are flushed before the window closes, so quitting mid-thought
  no longer drops the tail of your edit. A visible "Saving…" save-state joins
  the saved/unsaved dot, and generated commit messages are localized.
- **Warm editorial theme**: a full visual refresh — warm token palette with a
  copper accent, paper-grain texture and material panel depth, editorial prose
  typography, and matching chrome/sidebar/status-bar/modal polish. See ADR 0019.
- **Keyboard replace**: the find & replace bar can now replace one / replace all
  entirely from the keyboard.

### Changed
- **Per-file session word progress**: the status-bar `+N` badge now shows words
  added to the *current file* this session. Each file keeps its own baseline for
  the whole app run — switching files shows the other file's progress and
  switching back restores this one's; renames migrate the baseline, deletions
  drop it, and externally-reloaded content rebaselines instead of counting
  foreign words. The badge tooltip and README were updated to match.
- **Search hardening**: workspace search gained a stale-response guard, an
  explicit error state, and better match navigation.
- **Compact properties drawer**: on narrow windows the properties panel is a
  cleanly non-modal drawer with correct dialog semantics and focus management.
  See ADR 0004/0017 updates.

### Fixed
- **CJK word count**: Chinese / Japanese / Korean text now counts correctly —
  each CJK character counts as one word instead of a whole paragraph counting
  as one. The English count also uses proper singular/plural forms.
- **Production-build startup crash**: a bundling interaction between the KaTeX
  lazy-load scheme and chunk merging could make a packaged build launch to a
  dead black window while dev stayed green. The KaTeX global is now resolved
  lazily, and every build runs a smoke test that evaluates the bundled entry
  chunk so this whole class of failure fails the build instead of shipping.
- **Session badge accuracy**: `+N` no longer always equals the document total
  (the baseline raced the file-load path), and it survives renames, deletions,
  and external reloads without inventing or losing progress.
- **Data-safety hardening**: editor writes are ordered per file and pending
  edits survive failed flushes; frontmatter writes are debounced and tracked in
  the save-coordination model; tabs/recents update only after a successful
  open; workspace tree refreshes are invalidated on workspace switch; path
  validation for file writes checks the workspace root (not the tree root);
  `save_asset` gained an extension allowlist.
- **Assorted fixes**: sidebar keyboard resize mirrors the rendered width with
  correct ARIA; git `branch -m`/`-d` argument injection guarded with a `--`
  separator; branch-operation errors classified for clearer messages; the two
  remaining raw-English error toasts translated; Files-mode refresh and
  sidebar-drag edge cases closed.

### Performance
- **Calmer editing and navigation**: reduced per-keystroke editor work; corpus
  reads for wiki links and backlinks are batched; read-only workspace/git
  commands run off the main thread; per-file caches are bounded and huge files
  guarded on read; workspace revision polling pauses while the window is
  hidden and skips non-markdown file events.

## 0.16.0 - 2026-06-08

### Added
- **Wiki links and backlinks**: `[[Target]]` and `[[Target|Display]]` are now a
  first-class inline Tiptap node (atom, selectable) that round-trips through
  Markdown. Resolution is alias-first then title (case-insensitive, notes-only)
  via a frontmatter-built `NoteResolverIndex` — no filename-slug fallback.
  Unresolved targets only materialise `notes/<slug>.md` on first navigation, so
  the workspace never accumulates orphan files from stray typing. Typing `[[`
  opens a suggestion popover with keyboard-navigable note autocomplete. A
  "Linked references" panel at the bottom of the editor scroll surfaces inbound
  links via a backlinks scanner. See ADR 0016.
- **Workspace Manager**: a dedicated two-pane manager (logo + section tabs)
  replaces the old single-purpose recents dropdown. The manager handles
  list / create / clone as a state machine; switching is two-step with a check
  icon on the current row to avoid accidental swaps; arrow keys navigate the
  recents list. The "Create" path scaffolds a minimal Amytis workspace; the
  "Clone" path clones a remote Amytis workspace from a Git URL.
- **Git HTTPS credentials**: push / pull / fetch now detect `AUTH_REQUIRED` and
  prompt for credentials via a dedicated dialog (with overlay variant) instead
  of failing silently. Credentials are stored per host with HTTPS URL injection
  at command time; the retry flow uses an authenticated command shell. The
  host-probe path was hardened against malformed remotes, and forget-credential
  failures now surface via toast. See ADR 0014.
- **Notifications history**: recent toasts persist and are reachable from a
  status-bar popover, so transient errors aren't lost the moment they fade.
- **Unified window chrome**: the sidebar header, editor top bar, and properties
  panel header now share a single 36 px top strip with continuous styling and a
  deep Tauri drag region. Tabs live inside the title bar with an Obsidian-style
  active-tab lift; macOS gets traffic-light tuning; Windows and Linux get
  custom window controls. See ADR 0013.
- **Sidebar refinements**: content-mode buckets are now collapsible (default
  collapsed), styled as section headers, with an expand-all / collapse-all
  toggle. The filter input collapses behind a Search-icon toggle. Workspace
  name button gains an icon + chevron affordance.
- **Workspace scaffolding and cloning**: a `Workspace › Scaffold New` command
  creates a minimal Amytis workspace on disk; a `Workspace › Clone Remote`
  command clones an Amytis workspace from a Git URL — both with localized
  prompts and validation.
- **CJK-friendly italic and strikethrough**: typed `*word*` / `_word_` and
  `~~word~~` now fire after CJK characters or mid-paragraph, matching the
  earlier bold fix. The italic rule uses negative lookbehind/lookahead so it
  doesn't prematurely fire on the `**word*` intermediate state of a bold
  typing sequence. See ADR 0015.
- **Typed image syntax**: typing `![alt](src)` now inserts an inline image
  node — previously it only worked via paste or file-load. The custom Link
  input rule was tightened with `(?<!!)` so it no longer cannibalises the
  `[alt](src)` slice of image markdown.
- **Properties panel collapse**: a collapse button in the properties panel
  header; the open/closed state persists across sessions via `localStorage`.
- **Title-to-body focus**: pressing `Enter` in the title input now focuses the
  editor body instead of inserting a newline.

### Changed
- **Toggle-sidebar shortcut moved** from `Cmd+\` to `Cmd+Shift+L` to match the
  new "Left Sidebar" naming and free up `Cmd+\` for future use.
- **View menu toggles renamed** to "Left Sidebar" / "Right Sidebar" with
  checkmarks reflecting current state, so the menu now reads as state rather
  than as bare verbs.
- **Editor and tab surface polish**: bold weight strengthened; the title
  border-bottom is dropped in favour of whitespace separation; inline code,
  blockquote, and footnote sizing are softened; tab strip gains a 1px bottom
  line with a subtle separator between inactive tabs and an active-tab outline
  that merges with the strip baseline.
- **IME composition is now guarded** during typing so structural markdown
  rules (`# `, `- `, `> `, …) don't fire mid-composition — see ADR 0015.

### Fixed
- **Image syntax no longer becomes a link with a stray `!`** (#114): the Link
  input rule was matching `[alt](src)` inside `![alt](src)` because it had no
  lookbehind for `!`, leaving the user with a broken-feeling editor.
- **Wiki-link suggestion popover regressions**: highlight no longer escapes
  its bounds when the result set shrinks; arrow keys correctly bubble when the
  popover is empty; listener and target leaks were plugged.
- **Backlink snippets are now readable**: backslash-escapes are stripped from
  both the matched query and the surrounding context, and `[[…]]` references
  render as their display label rather than as raw wiki syntax.
- **Sidebar bulk toggle uses `every` not `some`** for mixed-state safety —
  clicking expand-all when *any* bucket is already open no longer collapses
  the rest.
- **Tauri drag regions are alive again**: the top strip switched to deep mode
  (Tauri 2.11's bare attribute is self-only), the editor top bar always
  renders so the middle of the top edge stays draggable, and the
  `core:window:allow-start-dragging` capability is now granted (without it,
  every drag region was silently inert).
- **Workspace-manager hardening**: error paths surfaced by PR review are now
  handled rather than swallowed; the `?url` asset import resolves under the
  test tsconfig.
- **Git command resilience**: dropped a spurious `debug_assert` in
  `run_git_with_credentials`; AUTH_REQUIRED now opens the credentials dialog
  on commit-and-push (not just on push); forget-credential failures surface
  via toast instead of failing silently.
- **Properties panel state persists**: `propertiesOpen` is now persisted to
  `localStorage` so the panel reopens to its last state on launch.

### Internal
- **ADRs 0013–0016**: unified window chrome (0013), Git HTTPS credentials
  (0014), IME composition guard for markdown input rules (0015), bi-directional
  wiki links (0016). Each is paired with CONTEXT.md / ROADMAP / shortcuts.md
  updates so the contributor docs stay aligned with the shipped seams.
- **Markdown input rules extracted** into `src/lib/tiptap/markdownInputRules.ts`
  as their own module, with diagnostic tests for the bold-vs-italic
  non-conflict and the CJK regression cases.
- **Design-token scales**: added shadow / radius / motion / backdrop scales
  and applied them across components — theme-aware modal backdrop, focus
  halos, unified focus rings, quiet transitions where their absence was
  jarring, and tokenization of two surface seams missed by an earlier sweep.
- **Test scaffolding**: smoke coverage for `WikiLinkView`,
  `WikiSuggestionPopover`, and the extracted `createWikiNote` helper; test
  helpers tightened with the previously-missing `destroy()` calls;
  `useRecentWorkspaces` exposes `removeRecentWorkspace` for test
  composability.
- **Minor refactors**: bucket-aware sidebar expansion defaults, a one-module
  `toggleable-visibility` helpers extract, narrowing `SetMenuCheckedArgs.id`
  to the checkable item ids, and dropping the now-unused `⊕` open-workspace
  button from the chrome strip.

## 0.15.1 - 2026-06-01

### Fixed
- **Sidebar collection links unstuck**: clicking items under a `type: collection`
  series (e.g. `series/modern-web-dev`) now reliably opens the referenced post.
  The resolution itself was correct, but Sidebar's render-time `measureSync` was
  synchronously firing PerfPanel setState mid-render, interrupting reconciliation
  before the resolved `collectionLinks` Map landed on the rendered rows. Perf
  listener notifications are now deferred via `queueMicrotask` and coalesced per
  tick. Includes an end-to-end test that runs the full `forContentMode →
  flattenTree → resolveCollectionItems` pipeline against my-garden-shaped
  fixtures so the contract is locked in.
- **Editor warnings silenced**: removed the duplicate-extension warning by
  disabling StarterKit's bundled `Link` (we register a customised one alongside),
  and deferred the `onWordCount` call in `onUpdate` so it no longer setState's
  App mid-render during initial Tiptap construction.

## 0.15.0 - 2026-05-31

### Added
- **Amytis text-rendered cover images**: `coverImage: text:Issue 1` now renders as
  a styled gradient card both in the editor banner and the properties-panel
  thumbnail, matching the Amytis site's rendering. The palette is picked
  deterministically from the slug, with dark-mode variants. The Cover image
  field offers a "Use text cover" button (and a "Use image instead" button when
  switching back), an inline "Cover text" input bound to just the suffix, and a
  short hint explaining the gradient behaviour.
- **Excerpt textarea**: the `excerpt` frontmatter field is now a first-class
  schema entry with a new `longtext` kind. Clicking the excerpt row opens a
  multi-line, auto-growing textarea that commits on `Cmd/Ctrl+Enter`, cancels
  on `Esc`, and saves on blur. Bare Enter inserts a newline.
- **Sort dropdown**: the `sort` frontmatter field is now a constrained select
  (`date-asc` / `date-desc` / `manual`) instead of a free-text input. Out-of-
  vocabulary existing values are surfaced as an additional option so they
  aren't silently lost. The Add-field affordance only offers `sort` on series
  (where `posts:` ordering applies); already-present values keep rendering on
  any file so nothing is hidden by surprise.
- **Per-bucket content icons**: top-level content buckets in the sidebar
  (`posts/`, `series/`, `books/`, `flows/`, `notes/`, `pages/`) now show a
  type-specific icon instead of the generic Folder/FolderOpen glyph. Entry
  folders and Files-mode folders keep the open/closed folder icon.
- **Internationalization sweep**: translated the remaining editor surfaces —
  bubble menu, find & replace, link dialog, search panel, code block, and the
  tab bar — alongside error toasts in the file editor, git, and workspace
  hooks. The properties panel labels (including `featured` and `pinned`) now
  route through `t()`, dates in the properties panel and update dialog are
  localized, new-content scaffolds localize body and excerpt placeholders, and
  common Amytis frontmatter keys (`tags`, `categories`, `series`, …) are
  translated in `CustomMetadataField`.
- **Tabbed Preferences dialog**: a new Preferences dialog (opened with `Cmd+,`,
  the menu, or the status-bar gear) groups app and content preferences behind
  tabbed navigation. Launch session restore is now gated behind a preference,
  the new-content format and layout are configurable, and the dialog is
  dismissible via the × button and document-level `Esc`.
- **site.config integration**: the sidebar honors the `site.config.ts`
  `features` block for bucket visibility and labels (site-disabled buckets are
  marked rather than hidden in Content mode, with localized fallback labels
  for standard buckets), the WeChat publish dialog surfaces the `authors` map,
  `.rst` content files open read-only, and locale-variant translations are
  grouped together in the sidebar.

### Changed
- **Series row toggle**: clicking a series/book entry name in the sidebar now
  collapses the row on the second click (when its `index.md` is the active
  file), instead of being a silent no-op fighting the auto-expand-ancestors
  effect.
- **Boolean property labels** (`draft`, `featured`, `pinned`) now share the
  same uppercase typography and weight as every other property label;
  the previously divergent bolder styling is gone. The Enabled/Disabled
  subline is restyled to read as the row's value.

### Fixed
- **Language-switch failures** are now surfaced via the toast system instead
  of failing silently.
- **`site.config.ts` parsers and WeChat avatar resolution** were hardened
  against malformed input (CodeRabbit follow-up on PR #90).
- **Word-count goal** input now rejects partial numeric parses (e.g. `"100x"`
  is no longer silently accepted as `100`).
- **`restoreLastSession`** is latched at mount so the preference can't toggle
  the restore behavior mid-session.

### Internal
- **Coverage push-up — final pass**: closes the remaining gaps that fit
  the current toolchain. TS side: `useWorkspace.ts` (63% → 85%) gains
  tests on `handleNewTodayFlow` / `handleDuplicate` /
  `handleNewFromExisting` / `addCollectionItem` / `removeCollectionItem`;
  `useGitUiController.ts` (8% → 96%) gains 20 renderHook tests across
  dialog state, branch mutation, sync-popover dispatch, and the commit
  flow; `tiptap/FindReplace.ts` (16% → 99%) and `tiptap/TextFolding.ts`
  (20% → 85%) gain `Editor.create()`-based ProseMirror command +
  fold-state-machine tests (per-file happy-dom opt-in for plugin
  installation). Rust side: `mockito = "1"` joins `[dev-dependencies]`
  for HTTP layer testing; `wechat/token.rs` (0% → 93%),
  `wechat/publish.rs` (12% → 58%, with its `create_wechat_draft` /
  `update_wechat_draft` helpers extracted), and `wechat/upload.rs`
  (54% → 88%) gain cache + workflow + error-path coverage against
  mockito servers. Mockito tests use a `.no_proxy()` reqwest client
  because macOS system proxies otherwise intercept the 127.0.0.1
  request and return 502. Tauri command shells with `State<…>`
  arguments, async mutating git commands, and UI components stay
  uncovered — they're structural limits of the current toolchain.
- **TS load-bearing hook coverage** (ADR 0012, supersedes the
  testing-strategy note in ADR 0007): adopt `@testing-library/react` +
  `@happy-dom/global-registrator` for hook tests, opted in per file via
  `registerHappyDom` / `unregisterHappyDom` from `scripts/test-setup`
  (per-file scope keeps Tiptap/ProseMirror tests on their headless
  serialization path). Add seven orchestration tests for
  `useEditorSession` covering the four invariants its doc-comment
  promises (open / rename / remove / close-active-with-neighbour), and
  seven action-path tests for `useWorkspace` that mock the Tauri seam
  via `mock.module()`. Line coverage: `useEditorSession.ts` 15.3% → 99%,
  `useWorkspace.ts` 3.6% → 63%, with transitive lift on `useOpenTabs.ts`
  (31% → 92%) and `useRecentFiles.ts` (27% → 91%).
- **Rust seam coverage**: extracted `build_workspace_result_core` as a
  pure helper of `workspace::commands` and added smoke tests for the
  Amytis-workspace / plain-directory / missing-path / cache-population
  paths. Integration-tested the read-only git command helpers
  (`get_current_branch_inner`, `parse_git_branches`,
  `get_git_remote_info_inner`) against a real `git init -b main` repo
  via `tempfile`; tests skip cleanly when `git` is unavailable. Added a
  cross-language parity guard in `menu.rs` asserting
  `default_menu_labels()` covers every key in `en.json`'s `menu` block;
  the guard's first run exposed five toast strings (`git_pull_success`,
  `git_fetch_success`, `file_wechat_copy_success`,
  `file_wechat_copy_no_content`, `file_wechat_copy_math_warning`)
  without Rust fallbacks, now added.
- **Coverage reporting**: added `bun run coverage` (TS via `bun test
  --coverage`, Rust via `cargo-llvm-cov`) plus HTML variants
  (`coverage:html` using `genhtml`, `coverage:rust:html` using
  `cargo-llvm-cov`'s built-in renderer). CI publishes both summaries to
  the GitHub Actions step summary on every run (non-gating, `if:
  always()` so they show on red builds). `bun run validate` is unchanged
  so local pre-commit speed is preserved.
- **Dependency sweep**: refreshed JS and Rust deps. Within-major bumps across
  Tauri 2.11, Tiptap 3.23.6, React 19.2.6, i18next 26.3, biome 2.4.16,
  tailwindcss 4.3, vite 7.3.3. Five majors taken on the same branch as
  bisectable single commits: `lucide-react` 0.577 → 1.17 (all 25 in-use icons
  survived), `katex` 0.16 → 0.17 (CSS-only consumer), `typescript` 5.8 → 6.0
  (removed deprecated `baseUrl`; opted out of the new
  `noUncheckedSideEffectImports` for CSS side-effect imports), `vite` 7 → 8
  with `@vitejs/plugin-react` 4 → 6 (renamed `rollupOptions` →
  `rolldownOptions`; kept the `manualChunks` function form, deferring the
  `codeSplitting` rethink), and `ts-rs` 11 → 12 (regenerated bindings —
  `FeatureBucket.names` lost a redundant `?`, no consumer changes needed).

## 0.14.0 - 2026-05-29

### Added
- **Collections as link views**: a `type: collection` series (such as a book or curated
  list) now renders its `items:` as navigable links in the sidebar. Entries can be added or
  removed from a collection via context menus, and an "Add to collection" picker dialog is
  available for posts and series.
- **Amytis-native content creation**: the "New …" actions now scaffold content the Amytis
  way — placing the file in the correct bucket folder with the right extension and per-type
  frontmatter, mirroring the Amytis `new-*` scripts. Folder context menus offer layer-aware
  "New X" actions derived from the bucket folder rather than guessed from frontmatter.
- **Find & Replace**: `Cmd+F` opens find and `Cmd+H` opens find & replace through a
  mode-aware search bar; both are also reachable from the Edit menu.
- **Keyboard-shortcuts help**: an in-app shortcuts dialog (open with `?` or
  Help → Keyboard Shortcuts), driven by a single source of truth, alongside completed
  native-menu accelerators.
- **Series titles in Content mode**: series folders now display their title from `index.md`
  instead of the raw folder name.

### Changed
- Top-level content buckets (such as `posts/`) are now protected from rename and delete.
- Identifier inputs (slug, commit message, and WeChat fields) disable auto-capitalize and
  auto-correct so typed values are not silently mangled.
- WeChat HTML conversion was rebuilt as a pure-string pipeline backed by markdown-it.

### Fixed
- WeChat publish-update no longer sends stale content after an auto-save.
- Resolved the `Cmd+Shift+I` shortcut conflict and dropped a redundant `Cmd+E` binding.
- `Esc` now reliably closes the keyboard-shortcuts dialog, and its content no longer
  overlaps the scrollbar.
- New-content slug now falls back to `untitled` instead of producing an empty name.
- Single-`index` series and book folders stay collections instead of collapsing into posts.
- Git rename and copy entries now read the destination path correctly.
- WeChat security hardening: bounded network timeouts, token-leak prevention in error
  messages, a credentials-file TOCTOU fix, and symlink-escape protection when resolving the
  images directory.

### Internal
- Large architecture pass documented in `CONTEXT.md` and ADRs 0001–0010: a typed Tauri
  command seam (via ts-rs), a single unified workspace tree with pure sidebar projections,
  editor- and workspace-session coordinator hooks, an overlay-stack tagged union, a
  declarative editor command-dispatch table, and module splits of `App.tsx`,
  `PropertiesPanel`, and the Rust `lib.rs`.

## 0.13.0 - 2026-05-05

### Added
- **Dual-mode sidebar**: toggle between Content view (markdown files only, with content-type
  sorting) and Files view (full project tree including non-markdown files and dotfiles). Mode
  is persisted per workspace. The toggle is a segmented two-button control in the sidebar header.
- **File previewer**: selecting a non-markdown file in Files mode opens a read-only preview panel.
  Images are rendered inline; text files (source code, config, etc.) are shown in a scrollable
  code block. Supports a wide range of extensions.
- **Folder-backed post collapsing**: a directory containing only `index.md` or `index.mdx` is
  presented as a single post item in Content mode (with a small badge indicator), removing the
  visual noise of the redundant nested file. The actual file path is used in the status bar and
  rename dialog.
- **WeChat copy**: `File → Copy for WeChat` converts the active Markdown document to
  WeChat-compatible inline-styled HTML and copies it to the clipboard. Math blocks (LaTeX) are
  stripped with a warning toast since WeChat cannot render them.
- **WeChat publish**: `File → Save Draft to WeChat…` opens a dialog to save the active document
  as a draft to a WeChat Official Account. Credentials (AppID/AppSecret) are stored securely in
  the app config directory. Body images are uploaded to the WeChat CDN and the cover image is
  uploaded as a permanent material. Access tokens are cached in-memory with automatic refresh.
- **WeChat draft update**: when a document has a `wechatMediaId` in frontmatter, the publish
  dialog enters update mode and updates the existing WeChat draft instead of creating a new one;
  on success the media_id is written back so subsequent edits keep updating the same draft.
- **WeChat publish UX**: pre-publish warnings for math blocks, local image counter, missing-cover
  warning, image upload progress indicator, and a 54-char digest counter; author and digest
  pre-fill from frontmatter or `site.config.ts`. Optional `content_source_url`, allow-comments,
  and appreciation toggles surface in the dialog.
- **Cover image editor**: properties panel cover-image field now supports drag-and-drop, clipboard
  paste, and a file picker, with a thumbnail preview and broken-image fallback. Picking a file that
  already lives inside the workspace's static asset root references it directly as a root-relative
  path instead of duplicating it into the active file's `images/` directory.
- **Draft status in search**: full-text search results show a draft badge so the indicator is
  consistent across sidebar, file switcher, and search surfaces.
- **Auto-refresh on external file changes**: the workspace tree refreshes automatically when files
  are added, modified, or removed by other tools, with a localized toast summarizing the change.

### Changed
- Files mode tree is rooted at the actual project root (`workspace_root`), not the Amytis
  `content/` subtree, so `site.config.ts`, `src/`, and other top-level project files are visible.
- `read_file` now validates against `workspace_root` instead of `tree_root`, allowing non-markdown
  files outside `content/` to be read and previewed.
- Well-known build/tooling directories (`node_modules`, `dist`, `target`, `.next`, etc.) are
  filtered from Files mode to reduce noise.
- File switcher (`Cmd+P`) and `openFileByPath` now use an independent flat file index that is
  always complete, even when sidebar branches are lazy-loaded.
- Selecting a file in the switcher or search reveals it in the sidebar by force-expanding ancestor
  folders, even when those branches have not yet been loaded.
- WeChat credentials now persist to a file in the app config directory (chmod 600) instead of the
  OS Keychain, eliminating repeating macOS Keychain authorization prompts.
- WeChat `<pre><code>` blocks now preserve newlines via `<br>` tags since WeChat strips
  `white-space` from inline styles.
- Properties panel `draft` field can now be added via the metadata pill list and removed
  symmetrically with `featured` and `pinned`.

### Fixed
- Editor: `Tab` inserts spaces inside fenced code blocks instead of moving focus out.
- Editor: autocorrect, autocapitalize, and autocomplete disabled so filenames and code are not
  rewritten by macOS or browser heuristics.
- Editor: skip reload after own auto-save to preserve trailing whitespace and suppress false
  "workspace changed" warnings.
- WeChat: strip non-absolute `href` values and disallowed attributes (`data-*`, `aria-*`, `id`,
  `<input type="checkbox">`, `<label>`) from generated HTML to avoid WeChat error 45166.
- WeChat: resolve root-relative cover and body image paths against `assetRoot`; non-local image
  URLs (`asset:`, `data:`, `blob:`) are skipped non-fatally.
- Sidebar: localize the right-click context menu; "New from existing" no longer fails on Windows.

## 0.12.0 - 2026-04-30

### Added
- Internationalization (i18n): full English and Simplified Chinese (简体中文) support across all
  UI surfaces — editor, sidebar, dialogs, properties panel, status bar, Git flows, and the native
  menu. Language preference persists in `localStorage` and the native menu is seeded from the OS
  system locale on first launch.
- Image paste from clipboard: paste an image directly into the editor; it is saved to the active
  file's sibling `images/` directory and inserted as a relative-path Markdown image at the cursor.
- Image drag-and-drop into the editor from Finder or a browser; same save and insert behavior
  as clipboard paste. Failures surface via the toast system.

### Changed
- Image assets (drag-and-drop and file-picker) now save to the active file's sibling `images/`
  directory instead of a workspace-root `assets/` directory; falls back to
  `<workspace_root>/images/` when no file is active.

## 0.11.0 - 2026-04-28

### Added
- Open-file tab bar above the editor with drag-to-reorder, middle-click or close-button to close,
  per-workspace persistence, and active tab scroll-into-view; hidden in zen mode and only shown
  with two or more open tabs.
- Properties panel now appears for files with no frontmatter, showing an empty state with
  add-field prompts so frontmatter can be created from scratch.
- Schema-aware metadata insertion and typed custom metadata dialog for Amytis content types.
- New-from-existing post workflow: create a post pre-populated from an existing file's content,
  with dates and draft status reset.
- Post duplication from the sidebar context menu ("Make a Copy").
- Status bar path rename flow for quick in-place file renaming.

### Changed
- Sidebar filter replaced with an integrated pill-style search field: Search icon prefix, subtle
  tinted background, accent focus ring on `:focus-within`, and an X clear button.
  Autocorrect, autocapitalize, and spellcheck disabled so filenames are not rewritten by macOS.
- Folder-backed posts (a directory containing `index.md`) are now shown as a single content item
  in the sidebar rather than as a raw directory.
- Sidebar rename is now routed through the path rename dialog for consistency with the status bar
  flow.
- Sidebar folder headers no longer use uppercase styling.
- Selected file is now revealed in the sidebar by force-expanding all ancestor folders when
  navigating between files.
- Expanded folder state is lazy-loaded on restore so unloaded directories are fetched on demand.
- Metadata panel improvements: boolean fields rendered as checkboxes, removal controls added,
  frontmatter keys canonicalized, custom field values preserve their original type semantics.
- Draft control moved into the publishing metadata section of the properties panel.
- Close-file menu item respects the tab bar the same way Cmd+W does.
- Status bar file controls aligned with git action layout.

### Fixed
- File deletion confirmation now uses Tauri's native async dialog so the delete no longer runs
  before the user acknowledges the prompt (the browser `window.confirm` is non-blocking in
  Tauri's WKWebView).
- `handleDelete` reads the active path from `selectedPathRef` after the async confirm returns
  rather than using a potentially stale closure snapshot.
- Duplicate of folder-backed index posts now uses the correct entry filename.
- Windows path separators normalized to forward slashes in paths emitted to the frontend.
- Windows git actions no longer flash console windows in front of the app.
- Amytis `cdnBaseUrl` images now resolve correctly in the editor.

## 0.10.0 - 2026-04-21

### Added
- Keyboard-first workspace and file navigation with workspace switcher, file switcher, and
  full-text search.
- Markdown editing with frontmatter-aware properties, Typora-style rich editing, code blocks,
  tables, images, links, footnotes, and structural editing behavior.
- Amytis-oriented content workflows including content types, draft/publish handling, and
  writing-focused workspace behavior.
- Built-in Git workflow support for status, commit, branch switching, fetch, pull, push, and
  remote actions.
- In-app manual update checks and updater infrastructure for signed release bundles, stable
  `latest.json` publishing, and end-to-end Windows plus local macOS release operations.

### Changed
- Improved release and packaging workflows with Windows CI publishing, local macOS automation,
  bundled app branding, and clearer release operator documentation.
- Refined the desktop app presentation with the first Ovid app logo and regenerated packaged
  icon set.
- Continued stabilization and performance work across workspace opening, sidebar loading, search,
  editing, and save flows.

### Known Limits
- macOS public distribution is still limited by the missing Apple signing and notarization work.
- Some release and updater steps are still optimized for careful operator-driven publishing rather
  than fully automated public distribution.

## 0.10.0 - 2026-04-21

### Added
- Keyboard-first workspace and file navigation with workspace switcher, file switcher, and
  full-text search.
- Markdown editing with frontmatter-aware properties, Typora-style rich editing, code blocks,
  tables, images, links, footnotes, and structural editing behavior.
- Amytis-oriented content workflows including content types, draft/publish handling, and
  writing-focused workspace behavior.
- Built-in Git workflow support for status, commit, branch switching, fetch, pull, push, and
  remote actions.
- In-app manual update checks and updater infrastructure for signed release bundles, stable
  `latest.json` publishing, and end-to-end Windows plus local macOS release operations.

### Changed
- Improved release and packaging workflows with Windows CI publishing, local macOS automation,
  bundled app branding, and clearer release operator documentation.
- Refined the desktop app presentation with the first Ovid app logo and regenerated packaged
  icon set.
- Continued stabilization and performance work across workspace opening, sidebar loading, search,
  editing, and save flows.

### Known Limits
- macOS public distribution is still limited by the missing Apple signing and notarization work.
- Some release and updater steps are still optimized for careful operator-driven publishing rather
  than fully automated public distribution.

## 0.9.0 - 2026-04-13

### Added
- Keyboard-first workspace and file navigation with workspace switcher, file switcher, and
  full-text search.
- Markdown editing with frontmatter-aware properties, Typora-style rich editing, code blocks,
  tables, images, links, footnotes, and structural editing behavior.
- Amytis-oriented content workflows including content types, draft/publish handling, and
  writing-focused workspace behavior.
- Built-in Git workflow support for status, commit, branch switching, fetch, pull, push, and
  remote actions.

### Notes
- `0.9.0` established the first public preview scope for Ovid.
