# ADR 0014 — HTTPS credential prompt, authenticated retry, and per-host store for git

**Status:** Accepted
**Date:** 2026-06
**Implementing commits:** (see the feat/git-https-credentials branch)
- credential store + URL injection helpers
- structured AUTH_REQUIRED error + authenticated retry commands
- credentials dialog component + overlay variant
- controller wiring on AUTH_REQUIRED
- this ADR

## Context

`src-tauri/src/git/` shells out to the system `git` CLI for every remote
operation. To stay interaction-free in a desktop window, the runner sets
`GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=Never`, so git can't prompt
on stderr and Git Credential Manager won't open a window of its own.

That worked when the user already had `osxkeychain` / `libsecret` / SSH
agent configured. It broke noisily for the common case of cloning a
private HTTPS repo on a fresh laptop: the user commits inside Ovid,
clicks Push, the CLI fails with "fatal: Authentication failed…", and
the classifier surfaces a generic *"Push failed because the remote
could not be reached or authorized."* toast. The user is stuck without
a path forward inside the app.

That breaks the "graceful degradation" principle from CLAUDE.md: the
user already committed work in Ovid; the push edge should fail
informatively *and* offer a way through.

Three design choices needed pinning down before implementation:

1. How to send the credentials to git on retry?
2. Where to store remembered credentials?
3. How to signal "this is an auth failure" across the Rust/TS seam?

## Decision

### 1. Inline `-c credential.helper=` over URL injection or GIT_ASKPASS

`runner::run_git_with_credentials` installs two `-c credential.helper`
overrides on the git invocation:

1. The first is empty, which clears every helper inherited from the
   user's global git config — otherwise osxkeychain (or any other
   pre-configured helper) intercepts first and our helper never runs.
2. The second is an inline shell helper that echoes the username and
   password from `OVID_GIT_USER` / `OVID_GIT_PASS`. Credentials never
   enter the shell argument string; they ride in the child process
   environment, which Rust's `Command::env` sets without shell parsing.
   So a PAT containing shell metacharacters (`$`, backticks, `;`,
   quotes) can't break the invocation or leak through argv.

Two paths-not-taken and why:

- **URL injection** — replacing the remote argument with
  `https://user:pat@host/path` works for `git push` but breaks
  `git fetch` and `git pull --ff-only`: those don't update the
  configured `refs/remotes/<remote>/*` when called with an explicit
  URL, so ahead/behind status would silently desync after every
  authenticated pull. The `inject_credentials` helper from
  `git/url_auth.rs` is still kept and tested (it's a pure function
  with no live caller right now) in case a clone-time follow-up wants
  it. The marker comment on the function documents this.
- **GIT_ASKPASS** — would require writing a temp script and tearing it
  down. The inline credential helper achieves the same outcome with
  zero filesystem state.

### 2. Per-host JSON file over OS keychain

Credentials are persisted to
`<app_config_dir>/git_credentials.json` with `0o600` permissions on
Unix, keyed by host. This mirrors `src-tauri/src/wechat/creds.rs` (same
project, same constraints):

- The macOS keychain triggers ACL prompts every time the binary's code
  signature changes, including each `cargo run` in dev mode. That
  ergonomic break alone disqualifies it for an app users boot from
  unsigned dev builds.
- Stronghold would add a Tauri plugin dependency, a vault-init flow,
  and another set of failure modes. The wechat creds file has shipped
  for months without incident.
- Atomic write: the tmp file is `chmod 0600` *before* the rename, not
  after. Setting perms after rename leaves a window where the secret
  is world-readable.
- A malformed credentials file errors loudly on the next save rather
  than silently clobbering surviving entries.

### 3. Structured `AUTH_REQUIRED|<host>|<remoteName>` error marker

`git::classify::auth_required_marker` builds the string. `is_auth_failure`
matches stderr against `authentication failed`, `could not read username`,
`permission denied`, `repository not found`, and `invalid username or
password`. Network-only failures (`could not resolve host`,
`failed to connect`, `connection timed out`) still emit the friendly
human-readable classifier message — the dialog wouldn't help there.

The frontend's `parseAuthRequired` (`src/lib/commands/git.ts`) splits
the marker; `useGitUiController.runGitAction` calls it from the catch
arm of push/pull/fetch and opens the `gitCredentials` overlay.

A structured marker rather than throwing a custom Error subclass means
the error string travels through `invokeCmd`'s normalisation unchanged.
The TS seam stays "strings in, strings out" and the marker survives
the Tauri IPC round-trip without anything special.

## Scope

This ADR covers **push**, **pull**, and **fetch** over HTTPS. Out of scope:

- **Clone-time auth.** `workspace::clone::clone_blocking` has its own
  progress event stream and error path. Wiring the dialog into that
  surface is a future slice.
- **OAuth device flow.** A GitHub-specific code path was considered,
  but PAT-as-password covers GitHub, GitLab, Bitbucket, Gitea, and
  self-hosted with one flow.
- **SSH passphrase prompting.** SSH keeps relying on the system agent.
- **Bulk credential management UI.** Forget-from-dialog is enough for
  recovery from a wrong PAT; a settings list view can come later.

## Consequences

- New Tauri commands: `git_push_with_credentials`,
  `git_pull_with_credentials`, `git_fetch_with_credentials`,
  `git_forget_credentials`, `git_has_credentials_for_host`.
- `git_push`, `git_pull`, `git_fetch` look up stored credentials for
  the remote's host before the first attempt. Behaviour unchanged for
  hosts with no stored credentials (SSH agents and configured helpers
  keep working).
- The credentials JSON file is a backup-relevant secret. Anyone with
  read access to the user's home directory can read the PATs. This is
  the same trust model as `~/.git-credentials` with the `store`
  credential helper, and called out in the dialog copy as
  "saved locally on this machine".
- The plain-text-in-JSON storage choice is reversible: a future ADR
  could move to Stronghold or keychain without changing the dialog or
  retry flow, since the Rust `creds` module is a thin façade.

## Amendment (2026-06)

The file-store mechanics (corruption-tolerant JSON map, atomic
tmp+chmod-0600+rename write, delete-file-when-empty) now live in the
shared `src-tauri/src/creds_store.rs`, used by both `git/creds.rs` and
`wechat/creds.rs` as thin adapters. A storage migration now has exactly
one implementation to swap.
