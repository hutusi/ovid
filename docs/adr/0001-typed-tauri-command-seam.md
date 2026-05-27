# ADR 0001 — Typed Tauri command seam

**Status:** Accepted (retrospective)
**Date:** 2026-04 to 2026-05
**Implementing commits:**
- `710a2e2` — refactor: scaffold ts-rs for typed Tauri command bindings
- `ff30dcd` (PR #76) — refactor: typed wrapper for the WeChat command surface
- `f6a89c5` (PR #78) — refactor: typed wrapper for the git command surface
- `3502499` (PR #79) — refactor: typed wrappers for the remaining command domains
- `db8811a` — test: lock in invokeCmd's error-normalisation contract

## Context

Tauri's `invoke()` is stringly-typed: callers pass a command name as a string,
argument shapes are unverified at the call site, and return values are typed
as `unknown`. Before this work, the React side imported `invoke` directly from
`@tauri-apps/api/core` in ~30 places. Three problems compounded:

1. **Argument drift.** Rust fn signatures and JS call sites diverged silently.
   Tauri rejects unknown fields at runtime, so a forgotten field surfaces as a
   user-facing error instead of a type error.
2. **Return-type drift.** Each Rust struct that crossed the IPC seam had a
   hand-typed TS counterpart somewhere. The two could (and did) drift apart.
3. **Error shape ambiguity.** Tauri rejects with raw strings; some callers used
   `String(err)`, some used `err.message`, some used `err.toString()`. The
   `Error`-vs-`string` distinction leaked everywhere.

## Decision

Introduce a typed seam under `src/lib/commands/`. The frontend never imports
`invoke` directly; everything goes through `commands.<domain>.<fn>()`.

- **One namespace per domain.** `commands.git`, `commands.files`,
  `commands.workspace`, `commands.assets`, `commands.search`,
  `commands.contentTypes`, `commands.wechat`, `commands.menu`, `commands.app`.
- **`invokeCmd<T>` normalises errors** to `Error` instances so call sites can
  rely on `err.message`. Covered by `invokeCmd.test.ts`.
- **`listenEvent` hides the async race in `listen()`** and returns a synchronous
  teardown for `useEffect` cleanup.
- **Argument types are hand-typed in TS (camelCase)** mirroring the Rust fn
  signature. Drift fails at runtime via Tauri's unknown-field rejection — loud
  and immediate.
- **Return types are ts-rs generated.** Rust structs derive
  `#[derive(TS)] #[ts(export, export_to = "../../src/lib/commands/generated/")]`.
  The generated dir is checked in. `bun run validate` runs
  `git diff --exit-code src/lib/commands/generated` so drift fails CI.

## Consequences

**Positive:**
- Adding a Tauri command is a contract: derive `TS`, hand-type args, regen,
  verify the diff.
- Refactoring a return type is propagated by `cargo test` to every TS caller.
- Error handling is uniform: `err instanceof Error ? err.message : String(err)`
  works everywhere because the wrapper guarantees `Error` instances.
- The seam is greppable: any new `invoke(` import in `src/` is a smell.

**Negative / accepted:**
- Hand-typed args are not auto-validated. Chose this deliberately because
  generating *both* sides creates a chicken/egg with the `cargo test`
  regeneration step. Tauri's runtime rejection is the safety net.
- The `commands/generated/` directory adds one more thing to keep in CI checks.

## Alternatives considered

- **`tauri-specta`** — full bidirectional codegen. Heavier dependency, less
  idiomatic ts-rs use, and the bidirectional flow makes the codegen step less
  inspectable. Rejected for now.
- **No seam, keep `invoke()` everywhere.** The status quo. Rejected because
  the cost of drift was already material.
