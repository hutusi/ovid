# Git Workflow

When the opened workspace is a Git repository, Ovid surfaces Git state in the status bar and native menu without turning the editor into a full Git client.

## Status Bar

- **Branch** shows the current branch and opens **Switch Branch**
- **Sync** shows remote tracking state such as `ahead`, `behind`, `diverged`, `no upstream`, or `choose remote`; click it to open the sync window
- **Changes** shows a compact dirty-state summary such as `3 changes`; click it to open the commit dialog

The change badge appears only when the repository has local changes. Its tooltip shows a staged versus unstaged breakdown.

## Sync Behavior

- Ovid fetches remote-tracking refs when the app window regains focus, with a cooldown, so remote sync status stays reasonably fresh without constant polling
- `ahead` means local commits are ready to push
- `behind` means remote commits are available to pull
- `diverged` means local and remote both have new commits
- `no upstream` means the current branch is not yet tracking a remote branch

## Remotes

- Ovid supports multiple remotes and keeps a preferred remote when it can infer one from upstream or Git config
- If multiple remotes exist and no preferred target can be inferred, the UI asks you to choose one instead of guessing
- Opening or copying a remote URL respects the specific remote you selected and does not silently fall back to another remote

## HTTPS Credentials

When push, pull, or fetch fails authentication against an HTTPS remote, Ovid opens a sign-in dialog instead of just showing an error toast. Enter a username and a Personal Access Token (GitHub no longer accepts passwords over HTTPS) and Ovid retries the operation. Leave **Remember credentials for this host** checked (default) and Ovid stores them per host in `<app_config_dir>/git_credentials.json` (`0o600` on Unix); subsequent operations against that host run silently. If a saved PAT stops working (revoked, rotated), use the **Forget saved credentials for {host}** link inside the dialog to clear the entry and enter a fresh one. SSH remotes and remotes already authenticated through your system credential helper (`osxkeychain`, `libsecret`, …) are unaffected — Ovid only prompts when git itself reports an auth failure. See [ADR 0014](adr/0014-git-https-credentials.md) for the design rationale.

## Current Limits

- Ovid supports commit, push, pull, fetch, branch switching, and branch creation
- Ovid does not yet provide a full merge-conflict or rebase-resolution UI; advanced recovery still belongs in your normal Git tools
