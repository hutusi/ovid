use std::path::PathBuf;

use tauri::State;

use crate::state::WorkspaceState;

/// Run a git subcommand rooted at `root`. Returns stdout on success or an
/// error string (stderr) on failure. Returns an empty string if git is not
/// found, so callers can treat a missing git as a graceful no-op.
#[cfg(windows)]
pub(crate) fn configure_child_process(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn configure_child_process(_cmd: &mut std::process::Command) {}

pub(crate) fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd_args = vec!["-C", root];
    cmd_args.extend_from_slice(args);
    let mut cmd = std::process::Command::new("git");
    cmd.args(&cmd_args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never");
    configure_child_process(&mut cmd);
    let output = cmd.output().map_err(|_| "git not found".to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) fn resolve_git_root(state: State<'_, WorkspaceState>) -> Result<Option<String>, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = match root_guard.as_ref() {
        Some(r) => r.clone(),
        None => return Ok(None),
    };
    drop(root_guard);

    Ok(
        run_git(&root.to_string_lossy(), &["rev-parse", "--show-toplevel"])
            .ok()
            .map(|s| s.trim().to_string()),
    )
}

pub(crate) fn resolve_workspace_root(state: State<'_, WorkspaceState>) -> Result<Option<PathBuf>, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    Ok(root_guard.as_ref().cloned())
}

pub(crate) async fn run_blocking_git<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| e.to_string())?
}
