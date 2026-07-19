use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::Path;

use crate::paths::{is_markdown_path, should_skip_walk_entry};

pub(crate) fn hash_workspace_entry(path: &Path, root: &Path, hasher: &mut DefaultHasher) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };

    path.strip_prefix(root).unwrap_or(path).hash(hasher);
    metadata.is_dir().hash(hasher);
    metadata.len().hash(hasher);
    if let Ok(modified) = metadata.modified() {
        modified.hash(hasher);
    }
}

pub(crate) fn hash_workspace_dir(path: &Path, root: &Path, hasher: &mut DefaultHasher) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };

    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        // Keep dot entries, matching the canonical tree (`workspace::tree`): a
        // dot-path Markdown file (e.g. `.hidden/note.md`) can be opened as the
        // active editor via Files mode, so its content must be part of the
        // revision or an external edit to it would go undetected. Noise dirs
        // (`.git`, `node_modules`, …) are still skipped by `is_noise_dir`.
        if should_skip_walk_entry(&name, file_type.is_symlink(), true) {
            continue;
        }

        if file_type.is_dir() {
            // Don't hash the directory entry itself: markdown file paths already
            // encode directory structure (via strip_prefix), so hashing dir names
            // would only produce spurious revision bumps when non-markdown-only
            // directories are added, removed, or renamed.
            hash_workspace_dir(&entry_path, root, hasher);
            continue;
        }

        if is_markdown_path(&entry_path) {
            hash_workspace_entry(&entry_path, root, hasher);
        }
    }
}

pub(crate) fn compute_workspace_revision(root: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    hash_workspace_entry(root, root, &mut hasher);
    hash_workspace_dir(root, root, &mut hasher);
    hasher.finish().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn compute_workspace_revision_changes_for_markdown_edits() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("hello.md");
        fs::write(&file, "# Hello").unwrap();
        let before = compute_workspace_revision(dir.path());

        fs::write(&file, "# Hello\n\nUpdated").unwrap();

        assert_ne!(compute_workspace_revision(dir.path()), before);
    }

    #[test]
    fn compute_workspace_revision_changes_for_tree_edits() {
        let dir = TempDir::new().unwrap();
        let before = compute_workspace_revision(dir.path());

        fs::create_dir_all(dir.path().join("posts")).unwrap();
        fs::write(dir.path().join("posts").join("hello.md"), "# Hello").unwrap();

        assert_ne!(compute_workspace_revision(dir.path()), before);
    }

    #[test]
    fn compute_workspace_revision_ignores_markdown_inside_noise_dirs() {
        // The canonical tree never shows node_modules/target/dist etc.
        // (shared walker rule) — markdown churn inside them must not bump the
        // revision either, or every poll would trigger a refresh for files
        // the user can't even see.
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("real.md"), "# Real").unwrap();
        let noise = dir.path().join("node_modules").join("pkg");
        fs::create_dir_all(&noise).unwrap();
        let before = compute_workspace_revision(dir.path());

        fs::write(noise.join("README.md"), "# Generated").unwrap();

        assert_eq!(compute_workspace_revision(dir.path()), before);
    }

    #[test]
    fn compute_workspace_revision_changes_for_dot_directory_markdown_edits() {
        // A dot-path markdown file is visible in Files mode and can be the active
        // editor, so an external edit must bump the revision (unlike noise dirs).
        let dir = TempDir::new().unwrap();
        let hidden = dir.path().join(".hidden");
        fs::create_dir_all(&hidden).unwrap();
        let file = hidden.join("note.md");
        fs::write(&file, "# Hidden").unwrap();
        let before = compute_workspace_revision(dir.path());

        fs::write(&file, "# Hidden\n\nUpdated").unwrap();

        assert_ne!(compute_workspace_revision(dir.path()), before);
    }

    #[test]
    fn compute_workspace_revision_ignores_non_markdown_file_edits() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("image.png");
        fs::write(&file, "png").unwrap();
        let before = compute_workspace_revision(dir.path());

        fs::write(&file, "updated").unwrap();

        assert_eq!(compute_workspace_revision(dir.path()), before);
    }

    #[test]
    fn compute_workspace_revision_ignores_non_markdown_file_creation_in_subdir() {
        // Creating a non-markdown file inside a subdirectory used to change the
        // directory's mtime and thus bump the revision even though no markdown
        // content changed. Regression test for the directory-mtime fix.
        let dir = TempDir::new().unwrap();
        let subdir = dir.path().join("assets");
        fs::create_dir_all(&subdir).unwrap();
        fs::write(subdir.join("style.css"), "body {}").unwrap();
        let before = compute_workspace_revision(dir.path());

        // Adding a new non-markdown file must not change the revision.
        fs::write(subdir.join("extra.css"), "h1 {}").unwrap();

        assert_eq!(compute_workspace_revision(dir.path()), before);
    }
}
