use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::paths::{should_skip_walk_entry, to_slash};
use crate::state::CachedFrontmatter;

use super::cache::read_frontmatter_meta_cached;
use super::FileNode;

/// Recursive walk producing the canonical workspace tree: every file, every
/// directory, dotfiles included. Noise directories (`.git`, `node_modules`,
/// build artefacts) are dropped by the shared walker rule in `paths.rs` so
/// every traversal (tree, revision, search) agrees. Mode filtering
/// (markdown-only for content mode, etc.) lives in TS selectors.
pub(crate) fn walk_tree(
    path: &Path,
    cache: &mut HashMap<PathBuf, CachedFrontmatter>,
) -> Vec<FileNode> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };

    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let mut nodes = Vec::new();

    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if should_skip_walk_entry(&name, file_type.is_symlink(), true) {
            continue;
        }

        if file_type.is_dir() {
            let children = walk_tree(&entry_path, cache);
            nodes.push(FileNode {
                name,
                path: to_slash(&entry_path),
                is_directory: true,
                children: Some(children),
                children_loaded: Some(true),
                extension: None,
                title: None,
                draft: None,
                content_type: None,
            });
        } else {
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            let is_markdown = ext == "md" || ext == "mdx";
            let (title, draft, content_type) = if is_markdown {
                read_frontmatter_meta_cached(&entry_path, cache)
            } else {
                (None, None, None)
            };
            nodes.push(FileNode {
                name,
                path: to_slash(&entry_path),
                is_directory: false,
                children: None,
                children_loaded: None,
                extension: if ext.is_empty() {
                    None
                } else {
                    Some(format!(".{}", ext))
                },
                title,
                draft,
                content_type,
            });
        }
    }

    nodes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Instant;
    use tempfile::TempDir;

    fn write_markdown_file(path: &Path, title: &str, body: &str) {
        let content = format!("---\ntitle: \"{title}\"\ntype: note\n---\n\n{body}\n");
        fs::write(path, content).unwrap();
    }

    fn create_large_workspace_fixture(
        dir_count: usize,
        files_per_dir: usize,
        match_every: usize,
    ) -> TempDir {
        let dir = TempDir::new().unwrap();
        let content_root = dir.path().join("content");
        fs::create_dir_all(&content_root).unwrap();

        for dir_index in 0..dir_count {
            let section_dir = content_root.join(format!("section-{dir_index:03}"));
            fs::create_dir_all(&section_dir).unwrap();

            for file_index in 0..files_per_dir {
                let path = section_dir.join(format!("entry-{file_index:03}.md"));
                let title = format!("Entry {dir_index}-{file_index}");
                let body = if (dir_index * files_per_dir + file_index).is_multiple_of(match_every) {
                    "alpha needle beta gamma"
                } else {
                    "ordinary workspace content"
                };
                write_markdown_file(&path, &title, body);
            }
        }

        dir
    }

    #[test]
    #[ignore = "profiling helper for large synthetic workspaces"]
    fn perf_walk_tree_large_workspace_fixture() {
        let dir = create_large_workspace_fixture(40, 80, 7);
        let mut cache = HashMap::new();

        let first_started = Instant::now();
        let first_tree = walk_tree(&dir.path().join("content"), &mut cache);
        let first_elapsed = first_started.elapsed();

        let second_started = Instant::now();
        let second_tree = walk_tree(&dir.path().join("content"), &mut cache);
        let second_elapsed = second_started.elapsed();

        let top_level_dirs = first_tree.iter().filter(|node| node.is_directory).count();
        assert_eq!(top_level_dirs, 40);
        assert_eq!(second_tree.len(), first_tree.len());
        eprintln!(
            "[perf-test] walk_tree fixture dirs=40 files_per_dir=80 top_level={} first={}ms second={}ms",
            top_level_dirs,
            first_elapsed.as_millis(),
            second_elapsed.as_millis()
        );
    }

    #[test]
    fn walk_tree_includes_non_markdown_files_and_dotfiles() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join("config.ts"), "export default {}").unwrap();
        fs::write(root.join(".gitignore"), "dist/").unwrap();
        write_markdown_file(&root.join("readme.md"), "Readme", "body");

        let mut cache = HashMap::new();
        let nodes = walk_tree(root, &mut cache);

        let names: Vec<&str> = nodes.iter().map(|n| n.name.as_str()).collect();
        assert!(
            names.contains(&"config.ts"),
            "should include non-markdown files"
        );
        assert!(names.contains(&".gitignore"), "should include dotfiles");
        assert!(names.contains(&"readme.md"), "should include markdown");
    }

    #[test]
    fn walk_tree_loads_markdown_frontmatter_metadata_only() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join("notes.txt"), "plain text").unwrap();
        write_markdown_file(&root.join("readme.md"), "Readme", "body");

        let mut cache = HashMap::new();
        let nodes = walk_tree(root, &mut cache);

        let txt = nodes.iter().find(|n| n.name == "notes.txt").unwrap();
        let md = nodes.iter().find(|n| n.name == "readme.md").unwrap();
        assert!(
            txt.title.is_none(),
            "non-markdown should not load frontmatter"
        );
        assert_eq!(md.title.as_deref(), Some("Readme"));
    }

    #[test]
    fn walk_tree_skips_noise_directories() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        // node_modules and .git must be skipped entirely; .github is not a noise
        // dir and should be included.
        fs::create_dir_all(root.join("node_modules").join("react")).unwrap();
        fs::write(root.join("node_modules").join("react").join("index.js"), "").unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join(".git").join("HEAD"), "ref: x").unwrap();
        fs::create_dir_all(root.join(".github")).unwrap();
        fs::write(root.join(".github").join("workflows.yml"), "").unwrap();
        write_markdown_file(&root.join("readme.md"), "Readme", "body");

        let mut cache = HashMap::new();
        let nodes = walk_tree(root, &mut cache);

        let names: Vec<&str> = nodes.iter().map(|n| n.name.as_str()).collect();
        assert!(
            !names.contains(&"node_modules"),
            "node_modules must be filtered"
        );
        assert!(!names.contains(&".git"), ".git must be filtered");
        assert!(
            names.contains(&".github"),
            ".github must be kept (not a noise dir)"
        );
        assert!(names.contains(&"readme.md"));
    }

    #[test]
    fn walk_tree_keeps_empty_directories() {
        // Files mode wants empty dirs visible; content mode prunes them via
        // the TS selector. The Rust walk preserves them.
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("empty")).unwrap();

        let mut cache = HashMap::new();
        let nodes = walk_tree(root, &mut cache);

        let empty = nodes.iter().find(|n| n.name == "empty").unwrap();
        assert!(empty.is_directory);
        assert_eq!(empty.children.as_ref().map(|c| c.len()), Some(0));
    }
}
