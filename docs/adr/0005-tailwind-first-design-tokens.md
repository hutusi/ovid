# ADR 0005 — Tailwind-first design tokens

**Status:** Accepted
**Date:** 2026-03
**Implementing commits:**
- `b727d1b` — refactor: migrate to Tailwind-first semantic design tokens
- `78c2d47` — refactor: consolidate styling to Tailwind, remove dead CSS
- `9cffab0` — fix: gate H1 warning on non-empty title; use design token for warning color

## Context

The first cut of the design system mixed three sources of truth for tokens:

1. CSS custom properties in `:root { --color-surface: …; }` blocks.
2. shadcn/ui's `@theme inline` bridge layer (translating shadcn token names
   to CSS vars).
3. Tailwind's default theme (gray-500, slate-100, etc.) used directly in
   `className` strings.

The three could (and did) disagree. Dark mode overrides had to be written
twice (once for the CSS vars, once for the Tailwind classes that referenced
hard-coded colors). Adding a new color meant deciding *which layer* it
belonged to — a decision that was wrong about half the time.

When portal-based components were removed (ADR 0004), the shadcn bridge layer
became dead weight: the tokens it translated were no longer needed by any
consumer, but the bridge itself was still wired up.

## Decision

**One source of truth: the Tailwind `@theme` block in `src/styles/global.css`.**

```css
@theme {
  --color-surface: #ffffff;
  --color-fg: #0f172a;
  --color-fg-muted: #475569;
  /* … */
}

[data-theme="dark"] {
  --color-surface: #0f172a;
  /* … */
}
```

This single declaration generates **both** the CSS custom property
(`var(--color-surface)`) **and** the matching Tailwind utility class
(`bg-surface`). Consumers pick whichever fits their context:

- **CSS files:** `color: var(--color-fg-muted);` — used by component-scoped
  CSS where Tailwind classes would be awkward.
- **TSX className strings:** `className="text-fg-muted"` — used by every
  layout/spacing decision and most colors.
- **Inline styles:** prohibited for colors and typography (CLAUDE.md UI
  Coding Rules).

Dark mode is a single CSS selector override (`[data-theme="dark"] { ... }`)
that updates the variable values; both CSS-var consumers and Tailwind-utility
consumers respect it because they resolve to the same variable. The `dark:`
Tailwind variant is wired to `[data-theme="dark"]` via `@custom-variant` for
the cases where utility-level override is cleaner.

Non-theme constants (font sizes, layout dimensions, shadows) live in `:root`
in `global.css`, separate from the `@theme` block.

## Consequences

**Positive:**
- One place to add or change a color. No bridge layer to keep in sync.
- Dark mode is a single CSS selector edit, not a sweep through component
  files.
- The decision "CSS var or utility class?" becomes mechanical: utility class
  unless you're inside a `.css` file.
- Removed the shadcn bridge layer and its translation step from the build.

**Negative / accepted:**
- Tailwind's default palette is no longer the source of truth. Engineers used
  to writing `bg-gray-100` must learn the semantic token names. Mitigated by
  Biome lint rules that flag `bg-gray-*` etc.
- `@theme` is a Tailwind v4 feature; if Tailwind ever removes it, the
  migration cost is non-trivial. Accepted because v4's `@theme` is stable
  and the alternative (re-introducing a bridge layer) is worse.

## Cross-references

- CLAUDE.md "Styling" section — enforces token usage rules.
- `src/styles/global.css` — the canonical token declarations.
- `src/theme.ts` — static theme constants consumed alongside `useTheme`.
