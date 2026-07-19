# ADR 0021 — Event-driven workspace refresh

**Status:** Accepted
**Date:** 2026-07

## Context

Ovid previously hashed the visible workspace tree every two seconds to detect
changes made by Git, another editor, or filesystem tools. The scan ran off the
UI thread, but it still imposed continuous filesystem and hashing work,
including while a large workspace was idle. Short polling also generated
avoidable refresh races around Ovid's own atomic saves.

Correctness cannot rely solely on native notifications: operating systems can
coalesce or drop events, a watcher can fail to start, and the app may be
suspended while hidden.

## Decision

Watch the open workspace recursively with `notify::recommended_watcher` and
emit a typed `workspace-fs-change` Tauri event.

- Rust filters paths outside the canonical workspace, hidden/build noise, and
  non-Markdown data/metadata changes before crossing the IPC seam. Directory
  creates, removals, and renames remain candidates because they can alter the
  visible tree. Event paths are rebased to the path the user opened (important
  when that path traverses a symlink), and the watcher is replaced whenever a
  workspace opens.
- Watcher startup failure is non-fatal. The frontend retains an independent
  revision fallback, so an unsupported backend does not make external changes
  invisible.
- `useWorkspaceChangeMonitor` debounces native events for 250 ms, then computes
  the authoritative workspace revision. It only refreshes the tree and active
  file when that revision changed. Events arriving during a refresh coalesce
  into one queued pass.
- The monitor ignores events while the document is hidden, checks immediately
  when visibility returns, and performs a slow 30-second revision check while
  visible. These cover dropped/coalesced events without restoring constant
  short polling.
- Ovid's own atomic save can generate a watcher event. When a debounced burst
  affects only the active file, the monitor compares its disk content with
  `lastSavedContentRef`; an exact match is acknowledged without hashing or
  re-walking the workspace. The slow fallback later advances the revision
  baseline. The same comparison still protects the live document when a
  fallback discovers Ovid's own revision.
- Active-file conflict behavior remains the pure decision model in
  `workspaceRefresh.ts`: clean files reload, unsaved/saving files warn once per
  revision, removed files close, and Git status refresh follows a confirmed
  revision change.

## Consequences

- Idle workspaces no longer receive a complete revision scan every two
  seconds. External edits normally surface after the 250 ms debounce.
- Native events are hints, not authority. Revision comparison and the
  content-version save handshake (ADR 0020) remain the correctness boundaries.
- The typed event payload's paths support own-save suppression and leave room
  for future targeted invalidation. For other events the current implementation
  deliberately performs one authoritative refresh after revision verification
  rather than maintaining a second partial-tree truth.
- Tests cover watcher filtering, burst coalescing, hidden-window resume,
  fallback polling, cleanup, and the existing active-file decision matrix.
