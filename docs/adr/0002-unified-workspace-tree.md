# ADR 0002 — Unified workspace tree behind one canonical Rust walk

**Status:** Accepted (retrospective)
**Date:** 2026-05
**Implementing commits:**
- `2176a5d` — refactor: unify workspace tree behind one canonical Rust walk
- `54ddbe0` (PR #80) — merge

## Context

The sidebar has two modes — **Content** (markdown only, Amytis-aware,
collapsed `folder/index.md`, content-type sorted) and **Files** (everything,
alpha-sorted). Historically each mode was served by its own Rust walk:

- `list_workspace` walked from `tree_root` and returned the content-mode tree.
- `list_workspace_children` did a shallow lazy-load for the files-mode tree.

The two walks could (and did) diverge:

- Noise-dir filtering was applied differently between them.
- File metadata (git status overlay, frontmatter cache hits) had to be
  refreshed in two places after every mutation.
- The frontend kept two parallel tree shapes (`tree` and `filesTree`) that
  could go out of sync when one was reloaded but the other wasn't.
- `flatFiles` (for `Cmd+P`) was a third shape derived from neither walk
  reliably — sometimes from the in-memory content tree (missing files when
  the user was in Files mode and the content walk hadn't run yet).

## Decision

**One canonical Rust walk, two TS-side projections.**

- **Rust side:** `walk_tree` (private helper in
  `src-tauri/src/workspace/tree.rs`) does a recursive walk from
  `workspace_root` and returns every file and every directory, dotfiles
  included. Noise dirs (`.git`, `node_modules`, `target`, `dist`, `build`,
  `.next`, `vendor`, `.cache`, `__pycache__`, `.venv`, `out`, `.turbo`,
  `.vercel`, `.parcel-cache`, etc.) are filtered at this layer so callers don't
  have to.
- **Tauri command:** `list_workspace_tree` re-walks and returns the full
  `FileNode[]`. Replaces the old `list_workspace` + `list_workspace_children`
  split.
- **TS-side projections** in `src/lib/sidebarUtils.ts`:
  - `forContentMode(tree, { workspaceRoot, treeRoot })` — scope to `content/`,
    drop dotfiles + non-markdown, prune empty dirs, collapse index nodes, sort.
  - `forFilesMode(tree)` — alpha sort, dirs first.
- **`flatFiles`** is a third pure projection (`flattenTree` in
  `src/lib/fileSearch.ts`), markdown-only, used by the file switcher and
  `openByPath`.

`useWorkspace` owns the canonical tree. The sidebar projects it through
whichever mode is active. Mode swaps are pure re-renders — no re-walk.

## Consequences

**Positive:**
- One source of truth on disk → one source of truth in memory → multiple
  projections at render time. Mutations refresh both views simultaneously.
- Sidebar mode swap is instant (no Rust round-trip).
- `Cmd+P` always sees the full set of openable files regardless of sidebar
  mode (was previously a footgun).
- Noise-dir filtering lives in one place. Adding a new noise dir is one Rust
  edit.

**Negative / accepted:**
- The initial walk is recursive and not lazy. Acceptable because (a) the noise
  filter keeps the tree bounded and (b) the previous lazy-load complexity was
  itself a major source of incidental bugs (e.g. PR #62/63 "reveal selected
  file in a lazy tree"). Phase 10 of the roadmap will revisit if large
  workspaces show measurable open-time regression.

## Alternatives considered

- **Keep the two walks, fix the sync bugs case by case.** Rejected — every
  bug fix added complexity to the sync logic without removing the underlying
  duplication.
- **Lazy-load everything, with smarter cache invalidation.** Rejected for
  the reason above; lazy loading was the *source* of several bugs the
  unification deleted.
