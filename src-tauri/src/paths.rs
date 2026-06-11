use std::io::Write;
use std::path::{Path, PathBuf};

pub(crate) fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("md") | Some("mdx")
    )
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

/// Write content atomically: write to a sibling temp file then rename over the target.
pub(crate) fn write_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no parent dir"))?;
    let tmp_name = format!(
        ".~{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    );
    let tmp_path = dir.join(&tmp_name);

    let mut file = std::fs::File::create(&tmp_path)?;
    file.write_all(content.as_bytes())?;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    std::fs::rename(&tmp_path, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        e
    })
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
