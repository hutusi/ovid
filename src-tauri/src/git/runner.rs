use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{mpsc, Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use tauri::State;

use crate::state::WorkspaceState;

/// Local git commands (status, branch, log, …) finish well within this even
/// on large repositories; one that doesn't is stuck — a stale index lock, a
/// hung filesystem — and is killed rather than wedging its caller forever.
const LOCAL_GIT_TIMEOUT: Duration = Duration::from_secs(60);
/// The ceiling for commands whose duration isn't git's own. Network commands:
/// a big push over a slow link can take minutes, on top of git's HTTP
/// low-speed abort below. Commands that run repository hooks or sign: a
/// pre-commit hook running a test suite, or a GPG passphrase prompt, easily
/// outlasts a minute — and `git commit` killed mid-hook leaves
/// `.git/index.lock` behind, blocking every later commit until it's removed
/// by hand.
const LONG_GIT_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// Abort an HTTP transfer that stays under 1 KB/s for a minute — a stalled
/// connection — instead of waiting on it indefinitely. Placed before the
/// subcommand as `-c` overrides, so repo config is never modified.
pub(crate) const HTTP_LOW_SPEED_ARGS: [&str; 4] = [
    "-c",
    "http.lowSpeedLimit=1000",
    "-c",
    "http.lowSpeedTime=60",
];

/// The subcommand of a git invocation: the first argument that is neither a
/// global option nor the value of `-c` / `-C`.
fn subcommand<'a>(args: &[&'a str]) -> Option<&'a str> {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if *arg == "-c" || *arg == "-C" {
            iter.next();
            continue;
        }
        if !arg.starts_with('-') {
            return Some(*arg);
        }
    }
    None
}

/// Whether the git invocation `args` talks to a remote.
fn is_network_subcommand(args: &[&str]) -> bool {
    matches!(
        subcommand(args),
        Some("push" | "pull" | "fetch" | "clone" | "ls-remote")
    )
}

/// Whether the git invocation `args` can run repository hooks (pre-commit,
/// commit-msg, post-checkout, …) or sign a commit.
fn runs_repo_hooks(args: &[&str]) -> bool {
    matches!(
        subcommand(args),
        Some("commit" | "merge" | "rebase" | "switch" | "checkout")
    )
}

/// How long `git <args>` may run before it is killed.
fn git_timeout(args: &[&str]) -> Duration {
    if is_network_subcommand(args) || runs_repo_hooks(args) {
        LONG_GIT_TIMEOUT
    } else {
        LOCAL_GIT_TIMEOUT
    }
}

/// Once git has exited, how long to wait for its output pipes to close. Git's
/// own output is in the pipe by then and drains at once; a pipe still open
/// after that is held by a process git left behind with the inherited
/// descriptor — a hook's background job, or an ssh ControlPersist master
/// (which keeps stderr) — and may stay open indefinitely.
pub(crate) const PIPE_DRAIN_GRACE: Duration = Duration::from_secs(1);

/// A child's output pipe, read to EOF on a background thread.
pub(crate) struct PipeReader {
    buf: Arc<Mutex<Vec<u8>>>,
    done: mpsc::Receiver<()>,
}

impl PipeReader {
    /// Start reading `pipe`, passing each chunk to `on_read` as it arrives.
    pub(crate) fn spawn<R: Read + Send + 'static>(
        pipe: Option<R>,
        mut on_read: impl FnMut(&[u8]) + Send + 'static,
    ) -> Self {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&buf);
        let (done_tx, done) = mpsc::channel();
        std::thread::spawn(move || {
            if let Some(mut pipe) = pipe {
                let mut chunk = [0u8; 8192];
                loop {
                    match pipe.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => {
                            on_read(&chunk[..n]);
                            sink.lock()
                                .unwrap_or_else(PoisonError::into_inner)
                                .extend_from_slice(&chunk[..n]);
                        }
                        Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
                        Err(_) => break,
                    }
                }
            }
            let _ = done_tx.send(());
        });
        Self { buf, done }
    }

    /// Everything read, once the pipe closes — or what has been read by
    /// `until` if it is still open then. The reader thread is left to finish
    /// on its own.
    pub(crate) fn finish(self, until: Instant) -> Vec<u8> {
        let _ = self
            .done
            .recv_timeout(until.saturating_duration_since(Instant::now()));
        std::mem::take(&mut *self.buf.lock().unwrap_or_else(PoisonError::into_inner))
    }
}

/// `Command::output`, but the child is killed once `timeout` elapses, and its
/// pipes are waited on for at most `PIPE_DRAIN_GRACE` after it exits. Polls
/// with a backoff from 1 ms to 25 ms, so quick commands (most git calls take a
/// few milliseconds) pay almost nothing for the check.
pub(crate) fn output_with_timeout(mut cmd: Command, timeout: Duration) -> Result<Output, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|_| "git not found".to_string())?;
    let stdout = PipeReader::spawn(child.stdout.take(), |_| {});
    let stderr = PipeReader::spawn(child.stderr.take(), |_| {});
    let deadline = Instant::now() + timeout;
    let mut pause = Duration::from_millis(1);
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let drained_by = Instant::now() + PIPE_DRAIN_GRACE;
            return Ok(Output {
                status,
                stdout: stdout.finish(drained_by),
                stderr: stderr.finish(drained_by),
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

/// The variables that point git at a particular repository — the list
/// `git rev-parse --local-env-vars` prints. git exports them to the commands
/// it runs (hooks, `rebase --exec`), so an Ovid process started from one —
/// or `cargo test` run from one — would otherwise inherit them and have every
/// git call act on that repository instead of the workspace.
const REPO_LOCATION_ENV_VARS: [&str; 15] = [
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
    "GIT_OBJECT_DIRECTORY",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_GRAFT_FILE",
    "GIT_INDEX_FILE",
    "GIT_NO_REPLACE_OBJECTS",
    "GIT_REPLACE_REF_BASE",
    "GIT_PREFIX",
    "GIT_SHALLOW_FILE",
    "GIT_COMMON_DIR",
];

/// Drop any inherited repository location, so git finds its repository from
/// its arguments and working directory alone.
fn clear_repo_location_env(cmd: &mut Command) {
    for var in REPO_LOCATION_ENV_VARS {
        cmd.env_remove(var);
    }
}

/// A `git` command as Ovid runs every one, tests included: aimed only by its
/// own arguments and working directory, never prompting (no terminal, no
/// credential-manager window), and without a console window on Windows.
pub(crate) fn git_command() -> Command {
    let mut cmd = Command::new("git");
    clear_repo_location_env(&mut cmd);
    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never");
    configure_child_process(&mut cmd);
    cmd
}

/// Run `git <cmd_args>` with Ovid's non-interactive environment and a timeout
/// suited to the subcommand; stdout on success, stderr (or a generic message)
/// on failure.
fn run_git_process(cmd_args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = git_command();
    cmd.args(cmd_args);
    for (key, value) in envs {
        cmd.env(key, value);
    }
    let output = output_with_timeout(cmd, git_timeout(cmd_args))?;
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

#[cfg(windows)]
pub(crate) fn configure_child_process(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn configure_child_process(_cmd: &mut std::process::Command) {}

/// Run a git subcommand rooted at `root`. Returns stdout on success or an
/// error string (stderr) on failure.
pub(crate) fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let network = is_network_subcommand(args);
    let mut cmd_args = vec!["-C", root];
    if network {
        cmd_args.extend_from_slice(&HTTP_LOW_SPEED_ARGS);
    }
    cmd_args.extend_from_slice(args);
    run_git_process(&cmd_args, &[])
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
    )
}

pub(crate) fn resolve_git_root(state: State<'_, WorkspaceState>) -> Result<Option<String>, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = match root_guard.as_ref() {
        Some(r) => r.clone(),
        None => return Ok(None),
    };
    drop(root_guard);

    if let Some((cached_root, git_root)) = state
        .git_root_cache
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
    {
        if *cached_root == root && Path::new(git_root).is_dir() {
            return Ok(Some(git_root.clone()));
        }
    }

    let git_root = run_git(&root.to_string_lossy(), &["rev-parse", "--show-toplevel"])
        .ok()
        .map(|s| s.trim().to_string());
    if let Some(found) = &git_root {
        *state.git_root_cache.lock().map_err(|e| e.to_string())? = Some((root, found.clone()));
    }
    Ok(git_root)
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

    #[test]
    fn git_commands_clear_every_repository_location_variable() {
        let cmd = git_command();
        let cleared: Vec<String> = cmd
            .get_envs()
            .filter(|(_, value)| value.is_none())
            .map(|(key, _)| key.to_string_lossy().into_owned())
            .collect();
        for var in REPO_LOCATION_ENV_VARS {
            assert!(cleared.iter().any(|c| c == var), "{var} is inherited");
        }
    }

    #[test]
    fn an_inherited_git_dir_cannot_point_git_at_another_repository() {
        if !git_available() {
            return;
        }
        // `git rebase --exec` and hooks export GIT_DIR. A test helper's
        // `git init` / `git config` in a temp dir then acted on the
        // repository being rebased instead (and `git init` through a linked
        // worktree's GIT_DIR marks the shared repository bare).
        let outer = TempDir::new().unwrap();
        assert!(git_command()
            .args(["init", "-q"])
            .current_dir(outer.path())
            .status()
            .unwrap()
            .success());
        let inner = TempDir::new().unwrap();
        let run_with_inherited_git_dir = |args: &[&str]| {
            let mut cmd = Command::new("git");
            cmd.env("GIT_DIR", outer.path().join(".git"));
            clear_repo_location_env(&mut cmd);
            assert!(cmd
                .args(args)
                .current_dir(inner.path())
                .status()
                .unwrap()
                .success());
        };
        run_with_inherited_git_dir(&["init", "-q"]);
        run_with_inherited_git_dir(&["config", "user.name", "Test"]);

        assert!(inner.path().join(".git").is_dir());
        let outer_name = git_command()
            .arg("--git-dir")
            .arg(outer.path().join(".git"))
            .args(["config", "--local", "user.name"])
            .output()
            .unwrap();
        assert!(
            outer_name.stdout.is_empty(),
            "the outer repo was configured"
        );
    }

    #[test]
    fn hook_running_and_network_commands_get_the_long_timeout() {
        let long = |args: &[&str]| git_timeout(args) == LONG_GIT_TIMEOUT;
        assert!(long(&["-C", "/ws", "commit", "-m", "msg", "--", "a.md"]));
        assert!(long(&["-C", "/ws", "switch", "--", "main"]));
        assert!(long(&["-C", "/ws", "checkout", "main"]));
        assert!(long(&["-C", "/ws", "-c", "credential.helper=", "push"]));
        assert!(!long(&["-C", "/ws", "status", "--porcelain=v1", "-z"]));
        assert!(!long(&["-C", "/ws", "branch", "-m", "--", "a", "b"]));
        // An option value that happens to spell a subcommand is skipped.
        assert!(!long(&["-C", "commit", "-c", "switch", "log"]));
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

    #[cfg(unix)]
    #[test]
    fn output_with_timeout_does_not_wait_on_pipes_a_leftover_process_holds() {
        // The shell exits at once; the background sleep inherits its stdout
        // and stderr and holds them open for five seconds.
        let mut cmd = Command::new("sh");
        cmd.args(["-c", "printf out; sleep 5 & exit 0"]);
        let started = Instant::now();
        let output = output_with_timeout(cmd, Duration::from_secs(30)).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"out");
        assert!(started.elapsed() < PIPE_DRAIN_GRACE + Duration::from_secs(2));
    }

    fn git_available() -> bool {
        git_command()
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

        let mut cmd = git_command();
        cmd.args(&args)
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
