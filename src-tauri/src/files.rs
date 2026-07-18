use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::paths::{validate_new_dir_path, validate_new_path, validate_path, write_atomic};
use crate::state::WorkspaceState;

/// Marker returned when the on-disk file changed since the client last read or
/// wrote it. The frontend matches on this exact string to open the
/// external-change conflict prompt instead of silently clobbering the change.
pub(crate) const EXTERNAL_CHANGE_CONFLICT: &str = "EXTERNAL_CHANGE_CONFLICT";

/// Marker returned when a file is too large to load into the editor. The
/// frontend matches on this to show a "file too large" message instead of the
/// generic open-failed toast.
pub(crate) const FILE_TOO_LARGE: &str = "FILE_TOO_LARGE";

/// Upper bound on files loaded into the editor. Prose markdown is far smaller;
/// this guards against accidentally opening a huge or binary file and OOMing
/// the whole `read_to_string` into memory + across the IPC bridge.
const MAX_READ_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Modification time as milliseconds since the Unix epoch, or `None` if the file
/// is missing or its mtime is unavailable. Used as an optimistic-concurrency
/// token so a save can detect an external change without hashing file contents.
fn file_mtime_millis(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|dur| dur.as_millis() as u64)
}

#[tauri::command]
pub(crate) fn read_file(path: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    if let Ok(meta) = std::fs::metadata(&canonical) {
        if meta.len() > MAX_READ_FILE_BYTES {
            return Err(FILE_TOO_LARGE.to_string());
        }
    }
    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

/// A file's content together with the optimistic-concurrency token (mtime) that
/// the content is consistent with — read as one snapshot so a save can't later
/// pair old content with a newer mtime and silently clobber an external change.
#[derive(Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct VersionedFile {
    pub(crate) content: String,
    // ms since epoch; fits a JS number. Match get_file_mtime/write_file, which
    // cross the bridge as `number`, rather than ts-rs's default u64 → bigint.
    #[ts(type = "number")]
    pub(crate) mtime: u64,
}

/// Read `path`'s content and its mtime token as a consistent pair. Reading them
/// via two separate commands leaves a TOCTOU gap where an external replace
/// between the calls yields old-content/new-mtime — the next save then matches
/// the mtime and overwrites the change. Here we stat → read → stat: if the mtime
/// is stable across the read the token provably matches the content; if it
/// changed mid-read we return the *pre-read* mtime, which is deliberately stale
/// so the next save conflict-prompts rather than clobbers. A missing mtime is an
/// error — the editor must not open a file it can't guard.
/// How many times a versioned read re-attempts the stat → read → stat cycle
/// before giving up on getting a consistent snapshot.
const VERSIONED_READ_RETRIES: usize = 5;

/// Read content and its mtime as a consistent snapshot: stat → read → stat, and
/// accept the pair only when the mtime is unchanged across the read (the token
/// then provably matches the content). Retries a bounded number of times if the
/// file changes mid-read, then errors — rather than returning torn/new content
/// with a stale token (which would show inconsistent content and raise a
/// spurious conflict on the first save). Generic over the stat/read closures so
/// the retry and error branches are unit-testable without racing a real file.
fn read_stable<S, R>(stat: S, read: R, retries: usize) -> Result<VersionedFile, String>
where
    S: Fn() -> Option<u64>,
    R: Fn() -> std::io::Result<String>,
{
    for _ in 0..retries {
        let mtime_before = stat().ok_or("cannot read file mtime")?;
        let content = read().map_err(|e| e.to_string())?;
        let mtime_after = stat().ok_or("cannot read file mtime")?;
        if mtime_before == mtime_after {
            return Ok(VersionedFile {
                content,
                mtime: mtime_after,
            });
        }
    }
    Err("file changed during read".to_string())
}

/// Core of `read_file_versioned`, factored out of the Tauri command so it can
/// be unit-tested without a `WorkspaceState`.
fn read_versioned_checked(canonical: &Path) -> Result<VersionedFile, String> {
    if let Ok(meta) = std::fs::metadata(canonical) {
        if meta.len() > MAX_READ_FILE_BYTES {
            return Err(FILE_TOO_LARGE.to_string());
        }
    }
    read_stable(
        || file_mtime_millis(canonical),
        || std::fs::read_to_string(canonical),
        VERSIONED_READ_RETRIES,
    )
}

#[tauri::command]
pub(crate) fn read_file_versioned(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<VersionedFile, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    read_versioned_checked(&canonical)
}

/// One corpus file returned by `read_files_bulk`, keyed by the path string
/// the caller requested so client-side lookups need no normalisation.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct BulkFileContent {
    pub(crate) path: String,
    pub(crate) content: String,
}

/// Read many workspace files in one IPC round-trip — the corpus feed for
/// wiki-link resolution and backlinks, which would otherwise pay one
/// invocation per file. Unreadable, oversized, or out-of-workspace paths are
/// skipped rather than failing the batch; callers treat missing entries as
/// unreadable files.
#[tauri::command]
pub(crate) async fn read_files_bulk(
    paths: Vec<String>,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<BulkFileContent>, String> {
    let root = {
        let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    // Read off the main thread — this walks the whole markdown corpus.
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::with_capacity(paths.len());
        for path in paths {
            let Ok(canonical) = validate_path(&root, &path) else {
                continue;
            };
            if let Ok(meta) = std::fs::metadata(&canonical) {
                if meta.len() > MAX_READ_FILE_BYTES {
                    continue;
                }
            }
            let Ok(content) = std::fs::read_to_string(&canonical) else {
                continue;
            };
            files.push(BulkFileContent { path, content });
        }
        files
    })
    .await
    .map_err(|e| e.to_string())
}

/// Return the target file's mtime token so the client can seed its
/// optimistic-concurrency check when it opens a file.
#[tauri::command]
pub(crate) fn get_file_mtime(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<Option<u64>, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    Ok(file_mtime_millis(&canonical))
}

/// Write `content` atomically, returning the post-write mtime token.
///
/// When `expected_mtime` is `Some` and the file on disk no longer carries that
/// mtime, an external process changed it since the client last read/wrote it —
/// the write is refused with `EXTERNAL_CHANGE_CONFLICT` so the caller can prompt
/// instead of clobbering. `None` forces the write (used to resolve a conflict by
/// overwriting).
/// Optimistic-concurrency write, factored out of the Tauri command so it can be
/// unit-tested without a `WorkspaceState`. Refuses the write with
/// `EXTERNAL_CHANGE_CONFLICT` when `expected_mtime` is `Some` and the on-disk
/// mtime no longer matches; returns the post-write mtime on success.
fn write_checked(canonical: &Path, content: &str, expected_mtime: Option<u64>) -> Result<u64, String> {
    if let Some(expected) = expected_mtime {
        if let Some(current) = file_mtime_millis(canonical) {
            if current != expected {
                return Err(EXTERNAL_CHANGE_CONFLICT.to_string());
            }
        }
    }
    // write_atomic returns the written content's own mtime (captured pre-rename,
    // preserved across it), so there's no racy post-rename stat that could pick
    // up an external replace's mtime.
    write_atomic(canonical, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn write_file(
    path: String,
    content: String,
    expected_mtime: Option<u64>,
    state: State<'_, WorkspaceState>,
) -> Result<u64, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    write_checked(&canonical, &content, expected_mtime)
}

#[tauri::command]
pub(crate) fn create_file(
    path: String,
    content: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let new_path = validate_new_path(root, &path)?;
    if new_path.exists() {
        return Err("file already exists".to_string());
    }
    write_atomic(&new_path, &content).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn rename_file(
    old_path: String,
    new_path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical_old = validate_path(root, &old_path)?;
    let new = validate_new_path(root, &new_path)?;
    if new.exists() {
        return Err("a file with that name already exists".to_string());
    }
    std::fs::rename(&canonical_old, &new).map_err(|e| e.to_string())
}

pub(crate) fn copy_entry_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(src).map_err(|e| e.to_string())?;
    let file_type = metadata.file_type();

    if file_type.is_symlink() {
        return Err("symlinks are not supported when duplicating entries".to_string());
    }

    if file_type.is_dir() {
        std::fs::create_dir(dest).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let child_src = entry.path();
            let child_dest = dest.join(entry.file_name());
            copy_entry_recursive(&child_src, &child_dest)?;
        }
        return Ok(());
    }

    std::fs::copy(src, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn duplicate_entry(
    src_path: String,
    dest_path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = {
        let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    let src = validate_path(&root, &src_path)?;
    let dest = validate_new_path(&root, &dest_path)?;
    if dest.exists() {
        return Err("a file with that name already exists".to_string());
    }
    copy_entry_recursive(&src, &dest)
}

#[tauri::command]
pub(crate) fn trash_file(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    trash::delete(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_dir(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let new_path = validate_new_path(root, &path)?;
    if new_path.exists() {
        return Err("directory already exists".to_string());
    }
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
}

/// Create a directory (and all ancestors) inside the workspace, succeeding if
/// it already exists. Unlike `create_dir`, the parent need not exist yet.
#[tauri::command]
pub(crate) fn ensure_dir(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);
    let new_path = validate_new_dir_path(&root, &path)?;
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn write_checked_rejects_stale_mtime_without_clobbering() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        // The client thinks it last saw an older mtime than what's on disk now.
        let stale = file_mtime_millis(&path).unwrap().wrapping_sub(5_000);

        assert_eq!(
            write_checked(&path, "v2", Some(stale)),
            Err(EXTERNAL_CHANGE_CONFLICT.to_string())
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "v1", "file must be untouched");
    }

    #[test]
    fn read_versioned_checked_returns_content_and_a_stable_mtime() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "hello").unwrap();
        let expected = file_mtime_millis(&path).unwrap();

        let versioned = read_versioned_checked(&path).unwrap();
        assert_eq!(versioned.content, "hello");
        assert_eq!(versioned.mtime, expected, "token must match the read content");

        // The token is a valid optimistic-concurrency mtime: an unchanged file
        // still carries it, so a save with this token would not conflict.
        let unchanged = file_mtime_millis(&path).unwrap();
        assert_eq!(versioned.mtime, unchanged);
    }

    #[test]
    fn read_stable_returns_content_when_mtime_is_stable_across_the_read() {
        let result = read_stable(|| Some(1000), || Ok("body".to_string()), 5).unwrap();
        assert_eq!(result.content, "body");
        assert_eq!(result.mtime, 1000);
    }

    #[test]
    fn read_stable_errors_when_the_file_never_stops_changing() {
        // Every stat returns a different value, so no read is ever consistent.
        let counter = std::cell::Cell::new(0u64);
        let stat = || {
            let n = counter.get();
            counter.set(n + 1);
            Some(n)
        };
        assert_eq!(
            read_stable(stat, || Ok("body".to_string()), 5),
            Err("file changed during read".to_string())
        );
    }

    #[test]
    fn read_stable_succeeds_on_a_later_retry_once_the_file_settles() {
        // Unstable for the first pair, stable afterward.
        let seq = std::cell::RefCell::new(vec![1u64, 2, 7, 7, 7, 7]);
        let stat = || Some(seq.borrow_mut().remove(0));
        let result = read_stable(stat, || Ok("settled".to_string()), 5).unwrap();
        assert_eq!(result.content, "settled");
        assert_eq!(result.mtime, 7);
    }

    #[test]
    fn read_versioned_checked_rejects_oversized_files() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("huge.md");
        // A sparse file over the limit — set_len doesn't allocate real bytes.
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_READ_FILE_BYTES + 1).unwrap();
        drop(file);

        assert_eq!(
            read_versioned_checked(&path),
            Err(FILE_TOO_LARGE.to_string())
        );
    }

    #[test]
    fn write_checked_writes_when_mtime_matches() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        let current = file_mtime_millis(&path).unwrap();

        let new_mtime = write_checked(&path, "v2", Some(current)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "v2");
        assert!(new_mtime >= current);
        // The returned token is the written content's own mtime — a save with it
        // as expected_mtime finds the file unchanged and does not conflict.
        assert_eq!(new_mtime, file_mtime_millis(&path).unwrap());
        write_checked(&path, "v3", Some(new_mtime)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "v3");
    }

    #[test]
    fn write_checked_forces_write_when_expected_is_none() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        // Simulate an external change by pretending disk is newer; None bypasses.
        write_checked(&path, "v2", None).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "v2");
    }

    #[test]
    fn copy_entry_recursive_copies_nested_directories() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("hello");
        let nested = src.join("images");
        let dest = dir.path().join("hello-copy");

        fs::create_dir(&src).unwrap();
        fs::create_dir(&nested).unwrap();
        fs::write(src.join("index.md"), "# Hello").unwrap();
        fs::write(nested.join("cover.png"), "png").unwrap();

        copy_entry_recursive(&src, &dest).unwrap();

        assert_eq!(fs::read_to_string(dest.join("index.md")).unwrap(), "# Hello");
        assert_eq!(fs::read_to_string(dest.join("images").join("cover.png")).unwrap(), "png");
    }
}
