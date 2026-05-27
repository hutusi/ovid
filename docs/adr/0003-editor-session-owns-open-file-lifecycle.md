# ADR 0003 — `useEditorSession` owns the open-file lifecycle

**Status:** Accepted (retrospective)
**Date:** 2026-05
**Implementing commits:**
- `b8cb6d2` — refactor: useEditorSession owns the open-file lifecycle
- `ba389b2` — fix: address CodeRabbit findings on PR #82
- `231735b` (PR #82) — merge
- `d127415` (PR #83) — refactor: useSidebarExpansion hook owns the expansion state

## Context

"Which file is the user editing right now, and what is its history?" had no
single owner. Across `App.tsx` the flow was:

1. The sidebar fires `onSelect(node)`.
2. `App.tsx` calls `setSelectedFile(node)` (from `useFileEditor`).
3. `App.tsx` calls `pushRecent(node.path)` (from `useRecentFiles`).
4. `App.tsx` calls `openTab(node)` (from `useOpenTabs`).
5. On rename/delete, three independent stores had to be notified in lockstep
   from `useWorkspace`'s mutation handlers — and the order mattered.

The same three-step dance lived at every call site: switcher, search, recents,
tab click, auto-reopen. Drift was inevitable.

## Decision

Introduce `useEditorSession` as a **composite hook** that owns the
select+recent+tab invariant as a single concept.

```ts
const session = useEditorSession({
  fileEditor,        // from useFileEditor — passed in to break the cycle
                     // with useWorkspace
  workspaceRoot,
  workspaceRootPath,
  flatFiles,
});
```

It composes `useFileEditor` (passed in), `useOpenTabs`, and `useRecentFiles`,
and exposes:

- `openFile(node)` / `openByPath(path)` — select + push recent + open tab as
  one step.
- `closeActive` — close tab and advance to neighbour, or close editor entirely.
- `notifyPathRenamed(old, new, lookup?)` / `notifyPathRemoved(path)` — keep
  tabs + recents + selection in lockstep on filesystem mutations.

`useWorkspace` never reaches into editor state directly. It owns the tree and
file-mutation handlers; when a mutation lands it fires `onPathCreated` /
`onPathRenamed` / `onPathRemoved` callbacks for the session to react to. The
two hooks are coupled by *interface* (callback shape), not by *implementation*.

The pure helpers `selectionAfterRename` and `selectionShouldCloseAfterRemove`
were extracted alongside so the selection rules are unit-testable without
mounting React.

## Consequences

**Positive:**
- "Open a file" is one method call from every caller (switcher, search,
  sidebar, recents, auto-reopen, tab bar).
- File-rename and file-delete updates all three stores atomically; impossible
  to forget one.
- The selection invariants have unit-test coverage as pure functions.
- `App.tsx` no longer assembles the open-file dance; it just calls
  `session.openFile(node)`.

**Negative / accepted:**
- The cycle (`useWorkspace` needs session callbacks; `useEditorSession`
  composes `useFileEditor` which `useWorkspace` reaches into) is real and
  was initially worked around by a `sessionCallbacksRef` at the App.tsx top
  level. That workaround is itself folded into a `useWorkspaceSession`
  coordinator hook in ADR 0007.

## Related

- The same composed-hooks pattern is reused for `useSidebarExpansion` (`d127415`,
  PR #83), which owns the sidebar's expand/collapse state under the same
  rule: one concept, one owner, no parallel stores.
