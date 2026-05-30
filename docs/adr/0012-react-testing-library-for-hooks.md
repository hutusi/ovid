# ADR 0012 — React Testing Library for hook tests

**Status:** Accepted, supersedes the testing-strategy note in [ADR 0007](0007-workspace-session-coordinator.md) §Negative/accepted.
**Date:** 2026-05-31
**Implementing commits:** on `feat/ts-hook-coverage`

## Context

The coverage reporting added in PR #94 and the Rust seam tests added in PR #96
exposed the next gap: load-bearing TypeScript hooks are nearly untested.
Post-#96 line coverage:

- `useWorkspace.ts` — **3.6%** (12 / 336 lines). Owns the canonical
  workspace tree per [ADR 0002](0002-unified-workspace-tree.md).
- `useEditorSession.ts` — **15.3%** (21 / 137 lines). Owns the open-file
  lifecycle per [ADR 0003](0003-editor-session-owns-open-file-lifecycle.md).

The existing pattern for hook tests, established in [ADR 0007](0007-workspace-session-coordinator.md)
§Negative/accepted, is to **extract pure helpers and test those**, leaving the
hook's orchestration to manual smoke-testing. That decision was correct in the
0007 scope (`useWorkspaceSession` is a literal extraction of working code, no
new logic). It does **not** generalise:

- Most uncovered hook surface is *dispatch* logic — a sequence of `commands.*`
  calls plus a state update plus a callback fire. Extracting these as pure
  functions either (a) loses the test value entirely (the dispatch sequencing
  is the bug-prone part), or (b) requires inventing planner/reducer
  abstractions that don't exist in the production hook and would diverge from
  it during edits.
- The pure-helper boundary in `useEditorSession` is already where it should be
  (`selectionAfterRename`, `selectionShouldCloseAfterRemove`). Pushing further
  would be artificial.
- `useWorkspace` has 11 distinct Tauri command call sites plus state-derived
  projections. Pure-helper extraction would touch 70% of the file as a
  refactor that adds no production value, just to make ~150 lines testable.

The audit (see plan file referenced in PR #94) flagged hook coverage as the
biggest TS gap. The right response is to invest once in the toolchain that
unblocks broad hook coverage, not to write one-off refactors per hook.

## Decision

Adopt **`@testing-library/react`** + **`@happy-dom/global-registrator`** as
the hook testing toolchain, wired in via a Bun test preload:

- `bunfig.toml` declares a `[test] preload = ["./scripts/test-setup.ts"]`.
- `scripts/test-setup.ts` calls `GlobalRegistrator.register({ url: ... })`
  and sets `globalThis.IS_REACT_ACT_ENVIRONMENT = true` so React 18+ async
  state updates don't log `act()` warnings.
- Hook tests use `renderHook(() => useFoo(args))` and `act(...)` to drive
  the hook, then assert against `result.current.*` and against spy
  functions passed in as args.

**Pure-helper extraction remains the *first* tool.** If a piece of logic is a
decision rule that doesn't depend on React or external I/O, it stays a pure
function with a pure-function test. The renderer is for *orchestration* that
can't be extracted without distorting the production code.

The existing `mock.module()` pattern from `commands/internal.test.ts` carries
over: hook tests that go through the Tauri seam mock `@tauri-apps/api/core`
at module level and dispatch via a mutable `nextInvokeImpl` closure.

## Consequences

**Positive:**
- `useWorkspace`, `useEditorSession`, and every future hook become directly
  testable without a per-hook refactor.
- Catches a class of bugs that pure-helper tests structurally can't: race
  conditions in async dispatch (`useWorkspace.refreshIdRef`), callback
  ordering on multi-step operations (`handleNewFile`), state propagation
  across composed hooks (`useEditorSession.notifyPathRenamed`).
- ADR 0007's pure-helper extractions remain correct and valuable — they're
  still the cheapest way to test decision logic.

**Negative / accepted:**
- Three new dev-deps (`@testing-library/react`, `@happy-dom/global-registrator`,
  `happy-dom`), ~5–7MB to `node_modules`.
- Test runs are ~10% slower from DOM setup. The number is bounded; the
  toolchain doesn't slow tests proportional to test count, only by a
  fixed per-process cost.
- `mock.module()` is process-global within a test file. Tests in a file that
  mocks the Tauri seam can't have one test use the real seam and another
  use the mock — they all share. Tests are structured to mutate the
  dispatch closure (`nextInvokeImpl`) per-case rather than re-mock.

## Alternatives considered

- **Stay with pure-helper extraction.** Continue ADR 0007's approach for
  hook orchestration too. Rejected: the audit's biggest TS gap is exactly
  the hooks where pure-extraction would be artificial. Per-hook refactor
  costs more than the toolchain investment and adds production complexity
  for testability's sake.
- **Use `jsdom` instead of `happy-dom`.** More battle-tested, slightly
  slower. Picked happy-dom because its `GlobalRegistrator` matches Bun's
  preload pattern exactly and the bun-test + happy-dom recipe is the one
  Bun's own docs ship. Falling back to jsdom is mechanical if happy-dom
  surfaces a Bun-specific issue.
- **Adopt Vitest in addition to Bun test.** Some projects run hook tests
  under Vitest (which has DOM out-of-the-box) and keep Bun test for pure
  helpers. Rejected: dual test runners is a maintenance tax, and Bun test
  + happy-dom is just as capable for the cases we care about.

## Cross-references

- [ADR 0002](0002-unified-workspace-tree.md) — `useWorkspace` owns the
  canonical tree this decision unblocks coverage for.
- [ADR 0003](0003-editor-session-owns-open-file-lifecycle.md) — `useEditorSession`
  owns the file lifecycle this decision unblocks coverage for.
- [ADR 0007](0007-workspace-session-coordinator.md) — the prior decision
  this ADR amends (testing-strategy note in §Negative/accepted only;
  the coordinator extraction itself stands).
- `src/lib/commands/internal.test.ts` — the existing `mock.module()`
  pattern for the Tauri seam.
- `scripts/test-setup.ts` — the happy-dom registration this ADR introduces.
