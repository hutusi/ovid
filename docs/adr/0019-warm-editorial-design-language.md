# ADR 0019 — Warm editorial design language

**Status:** Accepted
**Date:** 2026-06

## Context

Ovid's original visual scheme was a competent but generic cool neutral-gray
palette (surface `#fafafa`, ink `#18181b`) with an indigo accent (`#6366f1`),
flat surfaces, and pure-black shadows. It worked, but it read as a default
component-library look rather than a purpose-built writing tool. The product is
a Typora-style, typography-first editor (Georgia serif, generous measure) whose
whole reason to exist is calm, focused, *bookish* writing — and the chrome
didn't reinforce that.

We wanted a refresh that feels **modern, elegant, and high-textured** without
breaking the load-bearing UI constraints: tokens live only in `global.css`
([ADR 0005](0005-tailwind-first-design-tokens.md)), no portals / plain-CSS
dialogs ([ADR 0004](0004-plain-css-modals-no-portal.md),
[ADR 0017](0017-shared-modal-primitive.md)), and the unified 36px window-chrome
drag strip ([ADR 0013](0013-unified-window-chrome.md)).

## Decision

Adopt a **"warm editorial paper"** design language.

- **Palette.** Replace the cool grays with a warm ivory/sand light theme and a
  warm-charcoal dark theme; warm ink instead of near-black. The accent becomes
  **copper** — a contrast-tuned `#A8612C` (light) / `#D08A4E` (dark). The light
  value is chosen to clear WCAG AA (~4.5:1) on the ivory surface *and* as white
  text on a copper button, so a single accent token is legible everywhere it is
  used (UI fills, icons, active states, prose links, wiki-links). The syntax
  palette is re-harmonised to warm tones with one cool counter-tone (`attr`) so
  code stays legible rather than muddy. Shadows are re-tinted umber; radii are
  gently softened.

- **Texture.** A faint **paper grain** — an inline SVG `feTurbulence` fractal
  noise baked into the `--texture-grain` token (no asset, no dependency) — is
  layered on the writing canvas *behind* the text via a pseudo-element, and
  composited per theme (`multiply` on ivory, `screen` on charcoal). It never
  sits over inputs, so legibility is untouched. Panels (sidebar, properties,
  status bar, editor top bar, modal) gain a top inset highlight
  (`--panel-highlight`) so they read as layered sheets rather than flat fills.

- **Affordances.** The active tab gets a copper top-accent indicator; the
  selected sidebar file shows a copper margin marker pinned to the panel's left
  edge (pure CSS `::before`, no markup change). Display headings get tighter
  optical tracking; the prose canvas uses old-style numerals and hanging
  punctuation (both supported in Tauri's WebKit WebView).

All new design values are tokens in `global.css` — `--texture-grain*`,
`--panel-highlight`, and the warm shadow/radius scales sit alongside the
existing `@theme` colours and `:root` constants, so the whole app recolours
through the cascade and ADR 0005 still holds.

## Consequences

- The entire app reskins from the token layer; component CSS only adds the
  texture overlay, panel highlights, and the two new affordances.
- The single contrast-tuned copper means no separate "link vs UI" accent token
  is needed, keeping the token surface small.
- The paper grain relies on `mix-blend-mode` + an SVG data-URI; both render in
  WebKit, so they must be sanity-checked in a packaged `tauri build` (not just
  dev) per the ADR 0013 "looks fine in dev, broken when packaged" caution.
- `TextCover`'s named gradient presets are *content* (cover-design choices the
  user picks), not chrome, and are intentionally left on their own palette.
