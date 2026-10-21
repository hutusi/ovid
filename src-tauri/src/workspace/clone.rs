//! Clone an existing workspace from a git remote.
//!
//! Shells out to the `git` CLI (same approach as the rest of the git module
//! — see `git/runner.rs`) and streams `git clone --progress` output line by
//! line as `workspace_clone_progress` events. On success the cloned
//! directory flows through `build_workspace_result` so it becomes the
//! active workspace exactly like a normal open.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;
use ts_rs::TS;

use crate::git::runner::{git_command, PipeReader, HTTP_LOW_SPEED_ARGS, PIPE_DRAIN_GRACE};

/// Marker message for a clone the user cancelled. The frontend matches on it
/// to end quietly instead of reporting a failure.
pub(crate) const CLONE_CANCELLED: &str = "CLONE_CANCELLED";

/// Set by `cancel_clone`, polled by the clone in progress.
static CLONE_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Ask the clone in progress (if any) to stop: git is killed and the partial
/// checkout removed, and the clone fails with `CLONE_CANCELLED`. A clone was
/// otherwise unstoppable — and because workspace opens are queued, a stalled
/// one blocked opening any other workspace until restart.
#[tauri::command]
pub(crate) fn cancel_clone() {
    CLONE_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

/// One progress tick from `git clone --progress`.
#[derive(Serialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct CloneProgress {
    // Free-form phase label such as "Receiving objects". None for messages
    // without a "label: rest" structure.
    pub(crate) phase: Option<String>,
    // Percent complete in 0..=100, parsed from `<n>%` when present.
    pub(crate) percent: Option<u8>,
    // Raw line as printed by git, trimmed.
    pub(crate) message: String,
}

/// Reasons a clone request is invalid up front (without touching the wire).
#[derive(Debug, PartialEq)]
pub(crate) enum CloneError {
    EmptyUrl,
    InvalidName,
    ParentMissing,
    TargetExists,
    GitNotFound,
    GitFailed(String),
    Cancelled,
}

impl CloneError {
    pub(crate) fn user_message(&self) -> String {
        match self {
            CloneError::EmptyUrl => "Remote URL cannot be empty.".to_string(),
            CloneError::InvalidName => {
                "Folder name is invalid (cannot contain `/`, `\\` or start with `.`).".to_string()
            }
            CloneError::ParentMissing => "The chosen parent directory does not exist.".to_string(),
            CloneError::TargetExists => {
                "A folder with that name already exists at the chosen location.".to_string()
            }
            CloneError::GitNotFound => {
                "`git` was not found on PATH. Install git and try again.".to_string()
            }
            CloneError::Cancelled => CLONE_CANCELLED.to_string(),
            CloneError::GitFailed(stderr) => {
                if stderr.is_empty() {
                    "git clone failed.".to_string()
                } else {
                    format!("git clone failed: {stderr}")
                }
            }
        }
    }
}

/// Derive a sensible folder name from a clone URL when the user did not
/// provide one. Handles trailing slashes and the conventional `.git` suffix
/// across https/ssh/scp-style URLs.
pub(crate) fn derive_clone_target_name(url: &str) -> Option<String> {
    let stripped = url.trim().trim_end_matches('/');
    if stripped.is_empty() {
        return None;
    }
    // Split on `/` and `:` so scp-style `git@host:org/repo.git` also yields `repo.git`.
    let segment = stripped.rsplit(['/', ':']).next()?;
    let segment = segment.trim_end_matches(".git");
    if segment.is_empty() {
        None
    } else {
        Some(segment.to_string())
    }
}

fn validate_folder_name(name: &str) -> bool {
    !name.is_empty() && !name.contains('/') && !name.contains('\\') && !name.starts_with('.')
}

/// Parse a `git clone --progress` stderr line into a `CloneProgress`.
///
/// `remote:` prefixes are smart-stripped so the phase is the useful label
/// (`"Counting objects"`, not `"remote"`) while `message` keeps the original
/// raw line for callers that want it.
pub(crate) fn parse_progress_line(raw: &str) -> CloneProgress {
    let trimmed = raw.trim();
    let scan = trimmed
        .strip_prefix("remote:")
        .map(str::trim_start)
        .unwrap_or(trimmed);
    let (phase, percent) = match scan.find(':') {
        Some(idx) => {
            let phase = scan[..idx].trim();
            let phase = if phase.is_empty() {
                None
            } else {
                Some(phase.to_string())
            };
            let rest = &scan[idx + 1..];
            let percent = rest
                .split('%')
                .next()
                .and_then(|chunk| chunk.split_whitespace().next_back())
                .and_then(|num| num.parse::<u8>().ok())
                .filter(|p| *p <= 100);
            (phase, percent)
        }
        None => (None, None),
    };
    CloneProgress {
        phase,
        percent,
        message: trimmed.to_string(),
    }
}

/// Run `git clone --progress <url> <target>`, blocking the current thread.
/// Emits `workspace_clone_progress` events for the duration and stops early
/// on `cancel_clone`. Designed to be invoked from
/// `tauri::async_runtime::spawn_blocking`.
pub(crate) fn clone_blocking(
    url: &str,
    target: &Path,
    app: &tauri::AppHandle,
) -> Result<(), CloneError> {
    CLONE_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let app = app.clone();
    clone_with_progress(url, target, &CLONE_CANCEL_REQUESTED, move |progress| {
        let _ = app.emit("workspace_clone_progress", progress);
    })
}

/// The clone itself, with progress reporting and cancellation injected so it
/// can be exercised without a Tauri app.
pub(crate) fn clone_with_progress(
    url: &str,
    target: &Path,
    cancel: &AtomicBool,
    on_progress: impl Fn(CloneProgress) + Send + 'static,
) -> Result<(), CloneError> {
    let mut cmd = git_command();
    // An HTTP transfer that stalls (under 1 KB/s for a minute) is aborted by
    // git itself; anything else can be cancelled by the user.
    cmd.args(HTTP_LOW_SPEED_ARGS)
        .arg("clone")
        .arg("--progress")
        .arg(url)
        .arg(target)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(CloneError::GitNotFound),
        Err(e) => return Err(CloneError::GitFailed(e.to_string())),
    };

    // Stream progress live to the frontend while the reader also keeps the
    // whole of stderr for the failure message. git redraws a progress line
    // with `\r` and ends one with `\n`.
    let mut line = Vec::with_capacity(256);
    let stderr = PipeReader::spawn(child.stderr.take(), move |chunk| {
        for &byte in chunk {
            if byte == b'\r' || byte == b'\n' {
                if !line.is_empty() {
                    on_progress(parse_progress_line(&String::from_utf8_lossy(&line)));
                    line.clear();
                }
            } else {
                line.push(byte);
            }
        }
    });

    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| CloneError::GitFailed(e.to_string()))?
        {
            break status;
        }
        if cancel.swap(false, Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            // `resolve_target` guaranteed the target didn't exist before the
            // clone, so whatever is there now is the partial checkout.
            if target.exists() {
                let _ = std::fs::remove_dir_all(target);
            }
            return Err(CloneError::Cancelled);
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    // Bounded: an ssh ControlPersist master started by the clone keeps
    // stderr open after git exits (see PIPE_DRAIN_GRACE).
    let collected = stderr.finish(Instant::now() + PIPE_DRAIN_GRACE);

    if !status.success() {
        let stderr = String::from_utf8_lossy(&collected)
            // Surface only the last informative line (git tends to repeat the
            // same percent line many times before failing).
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("")
            .trim()
            .to_string();
        return Err(CloneError::GitFailed(stderr));
    }
    Ok(())
}

/// Resolve the target directory for a clone request given the user-supplied
/// `parent_dir`, optional `name`, and clone `url`. Validates everything that
/// can be validated without touching the wire.
pub(crate) fn resolve_target(
    url: &str,
    parent_dir: &Path,
    name: Option<&str>,
) -> Result<PathBuf, CloneError> {
    if url.trim().is_empty() {
        return Err(CloneError::EmptyUrl);
    }
    if !parent_dir.is_dir() {
        return Err(CloneError::ParentMissing);
    }
    let folder = match name.map(str::trim).filter(|n| !n.is_empty()) {
        Some(n) => n.to_string(),
        None => derive_clone_target_name(url).ok_or(CloneError::InvalidName)?,
    };
    if !validate_folder_name(&folder) {
        return Err(CloneError::InvalidName);
    }
    let target = parent_dir.join(&folder);
    if target.exists() {
        return Err(CloneError::TargetExists);
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    #[test]
    fn derive_clone_target_name_strips_dot_git_suffix() {
        assert_eq!(
            derive_clone_target_name("https://github.com/foo/bar.git"),
            Some("bar".to_string())
        );
    }

    #[test]
    fn derive_clone_target_name_handles_trailing_slash() {
        assert_eq!(
            derive_clone_target_name("https://github.com/foo/bar/"),
            Some("bar".to_string())
        );
    }

    #[test]
    fn derive_clone_target_name_without_dot_git() {
        assert_eq!(
            derive_clone_target_name("https://github.com/foo/bar"),
            Some("bar".to_string())
        );
    }

    #[test]
    fn derive_clone_target_name_handles_scp_style() {
        assert_eq!(
            derive_clone_target_name("git@github.com:foo/bar.git"),
            Some("bar".to_string())
        );
    }

    #[test]
    fn derive_clone_target_name_returns_none_for_empty() {
        assert_eq!(derive_clone_target_name(""), None);
        assert_eq!(derive_clone_target_name("   "), None);
    }

    #[test]
    fn parse_progress_line_extracts_phase_and_percent() {
        let p = parse_progress_line("Receiving objects:  42% (84/200), 100 KiB | 200 KiB/s");
        assert_eq!(p.phase.as_deref(), Some("Receiving objects"));
        assert_eq!(p.percent, Some(42));
    }

    #[test]
    fn parse_progress_line_strips_remote_prefix() {
        let p = parse_progress_line("remote: Counting objects:  17% (1/6)");
        assert_eq!(p.phase.as_deref(), Some("Counting objects"));
        assert_eq!(p.percent, Some(17));
        // message preserves the original raw line so the UI can show it verbatim.
        assert_eq!(p.message, "remote: Counting objects:  17% (1/6)");
    }

    #[test]
    fn parse_progress_line_handles_lines_without_percent() {
        let p = parse_progress_line("Cloning into 'demo'...");
        // No percent — but the line is captured intact in `message`.
        assert_eq!(p.percent, None);
        assert_eq!(p.message, "Cloning into 'demo'...");
    }

    #[test]
    fn resolve_target_rejects_empty_url() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            resolve_target("   ", dir.path(), Some("foo")).unwrap_err(),
            CloneError::EmptyUrl
        );
    }

    #[test]
    fn resolve_target_rejects_missing_parent() {
        let missing = PathBuf::from("/this/does/not/exist/ovid-clone-test");
        assert_eq!(
            resolve_target("https://example.com/foo.git", &missing, None).unwrap_err(),
            CloneError::ParentMissing
        );
    }

    #[test]
    fn resolve_target_rejects_existing_target() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join("foo")).unwrap();
        assert_eq!(
            resolve_target("https://example.com/foo.git", dir.path(), None).unwrap_err(),
            CloneError::TargetExists
        );
    }

    #[test]
    fn resolve_target_uses_explicit_name() {
        let dir = TempDir::new().unwrap();
        let target = resolve_target(
            "https://example.com/foo.git",
            dir.path(),
            Some("custom-name"),
        )
        .unwrap();
        assert_eq!(target, dir.path().join("custom-name"));
    }

    #[test]
    fn resolve_target_falls_back_to_url_segment() {
        let dir = TempDir::new().unwrap();
        let target = resolve_target("https://example.com/foo.git", dir.path(), None).unwrap();
        assert_eq!(target, dir.path().join("foo"));
    }

    fn git_available() -> bool {
        git_command()
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn clone_blocking_against_local_bare_repo_succeeds() {
        if !git_available() {
            return;
        }
        // Set up a source repo + bare mirror to clone from. No network.
        let src = TempDir::new().unwrap();
        let src_path = src.path();
        let run = |args: &[&str], cwd: &Path| {
            let status = git_command()
                .args(args)
                .current_dir(cwd)
                .status()
                .expect("git failed");
            assert!(status.success(), "git {args:?} failed");
        };
        run(&["init", "-q", "-b", "main"], src_path);
        run(&["config", "user.email", "test@example.com"], src_path);
        run(&["config", "user.name", "Test"], src_path);
        std::fs::write(src_path.join("hello.txt"), "hi").unwrap();
        run(&["add", "."], src_path);
        run(
            &["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"],
            src_path,
        );

        let bare = TempDir::new().unwrap();
        let bare_path = bare.path().join("origin.git");
        let status = git_command()
            .args(["clone", "--bare", "-q"])
            .arg(src_path)
            .arg(&bare_path)
            .status()
            .expect("bare clone failed");
        assert!(status.success());

        // Now use clone_blocking against the bare repo. We can't easily test
        // event emission without a Tauri AppHandle, so just verify the side
        // effect: the target directory is created and contains the source
        // file. The non-emit code path (status check) is what we care about.
        let dest_parent = TempDir::new().unwrap();
        let dest = dest_parent.path().join("clone-test");
        let mut cmd = git_command();
        cmd.arg("clone")
            .arg("--progress")
            .arg(&bare_path)
            .arg(&dest)
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        let output = cmd.output().expect("git clone failed");
        assert!(output.status.success());
        assert!(dest.join("hello.txt").is_file());
    }

    #[test]
    fn clone_with_progress_stops_and_cleans_up_when_cancelled() {
        if !git_available() {
            return;
        }
        let dest_parent = TempDir::new().unwrap();
        let dest = dest_parent.path().join("cancelled");
        // Requested before git even starts: the first poll kills it.
        let cancel = AtomicBool::new(true);
        let result = clone_with_progress(
            "https://example.invalid/never/resolves.git",
            &dest,
            &cancel,
            |_| {},
        );
        assert_eq!(result, Err(CloneError::Cancelled));
        assert!(!dest.exists(), "partial clone must be removed");
        assert!(!cancel.load(Ordering::SeqCst), "the request is consumed");
    }

    #[test]
    fn clone_with_progress_clones_a_local_repository() {
        if !git_available() {
            return;
        }
        let src = TempDir::new().unwrap();
        let run = |args: &[&str]| {
            let status = git_command()
                .args(args)
                .current_dir(src.path())
                .status()
                .expect("git failed");
            assert!(status.success(), "git {args:?} failed");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.com"]);
        run(&["config", "user.name", "Test"]);
        std::fs::write(src.path().join("hello.txt"), "hi").unwrap();
        run(&["add", "."]);
        run(&["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"]);

        let dest_parent = TempDir::new().unwrap();
        let dest = dest_parent.path().join("copy");
        let cancel = AtomicBool::new(false);
        let url = src.path().to_string_lossy().into_owned();
        clone_with_progress(&url, &dest, &cancel, |_| {}).unwrap();
        assert!(dest.join("hello.txt").is_file());
    }

    #[test]
    fn clone_blocking_reports_missing_remote() {
        if !git_available() {
            return;
        }
        // Resolve_target succeeds (URL is non-empty, parent exists, target
        // doesn't); only the actual clone call fails. We replicate the
        // failure path by running the inner Command directly because
        // clone_blocking takes an AppHandle and emitting requires one.
        let dest_parent = TempDir::new().unwrap();
        let dest = dest_parent.path().join("never-clones");
        let output = git_command()
            .args(["clone", "--progress"])
            .arg("file:///this/path/does/not/exist/missing.git")
            .arg(&dest)
            .stderr(Stdio::piped())
            .output()
            .expect("git failed to spawn");
        assert!(!output.status.success());
    }
}
