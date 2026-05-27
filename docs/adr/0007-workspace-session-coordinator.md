# ADR 0007 — Workspace-session coordinator hook

**Status:** Accepted
**Date:** 2026-05-27
**Implementing commits:** Track C on `refactor/simplify-overlay-session-commands`
- `refactor: extract useWorkspaceSession coordinator hook`
- `refactor: App.tsx consumes useWorkspaceSession`

## Context

The `useEditorSession` refactor ([ADR 0003](0003-editor-session-owns-open-file-lifecycle.md))
gave the open-file lifecycle a single owner but exposed a cycle at the
App.tsx top level:

- `useWorkspace` owns the tree and the file-mutation handlers
  (`handleNewFile`, `handleRename`, `handleDelete`). It needs to fire
  `onPathCreated` / `onPathRenamed` / `onPathRemoved` callbacks when a
  mutation lands, *during the same synchronous tick* (so the editor
  session can update tabs/recents/selection coherently).
- `useEditorSession` is constructed *after* `useWorkspace` returns — it
  consumes `flatFiles` / `workspaceRoot` from the workspace.
- Therefore the workspace's callback functions cannot reference the
  session directly: at the moment `useWorkspace` runs, the session
  doesn't exist yet.

The previous fix lived at the App.tsx top level: a `sessionCallbacksRef`
initialised with no-op stubs and reassigned every render after
`useEditorSession` returned. The comment block above it explained the
mechanism. It worked, but it put the cycle on display at the App.tsx
top level — the noisiest, most-edited file in the codebase — and made
future contributors more likely to grow the workaround instead of
hiding it.

## Decision

Encapsulate the cycle inside one coordinator hook: `useWorkspaceSession`
(`src/lib/useWorkspaceSession.ts`).

```ts
export function useWorkspaceSession({
  showToast, flushPendingSave, resetFileState, fileEditor,
}: UseWorkspaceSessionOptions) {
  const sessionRef = useRef<ReturnType<typeof useEditorSession> | null>(null);

  const workspace = useWorkspace({
    showToast, flushPendingSave, resetFileState,
    onPathCreated: (node) =>
      sessionRef.current?.openFile(node) ?? Promise.resolve(),
    onPathRenamed: (oldPath, newPath, lookup) =>
      sessionRef.current?.notifyPathRenamed(oldPath, newPath, lookup),
    onPathRemoved: (path) =>
      sessionRef.current?.notifyPathRemoved(path) ?? Promise.resolve(),
  });

  const session = useEditorSession({
    fileEditor,
    workspaceRoot: workspace.workspaceRoot,
    workspaceRootPath: workspace.workspaceRootPath,
    flatFiles: workspace.flatFiles,
  });

  sessionRef.current = session;
  return { ...workspace, ...session };
}
```

The ref **stays** — it's the right shape for a synchronous-mutation
callback bridge between two hooks that must run in order. What changes
is the *location*: the ref now lives inside one hook as a local
implementation detail, instead of being a top-level App concern.

This mirrors how `useEditorSession` already encapsulates the
`useFileEditor` + `useOpenTabs` + `useRecentFiles` triad. The shape is
consistent: one composite hook, one merged return value, the inter-hook
plumbing kept private.

## Consequences

**Positive:**
- `App.tsx` drops ~40 lines: the 14-line `sessionCallbacksRef` block,
  the 5-line callback reassignment, the explicit `useWorkspace(...)` +
  `useEditorSession(...)` destructuring. One call replaces both.
- The cycle is no longer the loudest thing on the page when reading
  App.tsx. New contributors see one hook, not two-and-a-bridge.
- If a third hook ever needs to participate in the cycle, it joins
  inside `useWorkspaceSession` instead of inflating the App-level
  workaround.

**Negative / accepted:**
- The full integration behavior (create → opens file, rename →
  propagates to tabs/recents/selection, delete-active → closes editor,
  delete-other → no-op) is exercised end-to-end through manual smoke
  testing and through the existing pure-helper tests
  (`selectionAfterRename`, `selectionShouldCloseAfterRemove`). A React
  test renderer is not set up in this project, and adding one just for
  this hook would be a heavier change than the refactor itself.
  Accepted because the new hook is a literal extraction of working
  code — no new logic is introduced.

## Alternatives considered

- **Event-emitter inside `useWorkspace`.** Replaces the ref with a
  subscribe API. Adds subscribe lifecycle (effects, cleanup races)
  where today the path is synchronous. Rejected — the current shape
  is correct; only its location was wrong.
- **Emit `lastMutation` as state on `useWorkspace`; let
  `useEditorSession` react via `useEffect`.** Creates a derived-state
  hazard: mutations would replay on remount, and the "fire-once"
  semantics that filesystem mutations rely on would need ad-hoc
  guarding. Rejected.

## Cross-references

- `src/lib/useWorkspaceSession.ts` — the coordinator.
- `src/lib/useWorkspaceSession.test.ts` — module-surface checks
  (helper re-exports remain reachable from `useEditorSession`).
- [ADR 0003](0003-editor-session-owns-open-file-lifecycle.md) — the
  prior refactor that created this cycle.
- `CONTEXT.md` "File lifecycle vocabulary" — describes the layers the
  session integrates.
