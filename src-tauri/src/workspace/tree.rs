use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::paths::to_slash;
use crate::state::CachedFrontmatter;

use super::FileNode;
use super::cache::read_frontmatter_meta_cached;

pub(crate) fn walk_dir(path: &Path, cache: &mut HashMap<PathBuf, CachedFrontmatter>) -> Vec<FileNode> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };

    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let mut nodes = Vec::new();

    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let children = walk_dir(&entry_path, cache);
            if !children.is_empty() {
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
            }
        } else {
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if ext == "md" || ext == "mdx" {
                let (title, draft, content_type) = read_frontmatter_meta_cached(&entry_path, cache);
                nodes.push(FileNode {
                    name,
                    path: to_slash(&entry_path),
                    is_directory: false,
                    children: None,
                    children_loaded: None,
                    extension: Some(format!(".{}", ext)),
                    title,
                    draft,
                    content_type,
                });
            }
        }
    }

    nodes
}

pub(crate) fn has_markdown_descendant(path: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        let p = entry.path();
        if ft.is_dir() {
            if has_markdown_descendant(&p) {
                return true;
            }
        } else if ft.is_file() {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext == "md" || ext == "mdx" {
                return true;
            }
        }
    }
    false
}

pub(crate) fn list_dir_shallow(
    path: &Path,
    all_files: bool,
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

        if !all_files && name.starts_with('.') {
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if !all_files && !has_markdown_descendant(&entry_path) {
                continue;
            }
            nodes.push(FileNode {
                name,
                path: to_slash(&entry_path),
                is_directory: true,
                children: None,
                children_loaded: Some(false),
                extension: None,
                title: None,
                draft: None,
                content_type: None,
            });
            continue;
        }

        let ext = entry_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let is_markdown = ext == "md" || ext == "mdx";
        if is_markdown || all_files {
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
                let body = if (dir_index * files_per_dir + file_index) % match_every == 0 {
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
    fn perf_walk_dir_large_workspace_fixture() {
        let dir = create_large_workspace_fixture(40, 80, 7);
        let mut cache = HashMap::new();

        let first_started = Instant::now();
        let first_tree = walk_dir(&dir.path().join("content"), &mut cache);
        let first_elapsed = first_started.elapsed();

        let second_started = Instant::now();
        let second_tree = walk_dir(&dir.path().join("content"), &mut cache);
        let second_elapsed = second_started.elapsed();

        let top_level_dirs = first_tree.iter().filter(|node| node.is_directory).count();
        assert_eq!(top_level_dirs, 40);
        assert_eq!(second_tree.len(), first_tree.len());
        eprintln!(
            "[perf-test] walk_dir fixture dirs=40 files_per_dir=80 top_level={} first={}ms second={}ms",
            top_level_dirs,
            first_elapsed.as_millis(),
            second_elapsed.as_millis()
        );
    }

    #[test]
    fn list_dir_shallow_marks_directories_unloaded_and_keeps_file_metadata() {
        let dir = TempDir::new().unwrap();
        let content_root = dir.path().join("content");
        fs::create_dir_all(content_root.join("posts")).unwrap();
        write_markdown_file(&content_root.join("readme.md"), "Readme", "body");
        // posts/ must have a markdown descendant or it will be filtered out in content mode
        write_markdown_file(&content_root.join("posts/first.md"), "First", "body");

        let mut cache = HashMap::new();
        let results = list_dir_shallow(&content_root, false, &mut cache);

        assert_eq!(results.len(), 2);
        let dir_node = results.iter().find(|node| node.is_directory).unwrap();
        assert_eq!(dir_node.name, "posts");
        assert_eq!(dir_node.children_loaded, Some(false));
        assert!(dir_node.children.is_none());

        let file_node = results.iter().find(|node| !node.is_directory).unwrap();
        assert_eq!(file_node.name, "readme.md");
        assert_eq!(file_node.title.as_deref(), Some("Readme"));
        assert_eq!(file_node.children_loaded, None);
    }

    #[test]
    fn list_dir_shallow_all_files_includes_non_markdown_and_empty_dirs() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join("config.ts"), "export default {}").unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/index.ts"), "").unwrap();
        write_markdown_file(&root.join("readme.md"), "Readme", "body");

        let mut cache = HashMap::new();
        let results = list_dir_shallow(root, true, &mut cache);

        let names: Vec<&str> = results.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"config.ts"), "should include config.ts");
        assert!(names.contains(&"readme.md"), "should include readme.md");
        assert!(names.contains(&"src"), "should include src dir");
    }

    #[test]
    fn list_dir_shallow_content_mode_excludes_non_markdown_files() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join("config.ts"), "export default {}").unwrap();
        write_markdown_file(&root.join("readme.md"), "Readme", "body");

        let mut cache = HashMap::new();
        let results = list_dir_shallow(root, false, &mut cache);

        let names: Vec<&str> = results.iter().map(|n| n.name.as_str()).collect();
        assert!(!names.contains(&"config.ts"), "should exclude config.ts");
        assert!(names.contains(&"readme.md"), "should include readme.md");
    }

    #[test]
    fn list_dir_shallow_all_files_includes_dotfiles() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join(".env"), "SECRET=1").unwrap();
        fs::write(root.join(".gitignore"), "dist/").unwrap();
        fs::write(root.join("readme.md"), "# hi").unwrap();

        let mut cache = HashMap::new();
        let results = list_dir_shallow(root, true, &mut cache);

        let names: Vec<&str> = results.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&".env"), "should include .env");
        assert!(names.contains(&".gitignore"), "should include .gitignore");
    }

    #[test]
    fn list_dir_shallow_content_mode_excludes_dotfiles() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join(".env"), "SECRET=1").unwrap();
        write_markdown_file(&root.join("readme.md"), "Readme", "body");

        let mut cache = HashMap::new();
        let results = list_dir_shallow(root, false, &mut cache);

        let names: Vec<&str> = results.iter().map(|n| n.name.as_str()).collect();
        assert!(!names.contains(&".env"), "should exclude .env");
        assert!(names.contains(&"readme.md"), "should include readme.md");
    }

    #[test]
    fn has_markdown_descendant_ignores_dotfile_directories() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        // Place a markdown file only inside a hidden directory — should not count
        let hidden = root.join(".hidden");
        fs::create_dir_all(&hidden).unwrap();
        write_markdown_file(&hidden.join("post.md"), "Hidden", "body");

        assert!(
            !has_markdown_descendant(root),
            "dotfile dirs should not make a directory appear in content mode"
        );
    }
}
