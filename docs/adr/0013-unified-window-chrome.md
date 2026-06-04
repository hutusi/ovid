# ADR 0013 — Unified window chrome as a 36 px top strip, fully draggable

**Status:** Accepted
**Date:** 2026-06
**Implementing commits:**
- `10241ff` — refactor(theme): extract topbar height and macOS gutter to tokens
- `deacae8` — feat(sidebar): match editor top-bar height, move workspace name below
- `fc11711` — fix(titlebar): make editor top-bar a window drag region
- `b542529` — feat(properties): match top-bar height and unify drag region
- `0298ec1` — fix(titlebar): always render editor top-bar so the top strip never has a drag gap
- `4c7b28f` — fix(tauri): grant `core:window:allow-start-dragging` so drag regions work
- `6dc1086` — fix(titlebar): switch top-strip drag regions to deep mode

## Context

The Tauri window uses `titleBarStyle: "Overlay"` + `hiddenTitle: true` —
there is no native title bar; the app owns the entire top of the window.
Before this branch, three independent UI segments lived along that top row
with mismatched geometry and inconsistent drag behaviour:

- **Sidebar header** — 44 px tall (82 px on macOS with the traffic-light
  padding hack), held workspace name + mode switcher + open + collapse,
  carried `data-tauri-drag-region` (so some clicks could move the window).
- **Editor top bar** — 36 px tall, held the optional expand-sidebar /
  expand-properties buttons and the `TabBar`, **not** a drag region. The
  middle of the window's top edge could not move the window. The bar was
  conditionally hidden when no tabs and both panels visible, opening a
  drag gap even after a drag region was added.
- **Properties panel header** — ~50 px, "METADATA"/"FRONTMATTER" kicker +
  close button, also not a drag region.

Two debug round-trips during implementation surfaced two non-obvious Tauri
gotchas that future contributors should not have to rediscover:

1. Tauri 2's default `core:window:default` permission set (28 permissions)
   does **not** include `allow-start-dragging`. Without that capability,
   `data-tauri-drag-region` is wired up but inert — the JS handler fires,
   calls `window.startDragging()`, and the IPC call is silently rejected.
2. As of Tauri 2.11 (see `tauri/src/window/scripts/drag.js`), the bare
   `data-tauri-drag-region` attribute is **self-only**: drag fires only on
   a *direct* click on the attributed element. A child element does not
   inherit drag from its ancestor unless the ancestor uses
   `data-tauri-drag-region="deep"`. This is stricter than older releases.

## Decision

**The window's top edge is one continuous 36 px chrome strip composed of
three segments — sidebar header, editor top bar, properties header — and
the entire strip is a single Tauri drag region.**

Concretely:

- A shared `--topbar-height: 36px` token (in `:root` in
  `src/styles/global.css`) is the single source of truth for the
  strip's height. All three segments consume it. A
  `--mac-traffic-light-gutter: 78px` token sits alongside for the macOS
  Overlay clearance pattern.
- All three segments share the same divider treatment:
  `box-shadow: inset 0 -1px 0 var(--color-border)`. No `border-bottom`,
  so the inset reads continuously across the seams.
- All three segments use **`data-tauri-drag-region="deep"`**, so a click
  anywhere in the segment (or any non-clickable descendant) starts the
  drag. The `tauri/.../drag.js` walker automatically blocks at
  intrinsically clickable elements (`<button>`, `<a>`, `<input>`,
  contenteditable, etc.), so buttons inside the strip keep working
  without further annotation.
- Subtrees that need their **own** mouse semantics — specifically the
  `.tab-bar-item` wrapper, which is `draggable` for HTML5 tab reorder —
  must explicitly opt out with **`data-tauri-drag-region="false"`**.
  Tauri's mousedown handler runs before the browser's `dragstart` and
  calls `preventDefault` + `stopImmediatePropagation` when it matches a
  drag region; without the explicit `"false"`, grabbing a tab would
  drag the window instead of reordering the tab.
- The capability file `src-tauri/capabilities/default.json` explicitly
  grants `core:window:allow-start-dragging`. Without it, none of the
  above does anything.
- The editor top bar is **always rendered** (the previous "render only
  when there are tabs or one panel is collapsed" optimisation was
  dropped). Hiding it would create a drag gap in the middle of the top
  edge. Zen mode still hides it via the existing
  `.app[data-zen] .editor-top-bar { display: none }` CSS rule.
- Content that previously lived *inside* the title bar (workspace name in
  the sidebar; "METADATA"/"FRONTMATTER" kicker/title in the properties
  panel) was moved into a dedicated row immediately beneath the 36 px
  strip — `.sidebar-workspace-name-row` and `.prop-title-row`. The strip
  itself carries only buttons. The two collapse buttons sit on the
  panel-interior edge of their respective panels (sidebar collapse on
  the right, properties close on the left), so the "collapse-to-edge"
  gesture is symmetric on both sides of the window.

## Consequences

**Positive:**
- Window dragging works from any pixel of the top edge, in every layout
  state (sidebar visible/collapsed, properties open/closed, tabs / no
  tabs).
- The three segments visually align: same Y, same height, same divider.
- One token (`--topbar-height`) governs the strip; a future redesign
  touches one declaration, not three CSS files.
- The macOS Overlay traffic-light layout works without per-segment
  padding hacks. The sidebar header used to need `padding-top: 38px` on
  macOS to clear the lights; right-aligning the actions makes that
  unnecessary.
- HTML5 tab-reorder drag is preserved by the targeted `"false"` opt-out
  rather than a structural change.

**Negative / accepted:**
- The editor top bar consumes 36 px in the previously-empty state (no
  tabs, both panels visible). This is the cost of "no drag gap in the
  middle of the top edge". Acceptable: the empty state is brief and
  visual consistency outweighs the reclaimed pixels.
- Tauri 2.11's `"deep"` semantics are load-bearing. If a future
  Tauri version changes attribute semantics again, every top-strip
  element will need to be revisited. The walker rules are inlined into
  the test in this ADR's `Cross-references` to make the dependency
  explicit.
- Any future drag region added to the app will need the same
  combination: the `"deep"` attribute, awareness that clickable
  children block drag automatically, the capability already in place,
  and `"false"` on any HTML5-draggable subtree.

## Cross-references

- **CLAUDE.md "UI Coding Rules" → "Window chrome / drag regions"** —
  encodes the rule at the coding-conventions level.
- **`src-tauri/capabilities/default.json`** — owns the
  `core:window:allow-start-dragging` grant.
- **`src/styles/global.css`** (`:root`) — owns `--topbar-height` and
  `--mac-traffic-light-gutter`.
- **`src/components/Sidebar.tsx`**, **`src/components/EditorPane.tsx`**,
  **`src/components/PropertiesPanel.tsx`** — the three segments. Each
  uses `data-tauri-drag-region="deep"`.
- **`src/components/TabBar.tsx`** — `.tab-bar-item` carries
  `data-tauri-drag-region="false"` to preserve HTML5 tab reorder.
- **Tauri 2.11 `drag.js`** — the walker in
  `~/.cargo/registry/src/index.crates.io-…/tauri-2.11.2/src/window/scripts/drag.js`
  defines the `"deep"` / bare / `"false"` semantics used here.
