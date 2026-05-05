use std::io::Write;
use std::path::{Path, PathBuf};

pub(crate) fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("md") | Some("mdx")
    )
}

/// Canonicalize `requested` and verify it is inside `workspace_root`.
pub(crate) fn validate_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let canonical_path =
        std::fs::canonicalize(requested).map_err(|e| format!("invalid path: {e}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }
    Ok(canonical_path)
}

/// Validate that a prospective new path's parent exists inside the workspace root.
pub(crate) fn validate_new_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let new_path = PathBuf::from(requested);
    let parent = new_path.parent().ok_or("path has no parent directory")?;
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|e| format!("invalid parent path: {e}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }
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
pub(crate) fn validate_new_dir_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let new_path = normalize_path(Path::new(requested));
    if !new_path.is_absolute() {
        return Err("path must be absolute".to_string());
    }

    let mut existing_ancestor = new_path.as_path();
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or("path has no parent directory")?;
    }

    let canonical_ancestor = std::fs::canonicalize(existing_ancestor)
        .map_err(|e| format!("invalid parent path: {e}"))?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }

    Ok(new_path)
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
}
