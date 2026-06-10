# ADR 0006 — Overlay stack as a tagged union

**Status:** Accepted
**Date:** 2026-05-27
**Implementing commits:** Track A on `refactor/simplify-overlay-session-commands`
- `refactor: introduce useOverlayStack tagged-union hook`
- `refactor: migrate App.tsx and AppDialogs to overlay stack`
- `refactor: useGitUiController delegates dialog visibility to overlay stack`
- `refactor: collapse hasBlockingOverlay duplication in shortcut hooks`

## Context

Overlay visibility was tracked as twelve independent `useState` booleans
spread across two locations:

- `App.tsx` owned six: `modal`, `switcherOpen`, `workspaceSwitcherOpen`,
  `searchOpen`, `updateDialogOpen`, `wechatPublishDialogOpen`.
- `useGitUiController` owned six: `commitDialog`, `branchSwitcher`,
  `newBranchDialogOpen`, `renameBranchDialog`, `deleteBranchDialog`,
  `gitSyncPopoverOpen`.

Three concrete problems followed:

1. **Convention-enforced single-active rule.** Nothing prevented two
   overlays from being open at once — only call-site discipline. A
   misordered "open X before closing Y" pair would silently render both.
2. **Duplicated blocking check.** `useKeyboardShortcuts:76-87` and
   `useMenuActions:144-154` each manually conjoined eleven flags to
   answer "is anything blocking shortcuts?". The two sites could (and
   over time would) drift.
3. **Prop-routing explosion.** All twelve flags + their setters flowed
   through `App.tsx` as individual props to `useKeyboardShortcuts`,
   `useMenuActions`, and `AppDialogs`. `AppDialogs` alone accepted
   approximately fifty props.

## Decision

Introduce `useOverlayStack` (`src/lib/useOverlayStack.ts`) — a single
hook owning a tagged-union state where the rule "only one overlay can
be active at a time" is enforced by the type, not by convention.

```ts
export type Overlay =
  | { kind: "modal"; state: NonNullable<ModalState> }
  | { kind: "switcher" }
  | { kind: "workspaceSwitcher" }
  | { kind: "search" }
  | { kind: "update" }
  | { kind: "wechatPublish" }
  | { kind: "commit"; state: NonNullable<CommitDialogState> }
  | { kind: "branchSwitcher"; state: NonNullable<BranchSwitcherState> }
  | { kind: "newBranch" }
  | { kind: "renameBranch"; state: NonNullable<RenameBranchDialogState> }
  | { kind: "deleteBranch"; state: NonNullable<DeleteBranchDialogState> }
  | { kind: "gitSyncPopover" };

export interface OverlayStack {
  active: Overlay | null;
  is: (kind: OverlayKind) => boolean;
  open: (overlay: Overlay) => void;
  close: (kind?: OverlayKind) => void;
  isBlocking: boolean;
}
```

**Blocking semantics.** `isBlocking` is true for every kind except
`gitSyncPopover`, which is a transient popover anchored to the status
bar and intentionally lets shortcuts and menu actions continue to fire.
The blocking-vs-popover distinction is encoded in a single
`NON_BLOCKING_KINDS` set in `useOverlayStack.ts` rather than re-derived
per call site.

**State location.** `useGitUiController` retains ownership of dialog
*data* (commit changes, branch lists, target branch names — the things
that need fetching or shaping). The overlay stack owns dialog
*visibility*. The controller constructs the payload and calls
`overlay.open({ kind: "commit", state: { ... } })`; it never holds a
separate `setCommitDialog` useState.

**Consumers read directly.** `useKeyboardShortcuts` and `useMenuActions`
each take `overlay: OverlayStack` and call `overlay.isBlocking`,
`overlay.open(...)`, `overlay.close(...)`. `AppDialogs` accepts the
overlay and renders by switching on `overlay.active?.kind` /
`overlay.is(kind)`.

## Consequences

**Positive:**
- Two overlays cannot be co-active. The type forbids it; no convention
  is needed.
- One definition of "blocking" lives in `isOverlayBlocking`. Adding a
  new overlay kind defaults to blocking unless explicitly opted out.
- `AppDialogs` prop count drops from ~50 to ~25; the dialog-specific
  visibility flags and setters all disappear.
- `App.tsx` drops six `useState` declarations, six derived-boolean
  reads, and six setter shims that existed only to bridge call sites
  to the overlay during the migration.
- `useGitUiController`'s `setCommitDialog`/`setBranchSwitcher`/etc.
  setters were kept as thin overlay-open/close adapters for back-compat
  during the migration, to be deleted once their last call site moved
  to `overlay.open` / `overlay.close` directly. (That has since
  happened — see the Amendment below.)

**Negative / accepted:**
- Adding a new overlay kind requires four edits: the `Overlay` union,
  optionally the `NON_BLOCKING_KINDS` set, the consumer (`AppDialogs`
  switch arm), and the opener (a hook or App.tsx). The previous
  approach was one `useState` + one prop chain — superficially simpler,
  but at the cost of the problems above. Accepted because the typed
  union catches missing-arm errors at compile time, which the boolean
  fan-out did not.
- The `commit`, `branchSwitcher`, `renameBranch`, `deleteBranch`
  variants carry a payload. Migrating to a non-null payload (via
  `NonNullable<...State>`) means the previous "the state value is the
  visibility" idiom no longer holds. Call sites use `overlay.is(kind)`
  for visibility and `overlay.active?.kind === kind ? overlay.active.state : null`
  for the payload — explicit, but two lines instead of one.

## Cross-references

- `src/lib/useOverlayStack.ts` — the hook + `isOverlayBlocking` pure fn.
- `src/lib/useOverlayStack.test.ts` — covers blocking semantics.
- `CONTEXT.md` "Overlay model" section — the in-CODEBASE summary.

## Amendment (2026-06)

The back-compat setter shims (`setCommitDialog`, `setBranchSwitcher`,
`setNewBranchDialogOpen`, `setRenameBranchDialog`, `setDeleteBranchDialog`,
`setGitSyncPopoverOpen`) have been removed. Every call site now uses
`overlay.open` / `overlay.close` directly; `AppDialogs` derives the git
dialog payloads from `overlay.active` itself instead of receiving them as
props. The status-bar sync-popover toggle is exposed as an intent-named
`toggleGitSyncPopover` on `useGitUiController` rather than a boolean setter.
The migration this ADR described is complete.
