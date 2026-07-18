# ADR 0020 — External-change conflict detection on save

**Status:** Accepted
**Date:** 2026-07

## Context

Ovid autosaves the open file on a debounce and also reloads it when the
`useWorkspaceRevisionPoll` loop detects an external change (git pull, another
editor). But detection and reload only ran when the file had **no** local
edits. With unsaved edits present, the poll merely warned ("changed with
unsaved") and the next autosave wrote the buffer back with an unconditional
`write_file` — silently clobbering whatever the other program had written. A
lost update, and the exact failure the "files stay plain / don't lose data"
principle exists to prevent.

The write path had no idea the file had changed underneath it: `write_file`
took `(path, content)` and always overwrote.

## Decision

Add an **optimistic-concurrency handshake** keyed on the file's modification
time, and a resolution prompt when it fails.

- `read`/open seeds a token: `get_file_mtime` returns the file's mtime (ms
  since epoch), stored in `lastSavedMtimeRef`.
- Every editor write goes through `writeMarkdown` → `write_file(path, content,
  expected_mtime)`. Rust compares `expected_mtime` to the on-disk mtime and, on
  mismatch, refuses with the `EXTERNAL_CHANGE_CONFLICT` marker instead of
  writing. On success it returns the new mtime, which the client stores.
- `expected_mtime: null` forces the write (used to resolve a conflict by
  overwriting, and for writes outside the editor's tracked model such as the
  collection index).
- **File transitions await the outgoing save and abort on failure.** A file
  switch (`handleSelectFile`) or close (`handleCloseFile`) awaits the outgoing
  file's complete save transaction — pending body write, debounced field
  save, in-flight writes — *before* the selection moves. On failure or
  conflict the transition aborts: the user stays on the outgoing file with the
  edit intact, and the toast or conflict prompt targets the file actually on
  screen. (An earlier iteration force-wrote these flushes fire-and-forget
  because a late conflict had nowhere to prompt and dropped the edit; awaiting
  pre-switch removes that dilemma, so no editor path force-writes anymore.)
  Closes driven by the file's *removal* (trash, external delete) pass
  `discard: true` and skip the save — there is nothing left on disk to save
  to.
- **The window-hide flush stays fire-and-forget, non-forced.** The
  close-guard's hide flush (`flushPendingSave({ mode: "background" })`) never
  changes the selection, so a rejection can always be resolved against the
  file the user is still on: the pending edit is restored (unless a newer edit
  superseded it), then a conflict opens the prompt and any other failure
  toasts and returns the file to "unsaved" for a later retry.
- On conflict the hook pauses autosave (keeping the pending edit), records the
  `(path, markdown)` to retry, and calls `onConflict`, which opens a **blocking
  `conflict` overlay** (`useOverlayStack`). `resolveConflict` offers three
  outcomes: **reload** (discard local, load disk), **overwrite** (force-write),
  or **keep editing** (dismiss — Escape/backdrop map here, the non-destructive
  default; a later save re-prompts).

Why mtime rather than a content hash: it is a single `u64`, cheap to read and
return, and needs no rehashing of large files on every save. The small
TOCTOU window between stat and write is acceptable — the revision poll catches
anything that slips through within ~2s, and the failure mode is a redundant
prompt, never a silent clobber.

This is the **write-time complement** to the revision poll, which keeps
handling the no-local-edits case by reloading. The poll's decision function
treats the intermediate `saving` state like `unsaved` so an in-flight write is
never reloaded out from under itself.

## Consequences

- `write_file` now returns the post-write mtime and takes `expected_mtime`; all
  callers pass it (or `null` to force). A latent `trackWrite` bug — a rejected
  write leaking an unhandled rejection — was fixed at the same time, since
  conflicts made write rejections a normal, frequent path.
- Every editor write must remain tracked (ADR 0003 / the save-coordination
  model); a raw `commands.files.write` from the editor would bypass both the
  conflict check and `flushPendingSave`'s in-flight awaiting.
- Editor writes are **serialized per file path** on the frontend
  (`enqueueWrite` in `useFileEditor`): a write starts only after every earlier
  write to the same file settles, and composes its payload + mtime token at
  start time. Overlapping autosave / frontmatter / flush writes therefore
  cannot land out of order, and a queued write cannot trip the mtime check
  against our own just-completed write.
- The **unmount cleanup flush** stays best-effort and non-forced: a conflict
  rejection during teardown is dropped silently (the component is gone, there
  is nowhere to prompt). The quit path relies on the close-guard's blocking
  flush, which does prompt.
- A future filesystem watcher (deferred) could upgrade the prompt from
  reactive (on save) to proactive (a "changed on disk" banner) but is not
  required — the handshake needs no watcher.

See CONTEXT.md "Save coordination & external-change conflicts".
