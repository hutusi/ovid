# ADR 0011 — Configurable scaffolding format & layout

**Status:** Accepted
**Date:** 2026-05-29
**Implementing commits:** on `feat/preferences-dialog`
- `feat: make new-content format and layout configurable`

## Context

[ADR 0009](0009-amytis-native-content-scaffolding.md) made `buildNewContent`
mirror the Amytis `new-*` scripts exactly: posts and most content are `.mdx`,
posts/notes/pages/chapters are **flat files**, series/books are **folder-backed**
`index.mdx`. Those are sensible Amytis defaults, but some writers prefer:

- **`.md` over `.mdx`** — when they never use JSX/MDX components and want the
  plainest possible Markdown (and broadest tooling compatibility).
- **Folder-per-post** — co-locating a post with its images in
  `<slug>/index.md` + `images/`, the way series and books already work, instead
  of a single flat file plus a shared assets folder.

These are per-writer preferences, not workspace facts, so they belong in
Preferences (see the Preferences dialog), not in `site.config.ts`.

## Decision

Add two optional inputs to `ScaffoldInput`, threaded from the new
`useContentPreferences` hook through `useWorkspace.handleNewFile`:

- `format?: "md" | "mdx"` — the extension for the new file. **Defaults to
  `mdx`**, matching Amytis. Applies to every scaffolded kind **except**
  `generic`/`flow`, which stay plain `.md` by definition.
- `layout?: "file" | "folder"` — **defaults to `file`**. Applies only to the
  flat post-like kinds (`post`, `seriesPost`, `note`, `page`, `chapter`).
  `series`/`book` are inherently folder-based and are unaffected (though
  `format` still sets their `index` extension).

With `layout: "folder"`, a flat entry becomes `<dir>/<name>/index.<ext>` plus a
co-located `images/` dir (a shared `flatEntry` helper produces both shapes).
Posts keep their date prefix on the **folder**: `<basePath>/<date>-<slug>/index.<ext>`.

Because both inputs default to today's behavior, the change is invisible until a
user opts in — `buildNewContent` with no `format`/`layout` is byte-for-byte
identical to ADR 0009.

## Consequences

**Positive:**
- Writers who never use MDX get plain `.md`; writers who want asset co-location
  get folder-per-post — without editing `site.config.ts`.
- The defaults preserve strict Amytis parity, so existing workspaces and the
  ADR 0009 tests are unaffected.
- `flatEntry` removes the duplicated file-path/`dirsToCreate` logic that was
  repeated across the flat kinds.

**Negative / accepted:**
- This is a deliberate, opt-in **deviation** from "mirror the Amytis scripts
  exactly." A folder-based `.md` post is still valid Amytis content (Amytis reads
  both `index.md` and `index.mdx`), but it is not what `bun run new-post` would
  produce. Users who care about script parity leave the defaults alone.
- The preference is global, not per-bucket — all new flat content uses the same
  format/layout. Per-bucket overrides were judged unnecessary churn for now.

## Cross-references

- `src/lib/amytisScaffold.ts` (+ `.test.ts`) — `ScaffoldInput.format/layout`, `flatEntry`, `buildNewContent`.
- `src/lib/useContentPreferences.ts` — the persisted preference.
- `src/lib/useWorkspace.ts` — `handleNewFile` threads the prefs into `buildNewContent`.
- CONTEXT.md "Content types, scaffolding & collections".
