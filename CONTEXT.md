# CONTEXT.md

This file captures the domain vocabulary and architectural seams that aren't
obvious from any single file. CLAUDE.md describes the codebase from the
outside-in (how to navigate it). CONTEXT.md describes the *concepts the code is
built around* — the words used in the recent ADRs in `docs/adr/`, the names you
will see threaded through hook signatures, and the boundary lines that keep the
app decoupled.

If you change one of these concepts (e.g. introduce a new path layer, change
what "open file" means), update this file in the same PR and consider whether
an ADR is warranted.

---

## Amytis workspace

Ovid edits markdown content on disk. The container for that content is a
**workspace**. There are two flavours:

- **Generic workspace** — any folder containing `.md` / `.mdx` files.
- **Amytis workspace** — identified by `site.config.ts` + a `content/` subtree.
  This is the deployment-target shape Ovid was built for; the Publisher
  features (frontmatter schemas, content-type templates, WeChat publishing)
  light up only here.

The two paths matter when reasoning about *where* files live:

- **`workspaceRootPath`** — the folder the user opened. Always the outermost
  scope. Path validation in Rust (`read_file`, `write_file`) is anchored here.
- **`workspaceRoot`** (a.k.a. *tree root*) — the folder the **sidebar** treats
  as the visible root. For an Amytis workspace in content mode this is
  `workspaceRootPath + "/content"`. For a generic workspace, or for files
  mode, this equals `workspaceRootPath`.
- **`assetRoot`** — where root-relative image paths (`/images/cover.jpg`)
  resolve to. For Amytis workspaces this is the project's `public/` dir; for
  generic workspaces it falls back to `workspaceRootPath`.
- **`coverImage` accepts a `text:` prefix** — `coverImage: text:Issue 1` is an
  Amytis convention that renders a gradient text card instead of loading an
  image. `parseCoverImage` (`src/lib/imageUtils.ts`) classifies the raw value
  into `{ empty | text | path }` so the editor banner and the properties-panel
  thumbnail render through one shared `TextCover` component, with palette
  derived from `slug.length % 7` to match Amytis's rendering exactly.

`site.config.ts` (parsed in `src-tauri/src/content_types.rs`) optionally
contributes:
- **`defaultAuthor`** — pre-fills the WeChat publish dialog when frontmatter
  has no `author` field.
- **`cdnBase`** — image source rewrite for in-editor preview (a published image
  on `cdn.example.com/path.jpg` is shown via the CDN URL, not the local file).
- **`postsBasePath`** — the posts bucket folder name (default `posts`), so both
  content creation and the sidebar follow a renamed posts folder.
- **`features`** — the per-bucket `enabled` flag + localized `name` map for
  `posts`/`series`/`books`/`flow`. Content mode **never hides** a bucket (the
  editor works on on-disk content regardless of what the site publishes); a
  bucket whose feature is `enabled: false` is shown but tagged `disabledForSite`
  so the sidebar dims it and adds a "hidden from site" badge. Buckets are
  labeled with their localized `name`; `notes` (absent from `features`) falls
  back to Ovid's own localized label.
- **`authors`** — the top-level `authors:` map (display name → bio/avatar/social),
  distinct from `posts.authors` defaults. Surfaced as an avatar/bio preview in
  the WeChat publish dialog.
- **`i18n`** — `locales` + `defaultLocale`, used to group `<slug>.<locale>`
  translation variants under their base file in the sidebar.

The scanners that read these are best-effort, comment-aware, and degrade to
empty/`None` on any parse failure, so a malformed or partial config never breaks
workspace open.

Ovid can also **create** Amytis workspaces, not only consume them. The
Workspace Manager (`src/components/WorkspaceSwitcher.tsx`) exposes two
seam-preserving paths in addition to "open folder":

- `create_amytis_workspace` (`src-tauri/src/workspace/scaffold.rs`) writes the
  smallest skeleton `is_amytis_workspace` recognises — `site.config.ts` +
  `content/posts/` + `README.md` — and runs the result through the same
  `build_workspace_result` wrapper as `open_workspace_at_path`.
- `clone_workspace` (`src-tauri/src/workspace/clone.rs`) shells out to
  `git clone --progress`, streams stderr line-by-line as a
  `workspace_clone_progress` event (`CloneProgress` payload — phase, percent,
  raw message), then runs the cloned dir through `build_workspace_result`.
  The cloned workspace is treated like any opened workspace; if it has no
  `site.config.ts` the standard `not_amytis_workspace` toast appears.

---

## Content types, scaffolding & collections

Amytis derives a file's **content type from its folder**, not from frontmatter —
the buckets directly under `content/` are `posts` (or `postsBasePath`), `series`,
`books`, `flows`, `notes`. Regular content files carry **no `type:` field**.
`getBucketContentType` (`sidebarUtils.ts`) maps a bucket folder name to its type;
the sidebar threads that type down so a nested folder knows its bucket.

**Scaffolding mirrors the Amytis `new-*` scripts.** `src/lib/amytisScaffold.ts`
(`buildNewContent`) reproduces what `bun run new-*` would create — folder layout,
`.mdx`/`.md` extension, the date prefix on posts, the per-type frontmatter, and
the `templates/default.mdx` body for posts. Nothing it writes carries a `type:`
field. The layer-aware sidebar menu and the native File menu both route through
it via a `NewContentKind` (`post`, `series`, `note`, `book`, `seriesPost`,
`chapter`, `page`, `generic`); flows are date-based (`flows/Y/M/D`) and created
via the today's-flow path.

Two scaffolding choices are **user-configurable** via `useContentPreferences`
(surfaced in Preferences → Content) and threaded into `buildNewContent` as
`format` (`md`/`mdx`) and `layout` (`file`/`folder`). Both default to the Amytis
behavior (`mdx`/flat file), so the defaults stay byte-for-byte identical to the
`new-*` scripts; `generic`/`flow` always stay plain `.md`, and `series`/`book`
stay folder-backed regardless of `layout`. See [ADR 0011](docs/adr/0011-configurable-scaffolding-format-layout.md).

An **entry folder** is a directory holding an `index.md(x)` — a series or book.
The sidebar labels it with the index's title, opens the index on click and
expands to its members; re-clicking the same row (while the index is already
the active file) collapses it. `forContentMode` deliberately does **not**
collapse series/book entries into single nodes (only folder-backed posts
collapse), so a series with just an `index` still renders as an expandable
collection.

A **collection** is a series whose `index.mdx` is typed `type: collection` and
references posts/series **elsewhere** via an `items:` list
(`{ post: slug }` / `{ series: slug, exclude?, label? }`). Ovid resolves those
items to navigable **link rows** and offers *Add post or series…* / *Remove from
collection* (editing `items:`) — see `src/lib/collection.ts`,
`src/lib/useCollectionLinks.ts`, and `AddToCollectionDialog`. Regular series keep
their member posts inside the folder.

---

## Wiki links

`[[Target]]` (and `[[Target|Display]]`) is an inline atom Tiptap node — the
`WikiLink` extension in `src/lib/tiptap/WikiLink.ts`. The on-disk text round-trips
through tiptap-markdown's `addStorage.markdown` seam: a markdown-it inline rule
turns `[[…]]` into a `<a data-wiki-target=…>` HTML token on load, and the
node-storage serializer writes it back verbatim on save.

**Resolution is notes-only and uses frontmatter alone.** `resolveWikiTarget` in
`src/lib/wikiLink.ts` reads a `NoteResolverIndex` built once per workspace tree
refresh: it walks every file in `notes/`, parses frontmatter, and indexes
`title:` and `aliases:` (the alias field is what the note scaffold already
generates). Lookup is alias-first, then title, case-insensitive; no filename
slug fallback. Unresolved targets get a fallback path of `notes/<slug>.md` but
the file isn't created until the user navigates to the link — clicking
(or pressing Enter on) an unresolved wiki link calls `buildNewContent("note", …,
{ format: "md" })` to materialize it, then opens it via the standard
`openByPath`.

**Backlinks** live in `src/lib/backlinks.ts` — a pure async scanner that, given
the `flatFiles` list, the same `NoteResolverIndex`, and an injected `readFile`,
returns every file with a `[[…]]` reference resolving to the target. Frontmatter
is stripped first (so a `title: "[[Foo]]"` value can't masquerade as a
reference) and self-references are excluded. `BacklinksPanel.tsx` renders the
results as a collapsible "Linked references" section inside the editor scroll
container — invisible when empty.

See [ADR 0016](docs/adr/0016-bidirectional-wiki-links.md) for the design
rationale (node vs. decoration, lazy creation, notes-only scope, deferred
follow-ups).

---

## File lifecycle vocabulary

Five layers, each owning one piece of the "user opens a file and edits it"
flow. They were untangled in the `useEditorSession` refactor (see ADR 0003).

| Layer | Type | Owns | Lives in |
|---|---|---|---|
| **Path** | `string` | The on-disk address. Authoritative. | Filesystem |
| **Node** | `FileNode` | Tree projection of a path: name, kind, children, optional git status. | `useWorkspace.tree` |
| **Tab** | `string` (path) | "User asked to keep this file accessible." Capped at 8 per workspace. | `useOpenTabs` |
| **Recent** | `string` (path) | "User opened this recently." MRU, capped at 10 per workspace. | `useRecentFiles` |
| **Session** | `{ selectedFile, tabs, recents }` | The composite. "What is the user editing right now, and how did they get here?" | `useEditorSession` |

The session is the seam every other piece of UI talks to:

- `openFile(node)` — select + push recent + open tab as one step.
- `openByPath(path)` — same, but resolve node first; used by switcher / search /
  recents / auto-reopen so the path-to-node hydration is centralized.
- `notifyPathRenamed(old, new, lookup?)` / `notifyPathRemoved(path)` — keep
  tabs + recents + selection in lockstep on filesystem mutations.

`useWorkspace` never reaches into editor state directly. It owns the **tree
and the file-mutation handlers**; when a mutation lands, it fires
`onPathCreated` / `onPathRenamed` / `onPathRemoved` callbacks for the session
to react to. That callback flow is what `useWorkspaceSession` (ADR 0007)
encapsulates so `App.tsx` doesn't have to wire it manually.

---

## The typed Tauri seam

Every Rust command is reached through a typed wrapper in `src/lib/commands/`.
The frontend never imports `invoke` directly. The contract:

- **One namespace per domain.** `commands.git.commit({...})`,
  `commands.files.read({...})`, etc. — defined in `src/lib/commands/<domain>.ts`.
- **`invokeCmd<T>` normalises errors.** Tauri rejects with raw strings; the
  wrapper rethrows as `Error` so call sites can rely on `err.message`. See
  `src/lib/commands/internal.ts` and `invokeCmd.test.ts`.
- **`listenEvent` hides the async-race in `listen()`.** Returns a synchronous
  teardown suitable for `useEffect` cleanup.
- **Argument types are hand-typed in TS (camelCase).** Mirror the Rust fn
  signature; Tauri auto-converts snake_case Rust params to camelCase JS.
  Drift between Rust args and TS args fails at runtime (Tauri rejects unknown
  fields) — that's why argument shapes are deliberately ad-hoc per command.
- **Return types are generated.** Rust structs that cross the IPC seam derive
  `ts_rs::TS` with `#[ts(export, export_to = "../../src/lib/commands/generated/")]`.
  The generated dir is checked in; `bun run validate` fails CI when it drifts.

When adding a Tauri command: derive `TS` on the return, hand-type the args
interface in the wrapper, run `cargo test` to regenerate the TS types,
verify the generated diff is what you expected.

ADR 0001 captures the design rationale (why typed seam, why hand-typed args).

---

## Sidebar projections

The sidebar has two modes — **Content** (markdown-only, Amytis-aware) and
**Files** (everything, alpha-sorted). Both render from the **same canonical
tree** (`useWorkspace.tree`) via pure selectors in `src/lib/sidebarUtils.ts`:

- **`forContentMode(tree, { workspaceRoot, treeRoot, postsBasePath, features, locales, defaultLocale })`**
  — scope into `content/` (when Amytis), drop dotfiles + non-content files
  (markdown `.md`/`.mdx` **and `.rst`** are kept; `.rst` opens read-only — see
  `isReadOnlyContent`), prune empty dirs, collapse `folder/index.md` into a
  single node, sort by content-type priority. When `features` is supplied, a
  disabled bucket is **tagged `disabledForSite`** (shown + marked, never hidden);
  when `locales` is supplied, `<slug>.<locale>` files are **grouped under their
  base file** (`node.translations`, each tagged with `node.locale`). Series/book
  **entry folders are kept as directories** (not collapsed) so they render as
  expandable collections even with only an `index`. `features`/`locales` are
  passed only for the **sidebar** projection, not the `flatFiles` (Cmd+P) one, so
  every bucket and translation stays openable by path.
- **`forFilesMode(tree)`** — alpha-sort, directories first; renders everything
  the Rust walk surfaced.

The content-mode rows are layer-aware (see *Content types, scaffolding &
collections* above): top-level buckets are protected from rename/delete and
offer *New &lt;Type&gt;*; an entry folder shows its title + members; a collection
shows its `items:` as link rows with add/remove. `findCollectionEntries` and
`isCollectionEntry` (sidebarUtils) drive collection detection.

Row icons in content mode also reflect type: file rows pass `node.contentType`
through `ContentTypeIcon` (post → FileText, series → ListOrdered, book →
BookOpen, flow → ArrowLeftRight, note → StickyNote, page → LayoutTemplate),
and top-level **bucket folders** reuse the same mapping so each bucket is
recognisable at a glance. Entry folders (a series's own folder) and every
Files-mode folder keep the generic Folder/FolderOpen glyph so the
expand/collapse signal stays intact on the rows where it matters.

Noise-dir filtering (`.git`, `node_modules`, `target`, `dist`, `.next`, etc.)
lives in `walk_tree` (Rust, `src-tauri/src/workspace/tree.rs`) so the projection
selectors don't have to know about build outputs. The full tree from `walk_tree`
is the single source of truth — sidebar mode swaps are pure re-projection,
not a re-walk. ADR 0002 has the history.

`flatFiles` is a third projection (markdown-only, flattened) used by `Cmd+P`
and `openByPath`. It always sees the full set of openable files regardless of
sidebar mode.

---

## Overlay model

Overlays are dialogs and popovers that occupy the foreground above the editor.
One source of truth: `useOverlayStack` (`src/lib/useOverlayStack.ts`) owns a
tagged-union state where the rule "only one overlay can be active at a time"
is enforced by the type, not by convention. See [ADR 0006](docs/adr/0006-overlay-stack-tagged-union.md)
for the rationale.

The `Overlay` kinds:

| Kind | Owner of the *payload* | Blocking? |
|---|---|---|
| `modal` | App.tsx (via Sidebar/StatusBar handlers) | yes |
| `switcher` | — | yes |
| `workspaceSwitcher` | — | yes |
| `search` | — | yes |
| `update` | — | yes |
| `wechatPublish` | — | yes |
| `shortcutsHelp` | — | yes |
| `preferences` | — | yes |
| `commit` | `useGitUiController` | yes |
| `branchSwitcher` | `useGitUiController` | yes |
| `newBranch` | — | yes |
| `renameBranch` | `useGitUiController` | yes |
| `deleteBranch` | `useGitUiController` | yes |
| `gitSyncPopover` | — | **no** (transient, status-bar anchored) |

`isBlocking` returns true for everything except `gitSyncPopover`. Adding a new
kind defaults to blocking unless explicitly added to `NON_BLOCKING_KINDS`.

**Separation of visibility from payload.** The overlay stack owns visibility.
Hooks like `useGitUiController` still own the *data* a dialog needs (commit
changes, branch lists) — they just call `overlay.open({ kind, state })`
instead of storing a separate `isOpen` boolean.

**Consumers.**

- `AppDialogs` renders by switching on `overlay.active?.kind` or
  `overlay.is(kind)`.
- `useKeyboardShortcuts` and `useMenuActions` both take `overlay` and use
  `overlay.isBlocking` for the "should this shortcut fire?" guard. The
  duplicated 11-flag conjunction they each used to do is gone.

**Preferences.** The `preferences` overlay renders `PreferencesDialog` — a
tabbed (General / Appearance / Editor / Language / Content) view that is a thin
shell over existing per-domain hooks. It does *not* own persistence: it reads
and writes through the same `useTheme`, `useEditorPreferences`, `i18n`, and
`useWordCountGoal` instances App already holds, so the dialog and the quick
controls (StatusBar theme/language toggles, `FontSettings` popover) stay in
lockstep. The two genuinely new preferences have their own hooks —
`useAppPreferences` (`restoreLastSession`, gating the launch auto-reopen) and
`useContentPreferences` (new-content `format`/`layout`, threaded through
`useWorkspaceSession` into `buildNewContent`). Opened via `Cmd+,`, the native
"Settings…" app-menu item, or the StatusBar gear.

---

## Cross-references

- Operational guidance for AI agents: `CLAUDE.md`, `AGENTS.md`
- Phase-by-phase product roadmap: `ROADMAP.md`
- Git surface in the app UI (not the project's branching workflow): `docs/git-workflow.md`
- Release process: `docs/release-checklist.md`, `docs/updater-release-runbook.md`
- Architectural decisions: `docs/adr/`
