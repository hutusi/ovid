# ADR 0009 — Amytis-native content scaffolding

**Status:** Accepted
**Date:** 2026-05-29
**Implementing commits:** on `feat/sidebar-content-mode-refinements`
- `feat: layer-aware "New X" in folder context menu`
- `fix: derive sidebar New action from bucket folder, not frontmatter type`
- `feat: expose posts.basePath from site.config in WorkspaceResult`
- `feat: create content the Amytis way (folder/ext/frontmatter per type)`

## Context

Ovid creates content for **Amytis** workspaces. Early versions guessed at how:
new files were written as `.md` with a `type:` frontmatter field, optionally
folder-backed, with a Title-cased slug — and the sidebar tried to infer a
folder's content type from the frontmatter `type:` of the files inside it.

Inspecting a real Amytis workspace (`create-amytis-test/my-garden`) showed every
one of those assumptions was wrong:

- Amytis derives a file's **content type from its folder** (`posts`, `series`,
  `books`, `flows`, `notes`). Regular content files carry **no `type:` field** at
  all — so frontmatter-based type inference always returned nothing.
- The canonical creation logic lives in `scripts/new-*.ts` + `templates/default.mdx`:
  posts are date-prefixed flat `.mdx` under `posts.basePath`; series/books are
  folder-backed `index.mdx` with an `images/` dir; notes are flat `.mdx`; flows
  are `flows/<Y>/<M>/<D>.md` with `tags: []`; each type has a specific frontmatter
  shape. The default extension is `.mdx` (flow `.md`).
- The posts folder is configurable via `posts.basePath` in `site.config.ts`.

## Decision

Make content creation **mirror the Amytis scripts**, and derive type from the
**bucket folder** rather than frontmatter.

### Type from the bucket folder

`getBucketContentType(folderName, postsBasePath)` (`src/lib/sidebarUtils.ts`)
maps a top-level `content/` folder to its content type (`posts`→post,
`series`→series, …; the posts folder follows `postsBasePath`). The sidebar
computes this at the bucket (depth 0) and **threads it down** the tree, so a
nested folder (e.g. an individual series) knows its bucket without re-deriving
it from frontmatter that doesn't exist. This replaced the earlier
`inferFolderContentType` (frontmatter-based), which could not work for Amytis.

### Scaffolding — `src/lib/amytisScaffold.ts`

`buildNewContent(input)` is a pure function that, given a `NewContentKind`
(`post`, `series`, `note`, `book`, `seriesPost`, `chapter`, `page`, `generic`)
plus the title, date, content root, and `postsBasePath`, returns
`{ dirsToCreate, filePath, content }` reproducing the matching `new-*` script:

- post → `<basePath>/<date>-<slug>.mdx` from `templates/default.mdx`
- series → `series/<slug>/index.mdx` + `images/`
- seriesPost → `series/<series>/<slug>.mdx` (no date prefix)
- note → `notes/<slug>.mdx`; book → `books/<slug>/index.mdx` + `images/`;
  chapter → flat `.mdx` inside the book; page → flat `.mdx` at the content root.

Nothing it writes carries a `type:` field. Posts (and series members) use the
workspace's own `templates/default.mdx` when present, with a built-in fallback.
`handleNewFile` (`useWorkspace.ts`) reads the template, calls `buildNewContent`,
`ensureDir`s the folders, writes the file, and opens it. Flows are date-based and
keep the dedicated today's-flow path.

### Config — `posts.basePath`

`parse_posts_base_path` (`src-tauri/src/content_types.rs`, mirroring the existing
`parse_cdn_base` / `parse_default_author` scanners) reads `posts.basePath` and
exposes it on `WorkspaceResult` as `postsBasePath`. Both the bucket map and the
scaffold honor it, so a renamed posts folder (e.g. `articles`) works.

### Surfaces

The layer-aware sidebar context menu and the native File→New menu both route
through `handleNewFile` via a `NewContentKind`, so the two surfaces cannot drift.

## Consequences

**Positive:**
- Files created in Ovid match what `bun run new-*` produces — same paths,
  extensions, date prefixes, and frontmatter. No spurious `type:` field.
- Type detection no longer depends on frontmatter Amytis doesn't write; it is
  driven by the folder, which is the actual Amytis source of truth.
- `buildNewContent`, `getBucketContentType`, and `parse_posts_base_path` are pure
  and unit-tested without React or a live workspace.

**Negative / accepted:**
- Bucket folder names (`posts`/`series`/`books`/`flows`/`notes`) are the Amytis
  defaults; only `posts.basePath` is config-driven. A workspace that renames
  other buckets would not be recognized (none are configurable in Amytis today).
- "New Book"/"New Chapter" are extrapolated — Amytis has no `new-book` script
  (books are imported), so their frontmatter is modeled on existing books.
- `useContentTypes` / `get_content_types` (which parsed an obsolete `contentTypes`
  block) have since been removed — modern Amytis declares its buckets in a
  `features:` block instead, parsed into `WorkspaceResult.features` for bucket
  visibility + localized labels.

## Cross-references

- `src/lib/amytisScaffold.ts` (+ `.test.ts`) — `buildNewContent`, per-type frontmatter.
- `src/lib/sidebarUtils.ts` — `getBucketContentType` (+ tests).
- `src/lib/useWorkspace.ts` — `handleNewFile` template read + scaffold.
- `src-tauri/src/content_types.rs` — `parse_posts_base_path`; `workspace/mod.rs` — `postsBasePath` on `WorkspaceResult`.
- CONTEXT.md "Content types, scaffolding & collections".
