# Changelog

All notable changes to Ovid will be documented in this file.

The format is based on Keep a Changelog, adapted to match the project's
release cadence and Conventional Commit history.

## Unreleased

### Changed
- **Consistent keyboard focus, selection and controls**: every button, link
  and option shows the copper focus ring when reached by keyboard (several
  showed the system-blue default or nothing), selected text in titles,
  inputs and dialogs uses the warm selection colour, and checkboxes and radio
  buttons follow the accent instead of system blue.
- **Destructive actions are red**: delete buttons and menu items used the
  amber warning colour; they now use the danger red, and deleting a branch
  confirms with a red button rather than the copper one.
- **Clearer notifications**: errors now stay on screen for several seconds
  (they used to vanish after two), carry a red mark, can be dismissed, and
  are announced to screen readers immediately; confirmations carry a green
  mark. Long messages wrap instead of running off the screen, hovering a
  notification holds it, and a message that repeats (a save that keeps
  failing) refreshes the one on screen instead of stacking copies.
  Removing a workspace from the recent list can be undone from the
  notification.
- **Deleting a file asks in the app's own dialog**: "Move to Trash?" now
  appears as an Ovid dialog in the current theme, with a red Move to Trash
  button and focus on Cancel, instead of a system alert box.
- **Git sync shows progress**: while a push, pull or fetch runs, the status
  bar shows a spinner and what is running instead of the sync button, and a
  second trigger (a double click, or the menu while the popover action runs)
  is ignored rather than starting a competing git operation.

### Fixed
- **Cmd+Q no longer drops the last edits**: the app menu's Quit item (and
  Cmd+Q) now flushes pending saves before exiting, exactly like closing the
  window. Previously it terminated the app immediately, losing up to a second
  of typing still held by the autosave debounce.
- **Replace All, image edits and code-block languages are saved**: document
  changes made while focus sat outside the editor body — Find & Replace,
  the image alt/src fields, the code-block language picker, task checkboxes —
  were never marked unsaved or written to disk. Whether a change is saved is
  now decided by the transaction itself, not by editor focus, and merely
  opening a document no longer risks an automatic rewrite.
- **Renaming the open file no longer reverts it**: renaming (or moving) the
  file you are editing reloaded the editor with the text from when the file
  was opened, and the next keystroke saved that stale text over everything
  written since. The editor now stays mounted across renames. The
  error-boundary Retry likewise restores the current text.
- **External reverts show up**: when a file was changed on disk back to
  exactly the text it was opened with (e.g. `git restore` after edits), the
  editor kept showing the edited version and the next save silently undid the
  revert. Every reload from disk now replaces the editor's content, and Undo
  can no longer bring back text from before a reload.
- **Edits can't leak into another file**: a keystroke serialized by the
  editor you were leaving (during a tab switch) could be saved into the file
  you switched to. Edits are now tied to the document they were made in, and
  an autosave that straddles a rename lands on the new path.
- **Property edits no longer wipe frontmatter**: editing any field in the
  properties panel rebuilt the whole frontmatter from what the panel could
  display, deleting nested fields (`seo:`, a collection's `items:`),
  numeric lists and empty keys, cutting datetimes down to a date (shown as the
  previous day for positive UTC offsets), and — when the YAML didn't parse —
  deleting every field. Edits now change only the edited key's lines; all
  other lines, comments included, are left exactly as written, and dates stay
  unquoted. Files whose frontmatter YAML is invalid are never rewritten.
  "New from existing" and collection add/remove keep nested fields and dates
  the same way.
- **Broken frontmatter is protected, and says so**: when a file's
  frontmatter YAML doesn't parse, the properties panel now explains the
  problem (with the parser's message) and is read-only, and the title field
  is hidden, instead of showing an empty panel whose first edit would have
  replaced every field.
- **Late property edits land on the right file**: a cover image upload (or a
  WeChat publish) that finished after you switched files wrote the original
  file's whole frontmatter into the newly opened one. Property edits are now
  bound to the file they were made on.
- **A file deleted or moved outside Ovid no longer traps you**: if the open
  file vanished while it had unsaved edits, every autosave failed with a
  generic error and switching files, closing it, and quitting were all
  refused until restart. Ovid now explains that the file is gone and offers to
  recreate it with your text, discard your changes and close it, or keep
  editing (autosave then waits for your decision).
- **No more doubled error toasts after a failed save**: when saving the open
  file failed before a rename, delete, duplicate, collection edit, workspace
  switch or Cmd+S, the operation now simply stops after the save error —
  instead of also raising a generic "something went wrong" toast.
- **An external change can't wipe what you just typed**: if a file changed on
  disk while you were typing, the automatic reload could replace text typed
  in the moment between noticing the change and reading the file. The reload
  now stands down whenever there are unsaved edits; saving them then raises
  the usual "changed on disk" prompt.
- **Windows-style files keep their format**: a file starting with a
  byte-order mark had its frontmatter shown as body text (and broken by the
  first edit), and editing a CRLF file left it with a CRLF frontmatter over an
  LF body. Saves now keep the file's BOM and line endings throughout.
- **Git can no longer hang Ovid**: git commands had no time limit, so a
  stalled fetch or push left its spinner (and background auto-fetch) stuck for
  the rest of the session. Local git commands now stop after a minute; network
  ones, and commits and branch switches (which run your git hooks), after ten;
  and a stalled HTTP transfer is abandoned after a minute without progress.
- **Clones can be cancelled**: the Workspace Manager shows a Cancel button
  while cloning; cancelling stops git and removes the partial folder.
  Previously a stuck clone also blocked opening any other workspace until
  restart.
- **Case-only renames work**: renaming `Notes.md` to `notes.md` on macOS (a
  case-insensitive filesystem) failed with "a file with that name already
  exists".
- **Saved git credentials are written more safely**: the credentials file is
  created private from the start (never briefly readable by others), with a
  unique temporary name, and flushed to disk before it replaces the old one.
- **Corrupt saved state can't break startup**: recent files, the last-session
  file, and editor font preferences read from local storage are now checked
  field by field; a malformed entry is ignored instead of crashing the app on
  every launch of that workspace (or reaching the editor's font settings).
- **One panel's crash no longer takes down the window**: the sidebar (and
  search panel), properties panel, status bar and dialogs each catch their
  own errors and show a small "ran into a problem — Reload panel" notice,
  leaving the editor and your text usable. Previously any of them replaced
  the whole app with a stack trace.
- **Body-heading warning follows the title**: the "this document already
  has a title" hint on a body H1 now appears and disappears as the title is
  set or cleared, instead of being fixed when the file was opened.
- **Readable primary buttons in dark mode**: white text on the copper button
  was below the WCAG AA contrast minimum in the dark theme; it now uses warm
  ink. Editor popovers (link previews, `[[` suggestions) no longer draw on top
  of open dialogs, and toasts stay readable above them.
- **WeChat copy uses the current text**, including edits autosaved since the
  file was opened.
- **Dialogs keep keyboard focus after a click inside them**: clicking a
  dialog's text or empty space dropped focus to the window behind it, so
  Escape stopped closing the dialog and Tab wandered into the sidebar. Focus
  now stays in the dialog, and Tab returns to its first control.
- **Browse the sidebar with the keyboard**: with a file row focused, the
  arrow keys move between rows, Right and Left expand and collapse folders
  (or step into and out of them), and Home and End jump to the ends; Down
  from the filter box enters the tree. The tree is one Tab stop, landing on
  the open file, so Tab moves past it instead of through every row, and the
  focused row shows a ring distinct from the hover and selection colours.
- **Cmd+0 jumps to the file tree**: from the editor or anywhere else, Cmd+0
  shows the sidebar if it is hidden and puts focus on the open file's row,
  ready for the arrow keys.
- **Sidebar file actions from the keyboard**: on a focused row, Shift+F10
  or the Menu key opens its context menu under the row, F2 renames (now on
  folders too), and Cmd+Backspace asks to move it to the Trash. Content
  buckets stay protected from rename and delete, as in the menu.
- **Start writing straight after creating a file**: after New (Cmd+N),
  Make a Copy, New from Existing or Today's Flow, the caret is already in
  the body, so you can type without clicking. A new post's "Write your
  content here..." placeholder is selected, so the first keystroke replaces
  it; anything else gets the caret at the end.
- **Popovers work from the keyboard**: the editor settings popover, the
  code-block language picker and the Workspace Manager's row menu now take
  focus when they open and hand it back when closed with Escape. Escape in
  a row menu closes just the menu, not the whole Workspace Manager, and the
  menu's items can be reached with the arrow keys, Home and End.
- **Typewriter mode respects Reduce Motion**: with the system's Reduce
  Motion setting on, typewriter mode keeps the current line centred by
  jumping instead of animating a scroll on every keystroke.

### Performance
- **Faster startup**: the editor's libraries (ProseMirror, Tiptap and code
  highlighting, about 750 KiB of JavaScript) were loaded and evaluated before
  the window first painted, even though the editor itself loads lazily.
  Startup now loads about 540 KiB instead of about 1,280 KiB (−58%); the
  editor libraries arrive with the editor. The build fails if they creep back
  into startup.
- **Restored sessions open sooner**: when Ovid reopens your last file, the
  editor now loads while the workspace is still opening rather than after,
  and its math renderer loads alongside it instead of first. The native menu
  bar is no longer rebuilt at startup when the language hasn't changed.
- **Autosave no longer triggers a workspace rescan**: the temporary file each
  atomic save stages next to the document looked like a new file to the
  watcher, so every autosave re-walked the workspace, reloaded the sidebar
  tree, re-read every note for wiki links and backlinks, and refreshed git
  twice. Ovid's own staging files are now ignored by the watcher and hidden
  from the sidebar (including any left behind by a crash).
- **Lighter saves**: Ovid recognises its own saves at the source, so an
  autosave no longer sends a file-change event back to the app. The git
  refresh after a save asks only for file status instead of re-reading
  branches and remotes (about one git process instead of ten), and the
  repository root is looked up once instead of per git command. A refresh
  that finds the file tree unchanged no longer rebuilds the sidebar, the
  file index or the wiki-link data.
- **Less work while typing**: the editor reconfigured its ProseMirror view
  (twice) every time the window re-rendered — after each autosave state
  change, word-count update or git refresh. It is now configured once, and
  re-renders only when what it shows changes.
- **Typing no longer re-renders the window**: the live word count and
  session progress were app-wide state, so every count update while typing
  (about three a second) re-rendered the sidebar, editor pane and dialogs.
  Only the status-bar readout updates now.
- **Wiki-link indexing waits for a quiet moment**: reading every note to
  resolve `[[links]]` now happens once the app is idle after opening a
  workspace (or after the file tree changes), instead of competing with the
  first file load; collection indexes are read in parallel.
- **Smoother typing in long documents**: footnote highlighting rescanned
  the entire document on every keystroke (quadratically in heavily formatted
  paragraphs); it now rescans only the paragraph being edited. Section
  folding and find-highlighting no longer rebuild on every cursor move, and
  fold chevrons are no longer re-created for every heading on each change.
- **Faster search, and a calmer results list**: searching no longer copies
  and re-lowercases every cached file for each query, and the results list
  shows the 100 best-matching files (with a note on how many more matched)
  instead of rendering thousands of rows for a common word. Opening a
  workspace walks its files on a background thread.
- **Pasting large images is quicker**: pasted, dropped and cover images are
  sent to the backend as raw bytes instead of a JSON list of numbers, which
  inflated a 5 MB screenshot to roughly 15–20 MB of text to build and parse.
- **A quieter sidebar**: the file tree re-rendered every row — re-walking
  each collapsed folder for its git dot — whenever anything in the window
  changed, including autosave status while typing and each step of a
  sidebar resize. Rows now re-render only when their own content changes.
- **File operations no longer block the window**: reading, saving, creating,
  renaming, duplicating and trashing files, and saving pasted or dropped
  images, now run off the UI thread. A save's fsync, a slow or network volume,
  or the Finder round-trip behind "Move to Trash" no longer freezes the app
  while it completes.

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
