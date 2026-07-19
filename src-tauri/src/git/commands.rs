use std::path::Path;

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::state::WorkspaceState;

use super::args::{
    git_checkout_remote_branch_args, git_create_branch_args, git_delete_branch_args, git_push_args,
    git_rename_branch_args,
};
use super::classify::{
    classify_git_branch_delete_error, classify_git_create_branch_error, classify_git_fetch_error,
    classify_git_pull_error, classify_git_push_error, classify_git_rename_branch_error,
    classify_git_switch_branch_error, AUTH_REQUIRED_PREFIX,
};
use super::creds::{
    forget_host_credentials, get_host_credentials, git_creds_path, save_host_credentials,
    GitHostCredentials,
};
use super::parse::{
    get_current_branch_inner, get_git_remote_info_inner, parse_git_branches,
    parse_git_remote_branches, parse_git_status, validate_git_branch_delete,
    validate_git_branch_rename, validate_git_commit_selection,
};
use super::runner::{
    resolve_git_root, resolve_workspace_root, run_blocking_git, run_git, run_git_with_credentials,
};
use super::url_auth::host_for_remote_url;
use super::{GitBranch, GitCommitChange, GitFileStatus, GitRemoteBranch, GitRemoteInfo};

/// Resolve the remote URL we'll be talking to so the credential store can be
/// keyed by host. Returns `None` (silently) when the remote has no URL
/// configured or when the URL is SSH/local — those flow through the system
/// SSH agent and shouldn't trigger the credentials dialog.
fn resolved_remote_host(
    remote: &GitRemoteInfo,
    explicit_remote_name: Option<&str>,
) -> Option<String> {
    let chosen_name = explicit_remote_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .or_else(|| remote.remote_name.clone())
        .or_else(|| remote.remotes.first().map(|r| r.name.clone()))?;
    let url = remote
        .remotes
        .iter()
        .find(|r| r.name == chosen_name)
        .and_then(|r| r.url.clone())
        .or_else(|| remote.remote_url.clone())?;
    host_for_remote_url(&url)
}

fn effective_remote_name(remote: &GitRemoteInfo, explicit: Option<&str>) -> Option<String> {
    explicit
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .or_else(|| remote.remote_name.clone())
}

/// Look up a stored credential for the resolved host, if any. Errors are
/// downgraded to None so the operation proceeds with the user's normal git
/// credential helpers (osxkeychain, SSH agent, …).
fn stored_credentials_for(creds_path: &Path, host: Option<&str>) -> Option<GitHostCredentials> {
    let host = host?;
    get_host_credentials(creds_path, host).ok().flatten()
}

// These read-only commands are `async` + `run_blocking_git` so their git
// subprocesses (some spawn several) run off the main thread and don't stutter
// the UI. `resolve_git_root` stays synchronous — its single quick `rev-parse`
// matches how the mutating git commands already resolve the root.
#[tauri::command]
pub(crate) async fn get_git_status(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitFileStatus>, String> {
    let git_root = match resolve_git_root(state)? {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };
    run_blocking_git(move || {
        Ok(parse_git_status(&git_root)?
            .into_iter()
            .map(|change| GitFileStatus {
                path: change.path,
                status: if change.status == "untracked" {
                    "untracked".to_string()
                } else if change.staged {
                    "staged".to_string()
                } else {
                    "modified".to_string()
                },
            })
            .collect())
    })
    .await
}

#[tauri::command]
pub(crate) async fn get_git_commit_changes(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitCommitChange>, String> {
    let git_root = match resolve_git_root(state)? {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };
    run_blocking_git(move || parse_git_status(&git_root)).await
}

#[tauri::command]
pub(crate) async fn get_git_branch(state: State<'_, WorkspaceState>) -> Result<String, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(String::new());
    };
    run_blocking_git(move || Ok(get_current_branch_inner(&git_root).unwrap_or_default())).await
}

#[tauri::command]
pub(crate) async fn get_git_branches(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitBranch>, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(Vec::new());
    };
    run_blocking_git(move || parse_git_branches(&git_root)).await
}

#[tauri::command]
pub(crate) async fn get_git_remote_branches(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitRemoteBranch>, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(Vec::new());
    };
    run_blocking_git(move || parse_git_remote_branches(&git_root)).await
}

#[tauri::command]
pub(crate) async fn get_git_remote_info(
    state: State<'_, WorkspaceState>,
) -> Result<GitRemoteInfo, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(GitRemoteInfo {
            remotes: Vec::new(),
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        });
    };
    run_blocking_git(move || get_git_remote_info_inner(&git_root)).await
}

/// Helper: run `git push` for the resolved branch, transparently using stored
/// credentials for the remote's host if any are saved. On auth-shaped failure
/// the error string is the structured `AUTH_REQUIRED|host|remote` marker so
/// the frontend can open the credentials dialog and retry.
fn push_with_optional_stored_creds(
    creds_path: &Path,
    git_root: &str,
    remote_name: Option<&str>,
) -> Result<(), String> {
    let remote = get_git_remote_info_inner(git_root)?;
    let branch = get_current_branch_inner(git_root)?;
    let args = git_push_args(&remote, &branch, remote_name)?;
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let host = resolved_remote_host(&remote, remote_name);
    let resolved_remote = effective_remote_name(&remote, remote_name);

    let result = if let Some(creds) = stored_credentials_for(creds_path, host.as_deref()) {
        run_git_with_credentials(git_root, &arg_refs, &creds.username, &creds.password)
    } else {
        run_git(git_root, &arg_refs)
    };
    result
        .map(|_| ())
        .map_err(|err| classify_git_push_error(&err, host.as_deref(), resolved_remote.as_deref()))
}

#[tauri::command]
pub(crate) async fn git_commit(
    app: tauri::AppHandle,
    message: String,
    push: bool,
    paths: Vec<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    if paths.is_empty() {
        return Err("select at least one file to commit".to_string());
    }

    let workspace_root = resolve_workspace_root(state.clone())?.ok_or("no workspace open")?;
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    let validated_paths = paths
        .iter()
        .map(|path| validate_git_commit_selection(Path::new(&git_root), &workspace_root, path))
        .collect::<Result<Vec<_>, _>>()?;
    run_blocking_git(move || {
        let mut add_args: Vec<&str> = vec!["add", "-A", "--"];
        for path in &validated_paths {
            add_args.push(path.as_str());
        }
        run_git(&git_root, &add_args)?;

        let mut commit_args: Vec<&str> = vec!["commit", "-m", &message, "--"];
        for path in &validated_paths {
            commit_args.push(path.as_str());
        }
        run_git(&git_root, &commit_args)?;
        if push {
            if let Err(err) = push_with_optional_stored_creds(&creds_path, &git_root, None) {
                // Pass the AUTH_REQUIRED|host|remote marker through unwrapped so
                // the frontend opens the credentials dialog. The commit already
                // happened — the retry is just the push. Other failures keep
                // the "commit created, but push failed: …" prefix so the user
                // knows their commit is safely local.
                if err.starts_with(AUTH_REQUIRED_PREFIX) {
                    return Err(err);
                }
                return Err(format!("commit created, but push failed: {err}"));
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_push(
    app: tauri::AppHandle,
    remote_name: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    run_blocking_git(move || {
        push_with_optional_stored_creds(&creds_path, &git_root, remote_name.as_deref())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_pull(
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let host = resolved_remote_host(&remote, None);
        let resolved_remote = effective_remote_name(&remote, None);
        let args: [&str; 2] = ["pull", "--ff-only"];
        let result = if let Some(creds) = stored_credentials_for(&creds_path, host.as_deref()) {
            run_git_with_credentials(&git_root, &args, &creds.username, &creds.password)
        } else {
            run_git(&git_root, &args)
        };
        result.map(|_| ()).map_err(|err| {
            classify_git_pull_error(&err, host.as_deref(), resolved_remote.as_deref())
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_fetch(
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let host = resolved_remote_host(&remote, None);
        let resolved_remote = effective_remote_name(&remote, None);
        let args: [&str; 1] = ["fetch"];
        let result = if let Some(creds) = stored_credentials_for(&creds_path, host.as_deref()) {
            run_git_with_credentials(&git_root, &args, &creds.username, &creds.password)
        } else {
            run_git(&git_root, &args)
        };
        result.map(|_| ()).map_err(|err| {
            classify_git_fetch_error(&err, host.as_deref(), resolved_remote.as_deref())
        })
    })
    .await
}

/// Persist `(host, username, password)` to the credentials store after a
/// successful authenticated operation. Failures to persist are surfaced —
/// the operation itself already succeeded, but the user explicitly asked to
/// remember; silently swallowing would mean the next push reprompts with no
/// explanation.
fn persist_credentials_after_success(
    creds_path: &Path,
    host: Option<&str>,
    username: &str,
    password: &str,
) -> Result<(), String> {
    let Some(host) = host else {
        return Err("could not determine remote host to remember credentials for".to_string());
    };
    save_host_credentials(creds_path, host, username, password)
}

#[tauri::command]
pub(crate) async fn git_push_with_credentials(
    app: tauri::AppHandle,
    remote_name: Option<String>,
    username: String,
    password: String,
    remember: bool,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    if username.is_empty() {
        return Err("username is required".to_string());
    }
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let branch = get_current_branch_inner(&git_root)?;
        let args = git_push_args(&remote, &branch, remote_name.as_deref())?;
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let host = resolved_remote_host(&remote, remote_name.as_deref());
        let resolved_remote = effective_remote_name(&remote, remote_name.as_deref());
        run_git_with_credentials(&git_root, &arg_refs, &username, &password)
            .map(|_| ())
            .map_err(|err| {
                classify_git_push_error(&err, host.as_deref(), resolved_remote.as_deref())
            })?;
        if remember {
            persist_credentials_after_success(&creds_path, host.as_deref(), &username, &password)?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_pull_with_credentials(
    app: tauri::AppHandle,
    username: String,
    password: String,
    remember: bool,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    if username.is_empty() {
        return Err("username is required".to_string());
    }
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let host = resolved_remote_host(&remote, None);
        let resolved_remote = effective_remote_name(&remote, None);
        let args: [&str; 2] = ["pull", "--ff-only"];
        run_git_with_credentials(&git_root, &args, &username, &password)
            .map(|_| ())
            .map_err(|err| {
                classify_git_pull_error(&err, host.as_deref(), resolved_remote.as_deref())
            })?;
        if remember {
            persist_credentials_after_success(&creds_path, host.as_deref(), &username, &password)?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_fetch_with_credentials(
    app: tauri::AppHandle,
    username: String,
    password: String,
    remember: bool,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    if username.is_empty() {
        return Err("username is required".to_string());
    }
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let creds_path = git_creds_path(&app)?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let host = resolved_remote_host(&remote, None);
        let resolved_remote = effective_remote_name(&remote, None);
        let args: [&str; 1] = ["fetch"];
        run_git_with_credentials(&git_root, &args, &username, &password)
            .map(|_| ())
            .map_err(|err| {
                classify_git_fetch_error(&err, host.as_deref(), resolved_remote.as_deref())
            })?;
        if remember {
            persist_credentials_after_success(&creds_path, host.as_deref(), &username, &password)?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) fn git_forget_credentials(app: tauri::AppHandle, host: String) -> Result<(), String> {
    let creds_path = git_creds_path(&app)?;
    forget_host_credentials(&creds_path, &host)
}

#[tauri::command]
pub(crate) fn git_has_credentials_for_host(
    app: tauri::AppHandle,
    host: String,
) -> Result<bool, String> {
    let creds_path = git_creds_path(&app)?;
    Ok(get_host_credentials(&creds_path, &host)?.is_some())
}

#[tauri::command]
pub(crate) async fn git_switch_branch(
    branch: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["switch", "--", &branch])
            .map_err(|err| classify_git_switch_branch_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_create_branch(
    branch: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let name = branch.trim();
    if name.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let branch_name = name.to_string();
    run_blocking_git(move || {
        let args = git_create_branch_args(&branch_name);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs).map_err(|err| classify_git_create_branch_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_rename_branch(
    old_branch: String,
    new_branch: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let (old_branch, new_branch) = validate_git_branch_rename(&old_branch, &new_branch)?;
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        let args = git_rename_branch_args(&old_branch, &new_branch);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs).map_err(|err| classify_git_rename_branch_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_delete_branch(
    branch: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        let branches = parse_git_branches(&git_root)?;
        let branch_name = validate_git_branch_delete(&branches, &branch)?;
        let args = git_delete_branch_args(&branch_name);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs).map_err(|err| classify_git_branch_delete_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_checkout_remote_branch(
    remote_ref: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let remote_ref = remote_ref.trim().to_string();
    if remote_ref.is_empty() {
        return Err("remote branch cannot be empty".to_string());
    }
    let remote_branches = parse_git_remote_branches(&git_root)?;
    if !remote_branches
        .iter()
        .any(|branch| branch.remote_ref == remote_ref)
    {
        return Err("remote branch is unavailable".to_string());
    }

    run_blocking_git(move || {
        let branches = parse_git_branches(&git_root)?;
        if let Some(existing) = branches
            .iter()
            .find(|branch| branch.upstream.as_deref() == Some(remote_ref.as_str()))
        {
            run_git(&git_root, &["switch", "--", &existing.name])?;
            return Ok(());
        }

        let Some((_, branch_name)) = remote_ref.split_once('/') else {
            return Err("remote branch must include a remote name".to_string());
        };
        if branches.iter().any(|branch| branch.name == branch_name) {
            return Err(format!(
                "local branch `{branch_name}` already exists; switch to it or rename it first"
            ));
        }

        let args = git_checkout_remote_branch_args(&remote_ref)?;
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) fn open_git_remote(
    app: tauri::AppHandle,
    remote_name: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let info = get_git_remote_info_inner(&git_root)?;
    let remote_count = info.remotes.len();
    let remote_url = match remote_name.as_deref() {
        Some(name) => info
            .remotes
            .iter()
            .find(|remote| remote.name == name)
            .and_then(|remote| remote.url.clone())
            .ok_or_else(|| format!("remote `{name}` is unavailable"))?,
        None => info.remote_url.ok_or_else(|| {
            if remote_count > 1 {
                "multiple remotes configured; choose one in the branch switcher".to_string()
            } else {
                "no remote configured".to_string()
            }
        })?,
    };
    app.opener()
        .open_url(&remote_url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use tempfile::TempDir;

    fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn run_in(repo: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(repo)
            .status()
            .expect("failed to invoke git");
        assert!(status.success(), "git {args:?} failed");
    }

    /// Create a TempDir, `git init -b main`, configure a fake user, and commit
    /// one file so HEAD resolves. Returns the dir guard and its path as &str.
    fn init_repo() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        run_in(&root, &["init", "-q", "-b", "main"]);
        run_in(&root, &["config", "user.email", "test@example.com"]);
        run_in(&root, &["config", "user.name", "Test"]);
        std::fs::write(root.join("README.md"), "hello").unwrap();
        run_in(&root, &["add", "README.md"]);
        run_in(
            &root,
            &["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"],
        );
        (dir, root)
    }

    #[test]
    fn get_current_branch_inner_returns_main_after_init() {
        if !git_available() {
            return;
        }
        let (_dir, root) = init_repo();
        let branch = get_current_branch_inner(root.to_str().unwrap()).expect("branch lookup");
        assert_eq!(branch, "main");
    }

    #[test]
    fn parse_git_branches_lists_local_branches() {
        if !git_available() {
            return;
        }
        let (_dir, root) = init_repo();
        run_in(&root, &["branch", "feature/x"]);

        let branches = parse_git_branches(root.to_str().unwrap()).expect("branches lookup");
        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert!(names.contains(&"main"), "main missing from {names:?}");
        assert!(
            names.contains(&"feature/x"),
            "feature/x missing from {names:?}"
        );
        assert!(
            branches
                .iter()
                .find(|b| b.name == "main")
                .unwrap()
                .is_current,
            "main should be flagged current"
        );
    }

    #[test]
    fn get_git_remote_info_inner_returns_configured_remote() {
        if !git_available() {
            return;
        }
        let (_dir, root) = init_repo();
        run_in(
            &root,
            &["remote", "add", "origin", "git@github.com:foo/bar.git"],
        );

        let info = get_git_remote_info_inner(root.to_str().unwrap()).expect("remote info");
        let names: Vec<&str> = info.remotes.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"origin"), "origin missing from {names:?}");
        let origin = info.remotes.iter().find(|r| r.name == "origin").unwrap();
        assert!(
            origin.url.as_deref().is_some(),
            "origin should expose a URL"
        );
    }
}
