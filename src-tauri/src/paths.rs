use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Process-wide counter making each atomic-write temp file unique.
static TMP_WRITE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("md") | Some("mdx")
    )
}

/// Directories that are universally noise across the developer ecosystem and
/// should never be traversed by any workspace walker (tree, revision hashing,
/// search). Mirrors the TS `NOISE_DIRS` list previously applied client-side.
const NOISE_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "vendor",
    ".cache",
    "__pycache__",
    ".tox",
    ".venv",
    "venv",
    "out",
    ".turbo",
    ".vercel",
    ".parcel-cache",
];

fn is_noise_dir(name: &str) -> bool {
    NOISE_DIRS.iter().any(|n| *n == name)
}

/// The one shared skip rule for every recursive workspace walker. Noise
/// directories are never traversed and symlinks are never followed, in every
/// walker. `keep_dot_entries` is the single policy knob: the canonical tree
/// keeps dot-entries (they are visible in Files mode), while revision hashing
/// and search skip them — so `.github/notes.md` can appear in the tree
/// without ever bumping the revision or matching a search.
pub(crate) fn should_skip_walk_entry(name: &str, is_symlink: bool, keep_dot_entries: bool) -> bool {
    if is_symlink || is_noise_dir(name) {
        return true;
    }
    !keep_dot_entries && name.starts_with('.')
}

/// How `ensure_within` resolves a candidate that may not be on disk yet.
pub(crate) enum ExistenceMode {
    /// The candidate must exist; it is canonicalized (defeating symlinks).
    MustExist,
    /// The candidate may be missing — canonicalize when it exists,
    /// otherwise resolve `.`/`..` lexically.
    MayBeMissing,
    /// The candidate and trailing directories may be missing — containment
    /// is checked on the canonicalized nearest existing ancestor (so a
    /// symlinked ancestor can't escape), and the lexically-normalized
    /// candidate is returned.
    AncestorMayBeMissing,
}

/// THE workspace-containment check: resolve `candidate` per `mode` and
/// verify it stays inside `root`. Every path-validation entry point
/// (file ops, git commit selections) funnels through here so the security
/// invariant has one implementation. `candidate_label` prefixes
/// resolution errors ("invalid path", "commit path", …).
pub(crate) fn ensure_within(
    root: &Path,
    candidate: &Path,
    mode: ExistenceMode,
    candidate_label: &str,
) -> Result<PathBuf, String> {
    let canonical_root =
        std::fs::canonicalize(root).map_err(|e| format!("workspace root: {e}"))?;
    let resolved = match mode {
        ExistenceMode::MustExist => {
            std::fs::canonicalize(candidate).map_err(|e| format!("{candidate_label}: {e}"))?
        }
        ExistenceMode::MayBeMissing => {
            if candidate.exists() {
                std::fs::canonicalize(candidate).map_err(|e| format!("{candidate_label}: {e}"))?
            } else {
                normalize_path(candidate)
            }
        }
        ExistenceMode::AncestorMayBeMissing => {
            let normalized = normalize_path(candidate);
            let mut existing_ancestor = normalized.as_path();
            while !existing_ancestor.exists() {
                existing_ancestor = existing_ancestor
                    .parent()
                    .ok_or("path has no parent directory")?;
            }
            let canonical_ancestor = std::fs::canonicalize(existing_ancestor)
                .map_err(|e| format!("{candidate_label}: {e}"))?;
            if !canonical_ancestor.starts_with(&canonical_root) {
                return Err("path is outside the opened workspace".to_string());
            }
            return Ok(normalized);
        }
    };
    if !resolved.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }
    Ok(resolved)
}

/// Canonicalize `requested` and verify it is inside `workspace_root`.
pub(crate) fn validate_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    ensure_within(
        workspace_root,
        Path::new(requested),
        ExistenceMode::MustExist,
        "invalid path",
    )
}

/// Validate that a prospective new path's parent exists inside the workspace root.
pub(crate) fn validate_new_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    let new_path = PathBuf::from(requested);
    let parent = new_path.parent().ok_or("path has no parent directory")?;
    ensure_within(
        workspace_root,
        parent,
        ExistenceMode::MustExist,
        "invalid parent path",
    )?;
    Ok(new_path)
}

/// Write content atomically: stage a sibling temp file, then rename it over the
/// target. The temp name carries the pid and a process-wide counter so two
/// concurrent writers to the same target never collide on the temp file — a
/// safety margin for any caller reached outside the `workspace_root` mutex.
///
/// `verify_before_commit` runs on the target path *after* staging but
/// *immediately before* the rename, so a caller can enforce an
/// optimistic-concurrency check against the freshest on-disk state, shrinking
/// the check→commit window to a single syscall. If it returns `Err`, the temp
/// is discarded and the target is left untouched.
///
/// The staged file inherits the target's permissions (when it exists) so an
/// atomic save never widens a private file's mode.
pub(crate) fn write_atomic(
    path: &Path,
    content: &str,
    verify_before_commit: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or("no parent dir for atomic write")?;
    let tmp_name = format!(
        ".~{}.tmp.{}-{}",
        path.file_name().unwrap_or_default().to_string_lossy(),
        std::process::id(),
        TMP_WRITE_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let tmp_path = dir.join(&tmp_name);

    // Remove the temp file on any early return after creation (a failed
    // write/verify/rename), so a uniquely-named partial file is never left
    // behind. Disarmed only after a successful rename consumes it.
    struct TmpGuard(Option<PathBuf>);
    impl Drop for TmpGuard {
        fn drop(&mut self) {
            if let Some(path) = self.0.take() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    let mut guard = TmpGuard(Some(tmp_path.clone()));

    let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);

    // Preserve the existing target's permissions on the replacement so a save
    // never widens a 0600 file to 0644. New files keep the default.
    if let Ok(meta) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&tmp_path, meta.permissions());
    }

    // Last chance to reject before we overwrite — runs against the current
    // on-disk target, so the optimistic-concurrency check sees the freshest
    // state and the overwrite window is just this call plus the rename.
    verify_before_commit(path)?;

    std::fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    guard.0 = None; // rename consumed the temp file; nothing to clean up.
    Ok(())
}

/// Normalize a path to forward-slash separators for JSON serialization.
/// The frontend treats `node.path` as a forward-slash string everywhere it
/// splits on "/" (sidebar display, recent files, image resolution, etc.); on
/// Windows native backslashes would break those helpers, so every path that
/// crosses the bridge into JS goes through this.
pub(crate) fn to_slash(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Resolve `.` and `..` components without requiring the path to exist on disk.
pub(crate) fn normalize_path(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            c => out.push(c),
        }
    }
    out
}

/// Validate that a prospective directory path is absolute and rooted inside the
/// workspace, even when some trailing directories do not exist yet.
pub(crate) fn validate_new_dir_path(
    workspace_root: &Path,
    requested: &str,
) -> Result<PathBuf, String> {
    let new_path = normalize_path(Path::new(requested));
    if !new_path.is_absolute() {
        return Err("path must be absolute".to_string());
    }
    ensure_within(
        workspace_root,
        &new_path,
        ExistenceMode::AncestorMayBeMissing,
        "invalid parent path",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── write_atomic ─────────────────────────────────────────────────────────

    #[test]
    fn write_atomic_writes_content_and_leaves_no_temp_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");

        write_atomic(&path, "first", |_| Ok(())).unwrap();
        write_atomic(&path, "second", |_| Ok(())).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        // No orphaned temp files (`.~note.md.tmp.*`) remain after the renames.
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.starts_with(".~"))
            .collect();
        assert!(leftovers.is_empty(), "unexpected temp files: {leftovers:?}");
    }

    #[test]
    fn write_atomic_cleans_up_temp_when_the_write_cannot_complete() {
        // Target path is an existing directory, so the final rename fails. The
        // cleanup guard must still remove the temp file (exercises the
        // early-return-after-temp-creation path, not just rename success).
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("collides");
        fs::create_dir(&target).unwrap();

        assert!(write_atomic(&target, "content", |_| Ok(())).is_err());

        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.starts_with(".~"))
            .collect();
        assert!(leftovers.is_empty(), "temp file leaked: {leftovers:?}");
    }

    #[test]
    fn write_atomic_uses_unique_temp_names_per_call() {
        // The temp name embeds a monotonic counter, so two calls never target
        // the same temp path — the property that lets an out-of-mutex caller
        // write concurrently without colliding.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        let before = TMP_WRITE_COUNTER.load(Ordering::Relaxed);
        write_atomic(&path, "a", |_| Ok(())).unwrap();
        write_atomic(&path, "b", |_| Ok(())).unwrap();
        assert!(TMP_WRITE_COUNTER.load(Ordering::Relaxed) >= before + 2);
    }

    #[test]
    fn write_atomic_runs_verify_before_committing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, "original").unwrap();

        // A verify that rejects must leave the target untouched.
        let result = write_atomic(&path, "new", |_| Err("nope".to_string()));
        assert_eq!(result, Err("nope".to_string()));
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    }

    #[cfg(unix)]
    #[test]
    fn write_atomic_preserves_existing_file_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("private.md");
        fs::write(&path, "secret").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();

        write_atomic(&path, "updated secret", |_| Ok(())).unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "atomic save must not widen file permissions");
        assert_eq!(fs::read_to_string(&path).unwrap(), "updated secret");
    }

    // ── normalize_path ───────────────────────────────────────────────────────

    #[test]
    fn normalize_path_resolves_parent_components() {
        assert_eq!(
            normalize_path(Path::new("/a/b/../c")),
            PathBuf::from("/a/c")
        );
    }

    #[test]
    fn normalize_path_removes_current_dir_components() {
        assert_eq!(
            normalize_path(Path::new("/a/./b/./c")),
            PathBuf::from("/a/b/c")
        );
    }

    #[test]
    fn normalize_path_handles_multiple_parent_jumps() {
        assert_eq!(
            normalize_path(Path::new("/a/b/c/../../d")),
            PathBuf::from("/a/d")
        );
    }

    #[test]
    fn normalize_path_plain_path_unchanged() {
        assert_eq!(normalize_path(Path::new("/a/b/c")), PathBuf::from("/a/b/c"));
    }

    #[test]
    fn normalize_path_parent_cannot_escape_root() {
        // Popping past the root stays at root on all platforms
        assert_eq!(
            normalize_path(Path::new("/a/../../etc/passwd")),
            PathBuf::from("/etc/passwd")
        );
    }

    #[test]
    fn validate_path_contains_top_level_file_against_workspace_root_only() {
        // Amytis layout: workspace_root is the project root, tree_root is the
        // content/ subdir. A top-level file (e.g. site.config.ts) is contained
        // by the workspace root but NOT by the content root. read_file and every
        // write/rename/trash command must therefore validate against the SAME
        // (workspace) root, or a file you can open in Files mode can't be saved.
        let dir = TempDir::new().unwrap();
        let workspace_root = dir.path();
        let content_root = workspace_root.join("content");
        fs::create_dir(&content_root).unwrap();
        let top_level = workspace_root.join("site.config.ts");
        fs::write(&top_level, "export default {}").unwrap();

        assert!(validate_path(workspace_root, &top_level.to_string_lossy()).is_ok());
        assert_eq!(
            validate_path(&content_root, &top_level.to_string_lossy()),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[test]
    fn validate_new_dir_path_allows_missing_nested_directory_inside_workspace() {
        let dir = TempDir::new().unwrap();
        fs::create_dir_all(dir.path().join("posts")).unwrap();
        let target = dir.path().join("posts").join("hello-new");

        assert_eq!(
            validate_new_dir_path(dir.path(), &target.to_string_lossy()).unwrap(),
            target
        );
    }

    #[test]
    fn validate_new_dir_path_rejects_parent_escape() {
        let dir = TempDir::new().unwrap();
        let target = dir.path().join("..").join("outside").join("hello-new");

        assert_eq!(
            validate_new_dir_path(dir.path(), &target.to_string_lossy()),
            Err("path is outside the opened workspace".to_string())
        );
    }

    // ── ensure_within ────────────────────────────────────────────────────────

    #[test]
    fn ensure_within_must_exist_accepts_inside_and_rejects_outside() {
        let dir = TempDir::new().unwrap();
        let inside = dir.path().join("note.md");
        fs::write(&inside, "x").unwrap();
        assert!(ensure_within(dir.path(), &inside, ExistenceMode::MustExist, "invalid path").is_ok());

        let other = TempDir::new().unwrap();
        let outside = other.path().join("escape.md");
        fs::write(&outside, "x").unwrap();
        assert_eq!(
            ensure_within(dir.path(), &outside, ExistenceMode::MustExist, "invalid path"),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[test]
    fn ensure_within_must_exist_rejects_missing_candidate_with_label() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("missing.md");
        let err =
            ensure_within(dir.path(), &missing, ExistenceMode::MustExist, "invalid path").unwrap_err();
        assert!(err.starts_with("invalid path:"), "{err}");
    }

    #[test]
    fn ensure_within_may_be_missing_normalizes_lexically() {
        let dir = TempDir::new().unwrap();
        // Callers of MayBeMissing construct candidates by joining onto an
        // already-canonical root (see validate_git_commit_path) — mirror
        // that here so the lexical normalize compares canonical-to-canonical
        // (macOS tempdirs live behind the /var → /private/var symlink).
        let root = fs::canonicalize(dir.path()).unwrap();
        let inside_missing = root.join("sub").join("..").join("new.md");
        assert!(
            ensure_within(&root, &inside_missing, ExistenceMode::MayBeMissing, "invalid path")
                .is_ok()
        );

        let escape = root.join("..").join("outside.md");
        assert_eq!(
            ensure_within(&root, &escape, ExistenceMode::MayBeMissing, "invalid path"),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[cfg(unix)]
    #[test]
    fn ensure_within_rejects_symlink_escape() {
        // Canonicalization is the security property: a symlink inside the
        // workspace pointing outside must not pass containment.
        let workspace = TempDir::new().unwrap();
        let elsewhere = TempDir::new().unwrap();
        let secret = elsewhere.path().join("secret.md");
        fs::write(&secret, "top secret").unwrap();
        let link = workspace.path().join("innocent.md");
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        assert_eq!(
            ensure_within(workspace.path(), &link, ExistenceMode::MustExist, "invalid path"),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[cfg(unix)]
    #[test]
    fn ensure_within_ancestor_mode_rejects_symlinked_ancestor_escape() {
        let workspace = TempDir::new().unwrap();
        let elsewhere = TempDir::new().unwrap();
        let linked_dir = workspace.path().join("subdir");
        std::os::unix::fs::symlink(elsewhere.path(), &linked_dir).unwrap();
        let target = linked_dir.join("deep").join("new-folder");

        assert_eq!(
            ensure_within(
                workspace.path(),
                &target,
                ExistenceMode::AncestorMayBeMissing,
                "invalid parent path"
            ),
            Err("path is outside the opened workspace".to_string())
        );
    }
}
