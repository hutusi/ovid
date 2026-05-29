# ADR 0010 — Collections rendered as link views

**Status:** Accepted
**Date:** 2026-05-29
**Implementing commits:** on `feat/sidebar-content-mode-refinements`
- `feat: add collection items model + isCollectionEntry helper`
- `feat: collection-links hook + add/remove workspace handlers`
- `feat: render collection items as sidebar links with add/remove menus`
- `feat: Add-to-collection picker dialog for posts and series`

## Context

In Amytis, a **collection** is a series whose `index.mdx` has `type: collection`
and an `items:` list referencing posts/series that live **elsewhere** (not inside
the folder):

```yaml
type: collection
items:
  - post: asynchronous-javascript     # → content/posts/<date>-asynchronous-javascript.mdx
  - series: nextjs-deep-dive          # → content/series/nextjs-deep-dive/index.mdx
```

(`getCollectionPosts` in Amytis `src/lib/markdown.ts`; item schema is `{post}` or
`{series, exclude?, label?}`.) A collection's folder typically contains only its
`index.mdx`. ADR 0009 made series/book entry folders render as expandable
directories — but a collection expanded showed *nothing* (no in-folder members)
and its menu offered "New Post", which is wrong: a collection's members are edited
through the `items:` list, not created inside the folder.

## Decision

Treat a collection as a **link view over its `items:` list**, with in-place editing
of that list.

### Detection

`isCollectionEntry(node)` (`sidebarUtils.ts`) — the directory's `index` child is
typed `collection` (the one Amytis content type that *is* an explicit `type:`
field). `findCollectionEntries(tree, contentRoot)` walks the content subtree for
them.

### Model — `src/lib/collection.ts` (pure)

- `parseCollectionItems(raw)` — load the index file's `items:` (array of objects,
  beyond the scalar `ParsedFrontmatter` type, so loaded via `js-yaml` directly).
- `resolveCollectionItems(items, flatFiles, …)` → `CollectionLink[]` — match a
  `{post}` slug against files under the posts bucket (date-prefix aware via
  `postSlugOf`) and a `{series}` slug against the series' index; unresolved items
  keep `node: undefined`.
- `collectionCandidates(...)` — posts + series available to add (minus existing
  and the collection itself), for the Add picker.
- `addItem` / `removeItem` / `itemKey`, and `setCollectionItems(raw, items)` which
  writes `items:` back, preserving the file's other frontmatter and body.

### Hook + handlers

`useCollectionLinks` (App-composed) reads each collection's `items:` and resolves
them to a `Map<collectionDirPath, CollectionLink[]>`. Reads are keyed on the *set*
of collection paths (not tree identity) so the 2 s revision poll doesn't re-read
every tick; `reload()` runs after an edit. `addCollectionItem` /
`removeCollectionItem` (`useWorkspace.ts`) flush, read-modify-write the index, and
refresh.

### Sidebar

A collection entry keeps the entry-folder header (title + click-opens-index) but
expands to `CollectionLinkRow`s instead of in-folder children: clicking a resolved
link opens the target; an unresolved one is greyed with a "Missing: <slug>"
tooltip. The collection's menu offers **Add post or series…** (opens
`AddToCollectionDialog`, a cmdk picker, gated to `{post}` and `{series}`); each
link's menu offers **Open** and **Remove from collection**.

## Consequences

**Positive:**
- A collection now shows what it actually references and lets you curate it
  without hand-editing YAML.
- The model and resolution are pure and unit-tested; the dialog has a shallow
  markup test.
- Reuses existing seams: `onSelect(node)` to open links, the overlay/modal stack
  for the picker, the typed file commands for read/write.

**Negative / accepted:**
- Editing `items:` re-serialises the index's frontmatter (drops comments) — the
  same trade-off the properties panel already makes (see ADR 0004 era behavior).
- The link list refreshes after add/remove and when the set of collections
  changes, but not for out-of-band edits (e.g. editing `items:` directly in the
  editor) until the collection set changes or the app re-opens.
- A `{series}` item renders as a single link to the series index (not flattened
  into the series' posts as the published site does) — it maps 1:1 to the
  removable item.

## Cross-references

- `src/lib/collection.ts` (+ `.test.ts`) — items model, resolution, candidates, write-back.
- `src/lib/useCollectionLinks.ts`; `sidebarUtils.findCollectionEntries` / `isCollectionEntry`.
- `src/components/Sidebar.tsx` (`CollectionLinkRow`); `src/components/AddToCollectionDialog.tsx` (+ `.test.tsx`).
- `src/lib/useWorkspace.ts` — `addCollectionItem` / `removeCollectionItem`.
- CONTEXT.md "Content types, scaffolding & collections".
