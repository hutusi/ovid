use std::path::Path;

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::state::WorkspaceState;

use super::args::{
    git_checkout_remote_branch_args, git_create_branch_args, git_delete_branch_args,
    git_push_args, git_rename_branch_args,
};
use super::classify::{
    classify_git_branch_delete_error, classify_git_pull_error, classify_git_push_error,
};
use super::parse::{
    get_current_branch_inner, get_git_remote_info_inner, parse_git_branches, parse_git_status,
    parse_git_remote_branches, validate_git_branch_delete, validate_git_branch_rename,
    validate_git_commit_selection,
};
use super::runner::{resolve_git_root, resolve_workspace_root, run_blocking_git, run_git};
use super::{GitBranch, GitCommitChange, GitFileStatus, GitRemoteBranch, GitRemoteInfo};

#[tauri::command]
pub(crate) fn get_git_status(state: State<'_, WorkspaceState>) -> Result<Vec<GitFileStatus>, String> {
    let git_root = match resolve_git_root(state)? {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };

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
}

#[tauri::command]
pub(crate) fn get_git_commit_changes(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitCommitChange>, String> {
    let git_root = match resolve_git_root(state)? {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };
    parse_git_status(&git_root)
}

#[tauri::command]
pub(crate) fn get_git_branch(state: State<'_, WorkspaceState>) -> Result<String, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(String::new());
    };
    Ok(get_current_branch_inner(&git_root).unwrap_or_default())
}

#[tauri::command]
pub(crate) fn get_git_branches(state: State<'_, WorkspaceState>) -> Result<Vec<GitBranch>, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(Vec::new());
    };
    parse_git_branches(&git_root)
}

#[tauri::command]
pub(crate) fn get_git_remote_branches(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitRemoteBranch>, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(Vec::new());
    };
    parse_git_remote_branches(&git_root)
}

#[tauri::command]
pub(crate) fn get_git_remote_info(state: State<'_, WorkspaceState>) -> Result<GitRemoteInfo, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(GitRemoteInfo {
            remotes: Vec::new(),
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        });
    };
    get_git_remote_info_inner(&git_root)
}

#[tauri::command]
pub(crate) async fn git_commit(
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
            let push_result = (|| -> Result<(), String> {
                let remote = get_git_remote_info_inner(&git_root)?;
                let branch = get_current_branch_inner(&git_root)?;
                let args = git_push_args(&remote, &branch, None)?;
                let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
                run_git(&git_root, &arg_refs).map_err(|err| classify_git_push_error(&err))?;
                Ok(())
            })();
            if let Err(err) = push_result {
                return Err(format!("commit created, but push failed: {err}"));
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_push(
    remote_name: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let branch = get_current_branch_inner(&git_root)?;
        let args = git_push_args(&remote, &branch, remote_name.as_deref())?;
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git(&git_root, &arg_refs).map_err(|err| classify_git_push_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_pull(state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["pull", "--ff-only"]).map_err(|err| classify_git_pull_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_fetch(state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["fetch"])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_switch_branch(branch: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["switch", "--", &branch])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_create_branch(branch: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let name = branch.trim();
    if name.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let branch_name = name.to_string();
    run_blocking_git(move || {
        let args = git_create_branch_args(&branch_name);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs)?;
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
        run_git(&git_root, &arg_refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub(crate) async fn git_delete_branch(branch: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
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
