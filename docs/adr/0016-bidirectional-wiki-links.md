# ADR 0016 — Bi-directional wiki links

**Status:** Accepted
**Date:** 2026-06

## Context

Amytis content has long carried an `aliases: []` field in note frontmatter
(see `noteFrontmatter` in `src/lib/amytisScaffold.ts`), signalling that the
content model anticipates name-based cross-linking — but Ovid had no editor
support for it. Users coming from Obsidian expected `[[Target]]` syntax to
"just work": typing the brackets should produce a styled link, clicking an
unresolved target should materialize a new note, and every note should show
which other files reference it.

This ADR records the decisions that locked the design once we chose to ship
the feature.

## Decisions

### 1. `[[Target]]` is a Tiptap node, not a decoration

We considered three implementation shapes:

| Shape | Round-trip | Atomic semantics | Code cost |
|---|---|---|---|
| Inline atom **node** | tiptap-markdown `addStorage` | clean (click/focus is a unit) | medium |
| Inline **mark** | requires custom mark serializer | bracket text stays editable mid-word | medium |
| Text + ProseMirror **decoration** (Footnotes-style) | trivial — it's just text | none — clicking lands on raw characters | low |

We picked the **node** approach because:

- Click and keyboard activation are clean: the whole `[[Target|Display]]`
  is a single inline atom, so `Enter`/click target one thing.
- Selection behaves: arrow keys step over the link as a unit, the way an
  image or footnote does.
- Visual rendering can diverge from on-disk text (the piped `Display` form
  shows just the display text without the brackets), which a decoration
  can't do without widget tricks that break editability.

The trade-off: round-trip is non-trivial. We solve it via tiptap-markdown's
`addStorage.markdown` seam (see ADR 0001 for the typed Tauri seam analogue):

- `markdown.serialize(state, node)` writes `[[target]]` or `[[target|display]]`.
- `markdown.parse.setup(md)` registers a markdown-it inline rule that
  consumes `[[…]]` at parse time and emits an `<a data-wiki-target=…>` HTML
  token that the node's `parseHTML` then claims.

The registration is idempotent (Symbol marker on the `MarkdownIt`
instance) because tiptap-markdown calls `setup` on every parse and shares
one `MarkdownIt` instance per editor.

### 2. Resolution is by frontmatter `title:` and `aliases:` only

For a given `[[Foo]]`, the resolver returns the first hit, in this order:

1. **`aliases:` match** (case-insensitive) — Amytis' canonical cross-naming field.
2. **`title:` match** (case-insensitive).
3. Otherwise: `notes/<slugify(target)>.md`, `exists: false`.

We deliberately do **not** match by filename slug. The rationale:

- Notes can be renamed (slugs change) without breaking inbound links.
- A title typo in the file's frontmatter is the right place to fix
  references, not the filename.
- The `aliases:` field is already first-class in the scaffold — we'd be
  duplicating it by adding implicit slug matching.

The scope is also restricted to the `notes/` bucket. Flows, posts, series,
books, and pages don't participate. This is conservative: Amytis cleanly
distinguishes ephemeral flows from durable notes, and wiki linking is a
durable-notes concept. Widening later is one line in `filterNotes`.

### 3. Auto-creation happens on first navigation, not on insert

The user's request was "type `[[Hello World]]` → auto-create
`hello-world.md`." Two interpretations:

- **On insert**: as soon as `[[Foo]]` parses, write the file.
- **On first click/Enter**: render `[[Foo]]` as *unresolved* and only
  materialize when the user navigates to it.

We picked **on first navigation** (matches Obsidian) because it avoids
littering `notes/` with typos: typing `[[Hello Wrold]]` and noticing the
typo before clicking should be free, not require deleting a stray file.

Materialization goes through the existing `buildNewContent("note", …)`
scaffold from `amytisScaffold.ts`, so the new note is structurally
identical to one created via the New Note dialog. We override `format:
"md"` (regardless of the workspace's MDX preference) — the user's request
literally said "hello-world.md", and `.md` is the simpler default for
notes that exist primarily as link targets.

### 4. `[[Target|Display]]` piped syntax is supported

The piped form lets the surface text differ from the link target. The
display text only affects rendering — resolution always uses the
`Target` half. We chose to support it because:

- It's cheap (one regex group), with the same round-trip plumbing.
- Without it, users can't naturally inline a note reference with a
  contextual surface label (e.g. `see [[Hello World|the intro]]`).

### 5. Backlinks render as a collapsible section inside the editor scroll

`BacklinksPanel.tsx` is placed inside the existing `editor-scroll`
container so it scrolls with the document — discoverable without a
separate panel toggle, but invisible when there are zero references so the
editor stays uncluttered.

The scanner (`findBacklinks` in `src/lib/backlinks.ts`) is a pure async
function: given `flatFiles`, an injected `readFile`, and the same
`NoteResolverIndex` the editor uses, it walks every workspace file looking
for `[[…]]` patterns that resolve to the current file. Frontmatter is
stripped before scanning so a YAML `title:` containing brackets doesn't
masquerade as a real reference. Self-references are excluded by passing
the current file as `excludeRelativePath`.

The panel re-scans whenever `flatFiles` or `resolverIndex` identity
changes (workspace open, file create/delete, tree refresh). Per-keystroke
invalidation is **not** wired — backlinks reflect on-disk state, and
unsaved edits in other files don't count yet. That's an explicit
limitation, not an oversight.

## Trade-offs

- **No filename-slug fallback** means hand-created note files without
  frontmatter `title:` won't be reachable by `[[filename]]`. Users get a
  fresh empty note instead. Documented as the cost of decision #2.
- **`.md` instead of contentPrefs format** means a single `notes/` bucket
  may contain `.md` (wiki-created) and `.mdx` (manually created) notes
  side by side. Acceptable: both render the same way in Ovid.
- **Backlinks re-scan walks the whole workspace** on every relevant
  change. Fine for typical Amytis workspaces (hundreds of files); we
  haven't profiled at the 10k+ scale.
- **Resolution staleness inside an open editor**: when a target note is
  created via the click path, the originating editor's wiki-link
  node-view still shows the *unresolved* style until the resolver index
  is rebuilt and the node-view re-renders (which happens on the next
  attribute change / re-render). Acceptable for MVP because the
  navigation immediately moves focus to the new note; the originating
  file refreshes on its own once revisited.

## Deferred (intentional follow-up work)

- **`[[`-triggered suggestion popover** — listing existing notes ranked
  by `score()`/`compareFiles()` (the same engine Cmd+P uses) is a UX
  enhancement that doesn't change the on-disk format. Tracked separately.
- **Heading anchors `[[Target#heading]]` and block IDs `^id`** — neither
  is in Amytis' content model today.
- **Image embeds `![[image.png]]`** — handled by regular markdown
  `![](path)` for now.
- **Link rewriting on rename** — renaming `notes/hello.md` to
  `notes/hi.md` does not currently rewrite `[[Hello]]` references in
  other files. The aliases-based resolution already insulates references
  from filename changes, so this is lower-priority than it sounds.

## Validation

- `src/lib/wikiLink.test.ts` covers the resolver priority table, CJK slug
  fallback, the empty/unmatched cases, and frontmatter-index construction.
- `src/lib/tiptap/WikiLink.test.ts` covers the input rule (typed `[[…]]`
  produces a `wikiLink` node, including the piped form and CJK targets),
  the markdown round-trip (load → node → markdown is stable), and the
  markdown-it rule registration (HTML escaping + idempotency).
- `src/lib/backlinks.test.ts` covers self-reference exclusion, alias
  resolution, multi-match-per-line collapse, frontmatter stripping, and
  unreadable-file handling.

The IME composition guard from ADR 0015 is what keeps the wiki-link
input rule from firing mid-CJK composition.
