use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use tauri::State;

use crate::state::WorkspaceState;

/// Local git commands (status, branch, log, …) finish well within this even
/// on large repositories; one that doesn't is stuck — a stale index lock, a
/// hung filesystem — and is killed rather than wedging its caller forever.
const LOCAL_GIT_TIMEOUT: Duration = Duration::from_secs(60);
/// Network commands get a long ceiling (a big push over a slow link can take
/// minutes) on top of git's own HTTP low-speed abort below.
const NETWORK_GIT_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// Abort an HTTP transfer that stays under 1 KB/s for a minute — a stalled
/// connection — instead of waiting on it indefinitely. Placed before the
/// subcommand as `-c` overrides, so repo config is never modified.
pub(crate) const HTTP_LOW_SPEED_ARGS: [&str; 4] = [
    "-c",
    "http.lowSpeedLimit=1000",
    "-c",
    "http.lowSpeedTime=60",
];

/// Whether the git invocation `args` (without `-C <root>`) talks to a remote.
fn is_network_subcommand(args: &[&str]) -> bool {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if *arg == "-c" || *arg == "-C" {
            iter.next();
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        return matches!(*arg, "push" | "pull" | "fetch" | "clone" | "ls-remote");
    }
    false
}

fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut buf);
        }
        buf
    })
}

/// `Command::output`, but the child is killed once `timeout` elapses. Polls
/// with a backoff from 1 ms to 25 ms, so quick commands (most git calls take a
/// few milliseconds) pay almost nothing for the check.
pub(crate) fn output_with_timeout(mut cmd: Command, timeout: Duration) -> Result<Output, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|_| "git not found".to_string())?;
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let deadline = Instant::now() + timeout;
    let mut pause = Duration::from_millis(1);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Ok(Output {
                status,
                stdout: stdout.join().unwrap_or_default(),
                stderr: stderr.join().unwrap_or_default(),
            });
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            // The pipe readers are left to finish on their own: a process git
            // spawned (ssh, a credential helper) may still hold the pipes open.
            return Err(format!(
                "git did not respond within {} seconds and was stopped",
                timeout.as_secs()
            ));
        }
        std::thread::sleep(pause);
        pause = (pause * 2).min(Duration::from_millis(25));
    }
}

/// Run `git <cmd_args>` with Ovid's non-interactive environment and a timeout
/// suited to the subcommand; stdout on success, stderr (or a generic message)
/// on failure.
fn run_git_process(
    cmd_args: &[&str],
    envs: &[(&str, &str)],
    network: bool,
) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(cmd_args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never");
    for (key, value) in envs {
        cmd.env(key, value);
    }
    configure_child_process(&mut cmd);
    let timeout = if network {
        NETWORK_GIT_TIMEOUT
    } else {
        LOCAL_GIT_TIMEOUT
    };
    let output = output_with_timeout(cmd, timeout)?;
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
    let network = is_network_subcommand(args);
    let mut cmd_args = vec!["-C", root];
    if network {
        cmd_args.extend_from_slice(&HTTP_LOW_SPEED_ARGS);
    }
    cmd_args.extend_from_slice(args);
    run_git_process(&cmd_args, &[], network)
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
// Clears every credential.helper inherited from the user's global config
// (otherwise osxkeychain or libsecret would intercept first and we'd never
// see our own helper run).
const CLEAR_CREDENTIAL_HELPER: &str = "credential.helper=";

// The body is kept simple enough that any POSIX `sh` will accept it. The
// credentials themselves ride in env (OVID_GIT_USER / OVID_GIT_PASS) and
// never enter the shell argument string, so PATs containing shell
// metacharacters can't break the invocation. Shared with the test below
// (via `git credential fill`) so the two can't drift out of sync.
const INLINE_CREDENTIAL_HELPER: &str =
    "credential.helper=!f() { echo username=$OVID_GIT_USER; echo password=$OVID_GIT_PASS; }; f";

pub(crate) fn run_git_with_credentials(
    root: &str,
    args: &[&str],
    username: &str,
    password: &str,
) -> Result<String, String> {
    let network = is_network_subcommand(args);
    let mut cmd_args: Vec<&str> = vec![
        "-C",
        root,
        "-c",
        CLEAR_CREDENTIAL_HELPER,
        "-c",
        INLINE_CREDENTIAL_HELPER,
    ];
    if network {
        cmd_args.extend_from_slice(&HTTP_LOW_SPEED_ARGS);
    }
    cmd_args.extend_from_slice(args);
    run_git_process(
        &cmd_args,
        &[("OVID_GIT_USER", username), ("OVID_GIT_PASS", password)],
        network,
    )
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

pub(crate) fn resolve_workspace_root(
    state: State<'_, WorkspaceState>,
) -> Result<Option<PathBuf>, String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::{Command, Stdio};
    use tempfile::TempDir;

    #[test]
    fn network_subcommands_are_recognised_past_leading_options() {
        assert!(is_network_subcommand(&["push", "origin", "main"]));
        assert!(is_network_subcommand(&["-c", "x=y", "fetch", "--prune"]));
        assert!(is_network_subcommand(&["pull", "--ff-only"]));
        assert!(!is_network_subcommand(&["status", "--porcelain"]));
        assert!(!is_network_subcommand(&["-c", "push=1", "log"]));
        assert!(!is_network_subcommand(&["remote", "get-url", "origin"]));
    }

    #[cfg(unix)]
    #[test]
    fn output_with_timeout_kills_a_process_that_overruns() {
        let mut cmd = Command::new("sleep");
        cmd.arg("5");
        let started = Instant::now();
        let result = output_with_timeout(cmd, Duration::from_millis(100));
        assert!(result.unwrap_err().contains("did not respond"));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[cfg(unix)]
    #[test]
    fn output_with_timeout_returns_output_of_a_quick_process() {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "printf out; printf err >&2"]);
        let output = output_with_timeout(cmd, Duration::from_secs(5)).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"out");
        assert_eq!(output.stderr, b"err");
    }

    fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Runs `git -C <dir> <helper -c overrides> credential fill` with the
    /// given env vars, feeding `protocol=https\nhost=example.com\n\n` on
    /// stdin, and returns stdout. This exercises the exact `-c
    /// credential.helper` overrides `run_git_with_credentials` installs via
    /// git's own credential plumbing — the security-relevant mechanism
    /// (env-based credential passing, no shell-string interpolation, no
    /// stale helper answering first) — without needing a live authenticated
    /// remote or a smart-HTTP mock server.
    fn fill_credential(
        dir: &std::path::Path,
        helper_overrides: &[&str],
        env: &[(&str, &str)],
    ) -> String {
        let mut args: Vec<&str> = vec!["-C", dir.to_str().unwrap()];
        for helper in helper_overrides {
            args.push("-c");
            args.push(helper);
        }
        args.push("credential");
        args.push("fill");

        let mut cmd = Command::new("git");
        cmd.args(&args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (key, value) in env {
            cmd.env(key, value);
        }

        let mut child = cmd.spawn().expect("failed to spawn git");
        child
            .stdin
            .take()
            .expect("stdin")
            .write_all(b"protocol=https\nhost=example.com\n\n")
            .expect("write to git credential fill stdin");

        let output = child
            .wait_with_output()
            .expect("git credential fill failed to run");
        assert!(
            output.status.success(),
            "git credential fill exited non-zero: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).to_string()
    }

    #[test]
    fn credential_helper_overrides_supply_env_credentials_without_shell_interpolation() {
        if !git_available() {
            return;
        }
        let dir = TempDir::new().unwrap();

        let stdout = fill_credential(
            dir.path(),
            &[CLEAR_CREDENTIAL_HELPER, INLINE_CREDENTIAL_HELPER],
            &[
                ("OVID_GIT_USER", "alice"),
                // Shell metacharacters ($, @, backticks) in the password must
                // survive intact — proving they never round-tripped through
                // shell interpolation (which would mangle or execute them).
                ("OVID_GIT_PASS", "pat-$pecial-`chars`-@here"),
            ],
        );

        assert!(stdout.contains("username=alice"), "stdout was: {stdout}");
        assert!(
            stdout.contains("password=pat-$pecial-`chars`-@here"),
            "stdout was: {stdout}"
        );
    }

    #[test]
    fn clear_credential_helper_actually_resets_prior_helpers() {
        if !git_available() {
            return;
        }
        let dir = TempDir::new().unwrap();

        // A "prior" helper answering with different credentials, listed
        // before our clear+inline pair. If the empty-value clear didn't
        // actually reset the accumulated helper list, this stale helper's
        // answer could win instead of (or alongside) ours.
        let stale_helper =
            "credential.helper=!f() { echo username=stale-user; echo password=stale-pass; }; f";
        let stdout = fill_credential(
            dir.path(),
            &[
                stale_helper,
                CLEAR_CREDENTIAL_HELPER,
                INLINE_CREDENTIAL_HELPER,
            ],
            &[("OVID_GIT_USER", "alice"), ("OVID_GIT_PASS", "secret")],
        );

        assert!(stdout.contains("username=alice"), "stdout was: {stdout}");
        assert!(!stdout.contains("stale-user"), "stdout was: {stdout}");
    }
}
