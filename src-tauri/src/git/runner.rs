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

/// Run a git subcommand with one-shot HTTPS credentials supplied to the
/// remote, without modifying repo config or writing temp files.
///
/// We install two `-c credential.helper` overrides:
///   1. An empty value, which clears every helper inherited from the user's
///      global config (otherwise osxkeychain or libsecret would intercept
///      first and we'd never see our own helper run).
///   2. An inline shell helper that emits the username and password from
///      `OVID_GIT_USER` / `OVID_GIT_PASS`. Credentials never enter the shell
///      argument string — they ride in the child process environment, which
///      Rust's `Command::env` sets without shell parsing — so PATs with
///      shell-metacharacter contents can't break or leak.
///
/// This preserves the side-effects callers expect (push updates upstream,
/// fetch updates tracking refs, pull merges) since we don't have to swap
/// the remote URL.
pub(crate) fn run_git_with_credentials(
    root: &str,
    args: &[&str],
    username: &str,
    password: &str,
) -> Result<String, String> {
    let credential_helper_script =
        "!f() { echo username=$OVID_GIT_USER; echo password=$OVID_GIT_PASS; }; f";
    let mut cmd_args: Vec<&str> = vec![
        "-C",
        root,
        "-c",
        "credential.helper=",
        "-c",
        // Concatenated at compile-time so we never have to escape a runtime value.
        // The body is also kept simple enough that any POSIX `sh` will accept it.
        "credential.helper=!f() { echo username=$OVID_GIT_USER; echo password=$OVID_GIT_PASS; }; f",
    ];
    // Defensive: ensure the static string above is what we expect; if a later
    // refactor changes one and not the other, this assert flags it in tests.
    debug_assert_eq!(cmd_args[5], credential_helper_script);
    cmd_args.extend_from_slice(args);
    let mut cmd = std::process::Command::new("git");
    cmd.args(&cmd_args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("OVID_GIT_USER", username)
        .env("OVID_GIT_PASS", password);
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
