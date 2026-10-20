use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::path::Path;

use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::paths::{
    create_sibling_temp_dir, create_sibling_temp_file, ensure_within, validate_new_dir_path,
    validate_new_path, validate_path, write_atomic, ExistenceMode, TempPathGuard,
};
use crate::state::{run_blocking, WorkspaceState};

/// Marker returned when the on-disk file changed since the client last read or
/// wrote it. The frontend matches on this exact string to open the
/// external-change conflict prompt instead of silently clobbering the change.
pub(crate) const EXTERNAL_CHANGE_CONFLICT: &str = "EXTERNAL_CHANGE_CONFLICT";

/// Marker returned when a versioned save targets a file that no longer exists —
/// deleted, or renamed/moved by another program while it was open. The
/// frontend matches on this to offer "recreate it / discard my edits" instead
/// of failing every autosave (and every switch, close and quit) with a
/// generic error.
pub(crate) const FILE_MISSING: &str = "FILE_MISSING";

/// Marker returned when a file is too large to load into the editor. The
/// frontend matches on this to show a "file too large" message instead of the
/// generic open-failed toast.
pub(crate) const FILE_TOO_LARGE: &str = "FILE_TOO_LARGE";

/// Upper bound on files loaded into the editor. Prose markdown is far smaller;
/// this guards against accidentally opening a huge or binary file and OOMing
/// the whole `read_to_string` into memory + across the IPC bridge.
const MAX_READ_FILE_BYTES: u64 = 25 * 1024 * 1024;

/// Read text without trusting a separate metadata check: even if the file
/// grows after `open`, `take(MAX + 1)` bounds allocation and lets us detect the
/// over-limit byte. Exact-limit files remain valid.
fn read_text_bounded(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let initial_capacity = file
        .metadata()
        .ok()
        .map(|metadata| metadata.len().min(MAX_READ_FILE_BYTES) as usize)
        .unwrap_or(0);
    let mut bytes = Vec::with_capacity(initial_capacity);
    file.take(MAX_READ_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_READ_FILE_BYTES {
        return Err(FILE_TOO_LARGE.to_string());
    }
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

/// The optimistic-concurrency token: a hash of the file's content, as a decimal
/// string. Unlike an mtime it has no granularity (two writes in the same
/// millisecond produce distinct tokens iff their content differs) and no
/// read/write TOCTOU (it is intrinsic to the bytes, not a separate stat).
/// Returned as a *string* because the raw u64 exceeds JS's safe-integer range
/// (2^53) for ~all inputs and would lose precision crossing the JSON bridge as
/// a `number` — the token must round-trip byte-exact. Session-scoped (re-seeded
/// on every read), so a non-portable hash is fine; matches `revision.rs`.
fn content_version(content: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish().to_string()
}

/// The token for the file currently at `path`, or `None` when it can't be read
/// as UTF-8 text (missing/unreadable/binary). Callers decide how to treat
/// `None`: `write_checked` conflicts on it when a token was expected.
fn current_version(path: &Path) -> Option<String> {
    read_text_bounded(path).ok().map(|c| content_version(&c))
}

// Every file command is async and does its IO through `run_blocking`, off the
// main thread, with the workspace root cloned out of its mutex first.

#[tauri::command]
pub(crate) async fn read_file(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let canonical = validate_path(&root, &path)?;
        read_text_bounded(&canonical)
    })
    .await
}

/// A file's content together with its content-hash version token. Because the
/// token is derived from the same bytes we return, the two are trivially
/// consistent — there's no read-time TOCTOU to guard against.
#[derive(Serialize, TS, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct VersionedFile {
    pub(crate) content: String,
    // Opaque decimal content-hash token. Kept as a string so the u64 value
    // round-trips the JSON bridge without losing precision.
    pub(crate) version: String,
}

/// Core of `read_file_versioned`, factored out of the Tauri command so it can
/// be unit-tested without a `WorkspaceState`.
fn read_versioned_checked(canonical: &Path) -> Result<VersionedFile, String> {
    let content = read_text_bounded(canonical)?;
    let version = content_version(&content);
    Ok(VersionedFile { content, version })
}

#[tauri::command]
pub(crate) async fn read_file_versioned(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<VersionedFile, String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let canonical = validate_path(&root, &path)?;
        read_versioned_checked(&canonical)
    })
    .await
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
    let root = state.workspace_root_path()?;
    // This reads the whole markdown corpus.
    run_blocking(move || {
        let mut files = Vec::with_capacity(paths.len());
        for path in paths {
            let Ok(canonical) = validate_path(&root, &path) else {
                continue;
            };
            let Ok(content) = read_text_bounded(&canonical) else {
                continue;
            };
            files.push(BulkFileContent { path, content });
        }
        Ok(files)
    })
    .await
}

/// Optimistic-concurrency write, factored out of the Tauri command so it can be
/// unit-tested without a `WorkspaceState`. When `expected_version` is `Some`,
/// the check runs against the *current on-disk* content immediately before the
/// rename (via `write_atomic`'s verify hook), refusing with
/// `EXTERNAL_CHANGE_CONFLICT` if the content's hash no longer matches — so an
/// external edit during staging is caught, not clobbered. A target that
/// vanished refuses with `FILE_MISSING` instead of being silently recreated.
/// Returns the written content's token. `None` forces the write (conflict
/// resolution / untracked writes).
fn write_checked(
    canonical: &Path,
    content: &str,
    expected_version: Option<&str>,
) -> Result<String, String> {
    write_atomic(canonical, content, |target| match expected_version {
        // Proceed only when the current on-disk content is readable AND its
        // token matches. A target made unreadable or replaced with non-UTF-8
        // during staging conflicts; one that was deleted is reported as such.
        Some(expected) => match current_version(target) {
            Some(current) if current == expected => Ok(()),
            None if is_missing(target) => Err(FILE_MISSING.to_string()),
            _ => Err(EXTERNAL_CHANGE_CONFLICT.to_string()),
        },
        // No expected token forces the write (conflict resolution / new files).
        None => Ok(()),
    })?;
    Ok(content_version(content))
}

fn is_missing(path: &Path) -> bool {
    matches!(
        std::fs::symlink_metadata(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound
    )
}

/// The write target, or `FILE_MISSING` when it is a workspace path that simply
/// doesn't exist any more (its folder may be gone too). Anything else that
/// fails validation — a path outside the workspace — keeps its own error.
fn resolve_write_target(root: &Path, requested: &str) -> Result<std::path::PathBuf, String> {
    validate_path(root, requested).map_err(|error| {
        let inside = ensure_within(
            root,
            Path::new(requested),
            ExistenceMode::AncestorMayBeMissing,
            "invalid path",
        )
        .is_ok();
        if inside && is_missing(Path::new(requested)) {
            FILE_MISSING.to_string()
        } else {
            error
        }
    })
}

#[tauri::command]
pub(crate) async fn write_file(
    path: String,
    content: String,
    expected_version: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let canonical = resolve_write_target(&root, &path)?;
        write_checked(&canonical, &content, expected_version.as_deref())
    })
    .await
}

/// Create a new file; fails if it already exists. Returns the content's
/// version token, so an editor that recreates its vanished file can keep
/// saving with the usual optimistic-concurrency check.
#[tauri::command]
pub(crate) async fn create_file(
    path: String,
    content: String,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let new_path = validate_new_path(&root, &path)?;
        create_new_checked(&new_path, &content)?;
        Ok(content_version(&content))
    })
    .await
}

fn map_exclusive_install_error(error: std::io::Error, collision_message: &str) -> String {
    if error.kind() == std::io::ErrorKind::AlreadyExists {
        collision_message.to_string()
    } else {
        error.to_string()
    }
}

fn install_exclusive(
    staging: &Path,
    destination: &Path,
    collision_message: &str,
) -> Result<(), String> {
    renamore::rename_exclusive(staging, destination)
        .map_err(|error| map_exclusive_install_error(error, collision_message))
}

/// Stage a complete file and atomically make it visible only if the final path
/// is still unused. The injected hook makes destination races deterministic in
/// tests without weakening the production implementation.
fn create_new_checked_with(
    new_path: &Path,
    write_content: impl FnOnce(&mut std::fs::File) -> std::io::Result<()>,
    before_commit: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let (mut file, mut guard) = create_sibling_temp_file(new_path, "create")?;
    write_content(&mut file).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    before_commit()?;
    install_exclusive(guard.path(), new_path, "file already exists")?;
    guard.disarm();
    Ok(())
}

fn create_new_checked(new_path: &Path, content: &str) -> Result<(), String> {
    create_new_checked_with(
        new_path,
        |file| file.write_all(content.as_bytes()),
        || Ok(()),
    )
}

#[tauri::command]
pub(crate) async fn rename_file(
    old_path: String,
    new_path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let canonical_old = validate_path(&root, &old_path)?;
        let new = validate_new_path(&root, &new_path)?;
        rename_checked(&canonical_old, &new)
    })
    .await
}

/// Rename `old` to `new`, refusing to replace an existing entry — except the
/// entry itself: on a case-insensitive filesystem (the macOS and Windows
/// defaults) `Notes.md` → `notes.md` finds the "destination" already present,
/// because it *is* the source, so the exclusive rename refused every
/// case-only rename. Those go through a unique temporary name instead.
fn rename_checked(old: &Path, new: &Path) -> Result<(), String> {
    const COLLISION: &str = "a file with that name already exists";
    if is_same_entry_by_another_case(old, new) {
        let staging = crate::paths::sibling_temp_path(old, "rename")?;
        std::fs::rename(old, &staging).map_err(|e| e.to_string())?;
        return install_exclusive(&staging, new, COLLISION).inspect_err(|_| {
            // Put the entry back under its original name.
            let _ = std::fs::rename(&staging, old);
        });
    }
    install_exclusive(old, new, COLLISION)
}

fn is_same_entry_by_another_case(old: &Path, new: &Path) -> bool {
    let (Some(old_name), Some(new_name)) = (old.file_name(), new.file_name()) else {
        return false;
    };
    let old_name = old_name.to_string_lossy();
    let new_name = new_name.to_string_lossy();
    if old_name == new_name || old_name.to_lowercase() != new_name.to_lowercase() {
        return false;
    }
    let same_parent = match (old.parent(), new.parent()) {
        (Some(a), Some(b)) => std::fs::canonicalize(a).ok() == std::fs::canonicalize(b).ok(),
        _ => false,
    };
    same_parent && same_file(old, new)
}

#[cfg(unix)]
fn same_file(a: &Path, b: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (std::fs::symlink_metadata(a), std::fs::symlink_metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

#[cfg(not(unix))]
fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn copy_file_exclusive(src: &Path, dest: &Path) -> Result<(), String> {
    let metadata = std::fs::metadata(src).map_err(|e| e.to_string())?;
    let mut input = std::fs::File::open(src).map_err(|e| e.to_string())?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dest)
        .map_err(|e| e.to_string())?;
    std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
    output.flush().map_err(|e| e.to_string())?;
    output.sync_all().map_err(|e| e.to_string())?;
    drop(output);
    std::fs::set_permissions(dest, metadata.permissions()).map_err(|e| e.to_string())
}

fn copy_entry_recursive(src: &Path, dest: &Path) -> Result<(), String> {
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
        std::fs::set_permissions(dest, metadata.permissions()).map_err(|e| e.to_string())?;
        return Ok(());
    }

    copy_file_exclusive(src, dest)
}

fn copy_directory_contents(src: &Path, dest: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(src).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("source is not a duplicatable directory".to_string());
    }
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        copy_entry_recursive(&entry.path(), &dest.join(entry.file_name()))?;
    }
    std::fs::set_permissions(dest, metadata.permissions()).map_err(|e| e.to_string())
}

fn duplicate_checked_with(
    src: &Path,
    dest: &Path,
    before_commit: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(src).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("symlinks are not supported when duplicating entries".to_string());
    }

    let mut guard: TempPathGuard = if metadata.is_dir() {
        let guard = create_sibling_temp_dir(dest, "duplicate")?;
        copy_directory_contents(src, guard.path())?;
        guard
    } else {
        let (mut output, guard) = create_sibling_temp_file(dest, "duplicate")?;
        let mut input = std::fs::File::open(src).map_err(|e| e.to_string())?;
        std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
        output.sync_all().map_err(|e| e.to_string())?;
        drop(output);
        std::fs::set_permissions(guard.path(), metadata.permissions())
            .map_err(|e| e.to_string())?;
        guard
    };

    before_commit()?;
    install_exclusive(guard.path(), dest, "a file with that name already exists")?;
    guard.disarm();
    Ok(())
}

#[tauri::command]
pub(crate) async fn duplicate_entry(
    src_path: String,
    dest_path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let src = validate_path(&root, &src_path)?;
        let dest = validate_new_path(&root, &dest_path)?;
        duplicate_checked_with(&src, &dest, || Ok(()))
    })
    .await
}

#[tauri::command]
pub(crate) async fn trash_file(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let canonical = validate_path(&root, &path)?;
        trash::delete(&canonical).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub(crate) async fn create_dir(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let new_path = validate_new_path(&root, &path)?;
        std::fs::create_dir(&new_path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "directory already exists".to_string()
            } else {
                error.to_string()
            }
        })
    })
    .await
}

/// Create a directory (and all ancestors) inside the workspace, succeeding if
/// it already exists. Unlike `create_dir`, the parent need not exist yet.
#[tauri::command]
pub(crate) async fn ensure_dir(
    path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = state.workspace_root_path()?;
    run_blocking(move || {
        let new_path = validate_new_dir_path(&root, &path)?;
        std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn content_version_tracks_content_not_time() {
        // Same content → same token (even across writes at different times);
        // different content → different token. This is what fixes the mtime
        // millisecond-collision class.
        assert_eq!(content_version("hello"), content_version("hello"));
        assert_ne!(content_version("hello"), content_version("world"));
    }

    #[test]
    fn versioned_file_serializes_the_token_as_a_full_precision_json_string() {
        // The regression: a u64 token exported as a JSON *number* is parsed by
        // JS as an f64 and loses precision above 2^53, so the round-tripped
        // token mismatches and every save false-conflicts. Serializing through
        // the exact serde_json path the Tauri bridge uses must emit the token
        // as a quoted string with all its digits intact.
        let token = content_version("hello");
        let vf = VersionedFile {
            content: "hello".to_string(),
            version: token.clone(),
        };
        let json = serde_json::to_string(&vf).unwrap();
        assert!(
            json.contains(&format!("\"version\":\"{token}\"")),
            "token must serialize as a quoted string, got: {json}"
        );
        // And the digits are the full u64, not a rounded value.
        assert!(token.len() >= 19);
    }

    #[test]
    fn content_version_is_a_string_that_round_trips_a_large_hash_exactly() {
        // The token must survive the JSON bridge as a JS string. The raw u64
        // hash exceeds JS's 2^53 safe-integer range for essentially all inputs
        // (a `number` would round it and break every save — the regression this
        // fixes). Assert it's a plain decimal string equal to the full u64.
        let token = content_version("hello");
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        "hello".hash(&mut hasher);
        assert_eq!(token, hasher.finish().to_string());
        // Sanity: this hash is indeed outside JS safe-integer range.
        assert!(token.parse::<u64>().unwrap() > (1u64 << 53));
    }

    #[test]
    fn rename_checked_handles_a_case_only_rename() {
        let dir = TempDir::new().unwrap();
        let old = dir.path().join("Notes.md");
        fs::write(&old, "hello").unwrap();
        let new = dir.path().join("notes.md");

        rename_checked(&old, &new).unwrap();

        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["notes.md".to_string()]);
        assert_eq!(fs::read_to_string(&new).unwrap(), "hello");
    }

    #[test]
    fn rename_checked_still_refuses_to_replace_another_file() {
        let dir = TempDir::new().unwrap();
        let old = dir.path().join("a.md");
        let other = dir.path().join("b.md");
        fs::write(&old, "a").unwrap();
        fs::write(&other, "b").unwrap();
        assert!(rename_checked(&old, &other).is_err());
        assert_eq!(fs::read_to_string(&other).unwrap(), "b");
        assert_eq!(fs::read_to_string(&old).unwrap(), "a");
    }

    #[test]
    fn write_checked_rejects_a_stale_version_without_clobbering() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        // The client's expected token is for content that's no longer on disk.
        let stale = content_version("something the client last saw");

        assert_eq!(
            write_checked(&path, "v2", Some(&stale)),
            Err(EXTERNAL_CHANGE_CONFLICT.to_string())
        );
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "v1",
            "file must be untouched"
        );
    }

    #[test]
    fn write_checked_reports_a_target_deleted_mid_save_as_missing() {
        // With an expected token, a target deleted before the write must be
        // reported (not silently recreated) — as missing, not as a conflict.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("gone.md");
        let expected = content_version("original");
        assert_eq!(
            write_checked(&path, "recreated", Some(&expected)),
            Err(FILE_MISSING.to_string())
        );
        assert!(!path.exists(), "target must not be recreated");
    }

    #[test]
    fn write_checked_conflicts_when_the_target_became_unreadable() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("binary.md");
        fs::write(&path, [0xff_u8, 0xfe, 0x00]).unwrap();
        assert_eq!(
            write_checked(&path, "text", Some(&content_version("original"))),
            Err(EXTERNAL_CHANGE_CONFLICT.to_string())
        );
    }

    #[test]
    fn resolve_write_target_reports_a_vanished_workspace_file_as_missing() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        let gone = root.join("notes").join("gone.md");
        assert_eq!(
            resolve_write_target(root, gone.to_str().unwrap()),
            Err(FILE_MISSING.to_string())
        );
    }

    #[test]
    fn resolve_write_target_keeps_the_error_for_paths_outside_the_workspace() {
        let workspace = TempDir::new().unwrap();
        let elsewhere = TempDir::new().unwrap();
        let outside = elsewhere.path().join("gone.md");
        let result = resolve_write_target(workspace.path(), outside.to_str().unwrap());
        assert!(result.is_err());
        assert_ne!(result, Err(FILE_MISSING.to_string()));
    }

    #[test]
    fn read_versioned_checked_returns_content_and_its_own_token() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "hello").unwrap();

        let versioned = read_versioned_checked(&path).unwrap();
        assert_eq!(versioned.content, "hello");
        assert_eq!(versioned.version, content_version("hello"));
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
        assert_eq!(
            current_version(&path),
            None,
            "version verification must use the same bounded reader"
        );
    }

    #[test]
    fn bounded_reader_accepts_the_exact_limit_and_rejects_the_next_byte() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("boundary.md");
        fs::write(&path, vec![b'a'; MAX_READ_FILE_BYTES as usize]).unwrap();
        assert_eq!(
            read_text_bounded(&path).unwrap().len(),
            MAX_READ_FILE_BYTES as usize
        );

        let mut file = fs::OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"b").unwrap();
        assert_eq!(read_text_bounded(&path), Err(FILE_TOO_LARGE.to_string()));
    }

    #[test]
    fn bounded_reader_rejects_invalid_utf8() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("binary.md");
        fs::write(&path, [0xff, 0xfe]).unwrap();

        assert!(read_text_bounded(&path).is_err());
        assert_eq!(current_version(&path), None);
    }

    #[test]
    fn write_checked_writes_when_the_version_matches_and_round_trips_its_token() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        let current = content_version("v1");

        let token = write_checked(&path, "v2", Some(&current)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "v2");
        // The returned token is the written content's own — a follow-up save
        // carrying it finds the file unchanged and does not conflict.
        assert_eq!(token, content_version("v2"));
        write_checked(&path, "v3", Some(&token)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "v3");
    }

    #[test]
    fn write_checked_forces_write_when_expected_is_none() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "v1").unwrap();
        // None bypasses the version check (conflict resolution / untracked write).
        write_checked(&path, "v2", None).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "v2");
    }

    #[test]
    fn create_new_checked_writes_a_fresh_file_and_rejects_an_existing_one() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");

        create_new_checked(&path, "hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");

        // A second create must fail atomically without touching the content.
        assert_eq!(
            create_new_checked(&path, "clobber"),
            Err("file already exists".to_string())
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
    }

    #[test]
    fn create_new_checked_removes_partial_staging_after_write_failure() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");

        let result = create_new_checked_with(
            &path,
            |file| {
                file.write_all(b"partial")?;
                Err(std::io::Error::other("injected failure"))
            },
            || Ok(()),
        );

        assert_eq!(result, Err("injected failure".to_string()));
        assert!(!path.exists(), "a partial final file must never be visible");
        assert!(
            fs::read_dir(dir.path()).unwrap().next().is_none(),
            "staging file must be removed"
        );
    }

    #[test]
    fn create_new_checked_does_not_clobber_a_destination_created_before_commit() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");

        let result = create_new_checked_with(
            &path,
            |file| file.write_all(b"ours"),
            || {
                fs::write(&path, "external").map_err(|e| e.to_string())?;
                Ok(())
            },
        );

        assert_eq!(result, Err("file already exists".to_string()));
        assert_eq!(fs::read_to_string(&path).unwrap(), "external");
        let entries: Vec<_> = fs::read_dir(dir.path()).unwrap().flatten().collect();
        assert_eq!(entries.len(), 1, "staging file must be cleaned up");
    }

    #[test]
    fn exclusive_rename_preserves_source_and_existing_destination() {
        let dir = TempDir::new().unwrap();
        let source = dir.path().join("source.md");
        let destination = dir.path().join("destination.md");
        fs::write(&source, "source").unwrap();
        fs::write(&destination, "destination").unwrap();

        assert_eq!(
            install_exclusive(&source, &destination, "collision"),
            Err("collision".to_string())
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), "source");
        assert_eq!(fs::read_to_string(&destination).unwrap(), "destination");
    }

    #[test]
    fn duplicate_checked_copies_nested_directories() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("hello");
        let nested = src.join("images");
        let dest = dir.path().join("hello-copy");

        fs::create_dir(&src).unwrap();
        fs::create_dir(&nested).unwrap();
        fs::write(src.join("index.md"), "# Hello").unwrap();
        fs::write(nested.join("cover.png"), "png").unwrap();

        duplicate_checked_with(&src, &dest, || Ok(())).unwrap();

        assert_eq!(
            fs::read_to_string(dest.join("index.md")).unwrap(),
            "# Hello"
        );
        assert_eq!(
            fs::read_to_string(dest.join("images").join("cover.png")).unwrap(),
            "png"
        );
    }

    #[test]
    fn duplicate_checked_does_not_clobber_a_destination_created_before_commit() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("source.md");
        let dest = dir.path().join("copy.md");
        fs::write(&src, "source").unwrap();

        let result = duplicate_checked_with(&src, &dest, || {
            fs::write(&dest, "external").map_err(|e| e.to_string())
        });

        assert_eq!(
            result,
            Err("a file with that name already exists".to_string())
        );
        assert_eq!(fs::read_to_string(&dest).unwrap(), "external");
        assert_eq!(fs::read_to_string(&src).unwrap(), "source");
        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            entries.iter().all(|name| !name.starts_with(".~")),
            "staging entry leaked: {entries:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn duplicate_checked_cleans_staged_directory_after_recursive_copy_failure() {
        use std::os::unix::fs::symlink;

        let dir = TempDir::new().unwrap();
        let src = dir.path().join("source");
        let dest = dir.path().join("copy");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("note.md"), "note").unwrap();
        symlink(src.join("note.md"), src.join("link.md")).unwrap();

        assert_eq!(
            duplicate_checked_with(&src, &dest, || Ok(())),
            Err("symlinks are not supported when duplicating entries".to_string())
        );
        assert!(!dest.exists());
        let entries: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            entries.iter().all(|name| !name.starts_with(".~")),
            "staging directory leaked: {entries:?}"
        );
    }
}
