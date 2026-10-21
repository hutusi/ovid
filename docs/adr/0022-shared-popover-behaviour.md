# ADR 0022 — Shared popover behaviour (`usePopover`)

**Status:** Accepted
**Date:** 2026-10

## Context

ADR 0004 settled *how* a popover renders — a conditionally rendered,
positioned `<div>` in the React tree, never a portal — and ADR 0017 gave
modal dialogs one primitive. Non-modal popovers got no equivalent. Three
(`FontSettings`, `CodeBlockView`'s language picker, the Workspace
Manager's per-row menu) each copied a `useEffect` registering a document
`pointerdown`/`mousedown` for click-outside and a document `keydown` for
Escape, and the copies had drifted in the same ways:

- **Escape leaked.** A document listener runs after React's root has
  dispatched the event, so the Workspace Manager row menu's Escape also
  reached the surrounding `<Modal>`'s handler and closed the whole dialog.
  The status-bar popover's Escape could also leave zen mode.
- **Focus never moved in.** WebKit does not focus a clicked `<button>`,
  so after opening a popover with the mouse, keyboard focus stayed in the
  editor; reaching the popover's controls meant tabbing through the page.
  Nothing returned focus on close either.
- **No menu keys.** The row menu is `role="menu"` but had no arrow-key
  model, unlike `BranchSwitcher`'s action menu.

## Decision

`src/lib/usePopover.ts` owns the behaviour. A popover passes `open`,
`onClose`, a `containerRef` wrapping trigger and panel, and a `panelRef`:

- **On open**, focus moves to the panel's first control (or
  `initialFocusRef`), remembering the element focused before.
- **Escape** is handled by a native listener on the container — below
  React's root and the document — which stops propagation and closes. A
  popover inside a dialog or the editor closes alone.
- **A press outside** the container (document `pointerdown`) closes and
  leaves focus where the press put it.
- **On close**, however it happened, focus that has nowhere to go
  returns to the remembered element. That covers Escape and a menu item
  or option that closes the panel: the focused control unmounts with the
  panel, and focus would otherwise drop to `<body>`, out of reach of the
  surrounding dialog's Escape and focus trap. Focus that the close moved
  somewhere (Tab, a press on another control) stays put.
- **Focus leaving** the container (Tab past the last control) closes it;
  a `focusout` with no `relatedTarget` (focus going nowhere) does not.
  `closeOnFocusOut: false` opts out — the code-block picker does, because
  it sits inside ProseMirror's DOM.
- **`menu: true`** adds Arrow Up/Down (wrapping), Home and End across the
  panel's `role="menuitem"` children, stopped at the container so a
  listbox around the menu does not also move.

Rendering stays with each component; the hook is behaviour only, so it
fits the plain-CSS rule and every panel's own positioning.

## Consequences

- New popovers call `usePopover` instead of hand-rolling listeners;
  CLAUDE.md / AGENTS.md "Custom popovers" points here.
- Escape in a nested popover is scoped by construction, the way ADR 0017
  scoped it for modals.
- `BranchSwitcher`'s action menu and `GitSyncPopover` keep their own
  handling for now; they can move onto the hook when next touched.
