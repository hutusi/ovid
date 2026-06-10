# ADR 0018 — Global action dispatch table

**Status:** Accepted
**Date:** 2026-06

## Context

Global actions (open workspace, save, mode toggles, git operations, WeChat
publish…) reach the app through two input adapters: keyboard shortcuts
(`useKeyboardShortcuts`) and native menu events (`useMenuActions`). Both
hooks wired the same ~15 actions independently — a keyboard `switch` and a
menu `switch` with separately-inlined guards (`overlay.isBlocking`,
workspace/git-repo conditions, input-focus suppression). Adding an action
meant editing both files and hoping the guard logic stayed in sync; it
demonstrably hadn't (several keyboard paths skipped the blocking check the
menu path applied).

ADR 0008 already solved this shape for *editor* commands with a declarative
command table dispatched from one place.

## Decision

Extend the pattern to global scope: `src/lib/appActions.ts` holds one
declarative table of `AppAction` rows —

```ts
interface AppAction {
  id: string;                  // == the native menu payload id
  allowWhenBlocking?: boolean; // reachable while a blocking overlay is open
  allowInInput?: boolean;      // keyboard: fire even with input focus
  when?: (ctx) => boolean;     // workspace/git/selection conditions
  run: (ctx) => void | Promise<void>;
}
```

- **Action ids are the native menu payload ids** (`menu.rs` emits them
  verbatim), so the menu adapter is a table lookup.
- **Keyboard keys stay in `shortcuts.ts`** — it remains the single source
  of truth the help dialog renders from. The keyboard adapter joins
  `"global"`-source shortcut entries to table rows **by id**.
- Both hooks shrink to thin adapters over `dispatchAppAction`, which owns
  the guard order (blocking → input-focus → `when`). App builds one
  memoised `AppActionCtx` and passes it to both.
- The keyboard adapter `preventDefault`s only when the action actually
  fires, so a suppressed shortcut doesn't swallow the key from the editor
  or a native accelerator.

**Bespoke boundary.** Two keyboard bindings stay hand-matched in
`useKeyboardShortcuts` because their matching isn't modifier-exact:
Escape-exits-zen (contextual, no shortcut entry) and `?` for the shortcuts
help (matched on the *produced* character so layouts where `?` is unshifted
work). Everything else — including the Cmd+Ctrl+Z zen chord — goes through
the generic `eventMatchesShortcut` matcher.

**Guard unification.** The table encodes one effective guard per action.
Where the two old paths disagreed, the stricter menu behavior won: e.g.
keyboard `Cmd+P` / `Cmd+N` / `Cmd+Shift+G` now respect `overlay.isBlocking`
like their menu twins always did. Mode toggles, save, close-file,
open-workspace and wechat-copy keep their allowed-while-blocking behavior
via `allowWhenBlocking`.

## Consequences

- Adding a shortcut+menu action is one table row (+ a `shortcuts.ts` entry
  for the key + a `menu.rs` item), with the guards declared, not inlined.
- `appActions.test.ts` asserts id uniqueness, bidirectional parity (every
  global shortcut id has a row; every row id is a known menu payload or
  explicitly keyboard-only), and the guard semantics — realizing the
  cross-check ADR 0008 suggested as future work.
- The menu payload vocabulary is mirrored in the test as a literal list;
  changing `menu.rs` payloads means updating that list (the test failure
  is the reminder).

## Cross-references

- ADR 0008 — editor command table (the precedent).
- ADR 0006 — overlay stack (`isBlocking` is the shared blocking guard).
- `src/lib/appActions.ts`, `src/lib/useKeyboardShortcuts.ts`,
  `src/lib/useMenuActions.ts`, `src/lib/appActions.test.ts`.
