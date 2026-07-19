# ADR 0004 — Plain-CSS modals, no Portal-rendering libraries

**Status:** Accepted
**Date:** 2026-02 to 2026-03
**Implementing commits:**
- `170e31f` — feat: add Tailwind CSS v4 + shadcn/ui and migrate overlay components (later reverted in spirit)
- `87e0a33` — fix: replace Radix portal components with plain CSS implementations
- `892aed4` — fix: rewrite NewFileDialog with plain CSS to fix broken layout
- `43ca134` — refactor: simplify CSS system and remove unused portal-based components

## Context

The app initially adopted Radix UI primitives (`Dialog`, `Popover`,
`DropdownMenu`) and shadcn/ui's component pattern, which is excellent for web
apps. In Tauri's WebView (WKWebView on macOS) this combination failed silently:

- Radix dialogs render via React `Portal` into `document.body`, outside the
  app's normal React tree.
- CSS custom properties (`var(--color-surface)`, etc.) defined in `:root`
  scoped under the app's CSS tree did not resolve correctly inside the
  portaled DOM in WKWebView. Tokens fell back to nothing or to defaults,
  producing unstyled or mis-styled dialogs.
- The class-variance-authority + portal pattern made the failure mode
  invisible to type-checking and tests; it only surfaced on a packaged build.

`NewFileDialog` was an early casualty (`892aed4` — "fix broken layout"),
which surfaced the systemic problem.

## Decision

**No portal-rendering UI libraries.** All dialogs and popovers are plain
React components rendered inside the app's React tree, styled with shared
CSS primitives in `src/components/Modal.css`.

Specifically:
- No `@radix-ui/*` packages. The entire family is removed and must not be
  reintroduced (CLAUDE.md UI Coding Rules enforces this).
- No shadcn/ui components. `class-variance-authority` is removed.
- Custom popovers use a conditionally-rendered positioned `<div>` with
  `useEffect` for click-outside and Escape handling (see `FontSettings.tsx`,
  `CodeBlockView.tsx`).
- Every **modal** `role="dialog"` (the shared `<Modal>` primitive, ADR 0017)
  attaches the `useFocusTrap` hook — initial focus, Tab/Shift+Tab containment,
  focus restoration — and sets `aria-modal`. **Non-modal** `role="dialog"`
  surfaces are a deliberate exception: the compact properties drawer
  (`PropertiesPanel` in drawer mode) and popovers like `FontSettings.tsx`
  keep the background interactive, so they omit `aria-modal` and do **not**
  trap focus. The drawer instead uses `useNonModalDialogFocus` (focus placed
  on the dialog on open, returned to its trigger on close; Tab may leave;
  Escape dismisses and yields to any nested `[aria-modal="true"]` dialog).
- `cmdk` is permitted for the file switcher because it doesn't use Portal
  and works correctly in Tauri's WebView.

## Consequences

**Positive:**
- Dialogs are styled identically in dev (Vite) and in packaged builds.
- Theme tokens flow through to every overlay because nothing escapes the
  React/CSS tree.
- The dialog primitive surface (`modal-overlay`, `modal-panel`, `modal-btn`,
  `modal-backdrop`) is small enough to read in one file.
- Removing class-variance-authority and Radix dropped substantial dependency
  weight.

**Negative / accepted:**
- Each dialog hand-writes its layout via `Modal.css` primitives. Acceptable
  because the surface is small (~13 dialogs in `AppDialogs.tsx`) and the
  alternative (a portal-aware library that works in WKWebView) does not exist
  in a maintained form.
- `useFocusTrap` is now load-bearing for accessibility. Any new modal must
  attach it; missing it is an a11y regression caught by review only.

## Cross-references

- CLAUDE.md "Dialogs and Popovers" section — enforces this rule at the
  coding-conventions level.
- `src/components/Modal.css` — the shared primitive surface.
- `src/lib/useFocusTrap.ts` — the focus-trap hook every dialog uses.
