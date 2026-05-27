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

`site.config.ts` (parsed in `src-tauri/src/content_types.rs`) optionally
contributes:
- **`defaultAuthor`** — pre-fills the WeChat publish dialog when frontmatter
  has no `author` field.
- **`cdnBase`** — image source rewrite for in-editor preview (a published image
  on `cdn.example.com/path.jpg` is shown via the CDN URL, not the local file).
- **Content types** — schema for new-file templates and frontmatter validation.

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

- **`forContentMode(tree, { workspaceRoot, treeRoot })`** — scope into
  `content/` (when Amytis), drop dotfiles + non-markdown, prune empty dirs,
  collapse `folder/index.md` into a single node, sort by content-type priority.
- **`forFilesMode(tree)`** — alpha-sort, directories first; renders everything
  the Rust walk surfaced.

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

> *Placeholder — will be filled in when ADR 0006 lands.*

Overlays are dialogs and popovers that occupy the foreground above the editor.
Today they are tracked as ~14 independent visibility booleans across `App.tsx`
and `useGitUiController`, with the "is anything blocking?" check duplicated in
`useKeyboardShortcuts` and `useMenuActions`. The Track A refactor (ADR 0006)
will collapse these into one tagged-union owned by `useOverlayStack`. This
section will describe the resulting model: kinds, blocking semantics (modal vs
popover), and the rule that only one overlay is active at a time.

---

## Cross-references

- Operational guidance for AI agents: `CLAUDE.md`, `AGENTS.md`
- Phase-by-phase product roadmap: `ROADMAP.md`
- Git surface in the app UI (not the project's branching workflow): `docs/git-workflow.md`
- Release process: `docs/release-checklist.md`, `docs/updater-release-runbook.md`
- Architectural decisions: `docs/adr/`
