# ADR 0017 — Shared Modal primitive

**Status:** Accepted
**Date:** 2026-06

## Context

Eighteen dialog components each copy-pasted the same ~15-line shell:
`modal-overlay` + backdrop button + a focus-trapped, ARIA-labelled panel
with a dialog-level Escape handler, plus a near-identical Cancel/Confirm
footer. The CSS was already shared (`Modal.css`, ADR 0004), but the
*behavioral* invariants from CLAUDE.md's "Dialogs and Popovers" rules —
`useFocusTrap` on every `role="dialog"`, Escape handled at the dialog
level with `stopPropagation`, `aria-modal` / `aria-label` always present —
were re-implemented per dialog and enforced only by review. The drift was
real: `NewFileDialog` shipped without a focus trap at all, `CommitDialog`'s
Escape didn't stop propagation, and `NewFileDialog.css` was a wholesale
duplicate of `Modal.css` under `nfd-*` names.

## Decision

One `<Modal>` component (`src/components/Modal.tsx`) owns the shell:
overlay/backdrop/panel structure, `useFocusTrap`, dialog ARIA, Escape
(with `stopPropagation` so a closing dialog can't also exit zen mode),
and backdrop-click close. Dialogs render their content as **children** —
not named slots — so tabbed/sidebar layouts (Preferences, BranchSwitcher,
WorkspaceSwitcher) fit without a second API. A separate `<ModalActions>`
helper covers the standard Cancel/Confirm footer (with `extraLeft` for
e.g. LinkDialog's "Remove link").

Knobs kept deliberately small:

- `width` — fixed panel width, viewport-bounded.
- `panelClassName` — appended to `modal-panel` (e.g. `gitcred-panel`).
- `bare` — replaces `modal-panel` entirely, for palette-style dialogs
  that bring their own panel class (`fs-panel`).
- `placement: "top"` — `modal-overlay--top` for switcher-style dialogs.
- `onKeyDown` — runs **before** the Escape handler; Enter-submit and list
  navigation stay in the dialog (including the `e.target === inputRef`
  double-fire guard). A child may `preventDefault()` to intercept Escape.

Still no portals (ADR 0004 holds): the Modal renders inline in the React
tree, same DOM as the hand-rolled shells it replaces.

## Consequences

- The CLAUDE.md dialog rules become enforced-by-construction; a fix to
  focus/Escape behavior is one edit, not eighteen.
- `NewFileDialog` gained the missing focus trap; `CommitDialog`'s Escape
  now stops propagation like every other dialog (both strict upgrades).
- `NewFileDialog.css` (duplicate of `Modal.css`) is deleted; the dialog
  uses the shared `modal-*` classes.
- A genuinely bespoke overlay can still opt out by not using `<Modal>`,
  but the default path is the primitive — new dialogs should start there.
- The invariants above (`useFocusTrap`, `aria-modal`, dialog-level Escape
  with `stopPropagation`) describe the **modal** primitive. The compact
  properties drawer (`PropertiesPanel` in drawer mode) is a documented
  **non-modal** `role="dialog"` exception outside `<Modal>`: it keeps the
  background interactive, so it omits `aria-modal` and trades the focus trap
  for non-trapping focus management (`useNonModalDialogFocus`) with an Escape
  handler that yields to any nested modal. See ADR 0004.
