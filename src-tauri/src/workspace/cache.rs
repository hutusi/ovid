use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::state::{CachedFrontmatter, CachedSearchFile};

pub(crate) fn read_frontmatter_meta_from_str(content: &str) -> (Option<String>, Option<bool>, Option<String>) {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None, None);
    };
    let mut title: Option<String> = None;
    let mut draft: Option<bool> = None;
    let mut content_type: Option<String> = None;
    for line in lines {
        if line.trim() == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix("title:") {
            title = Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(rest) = line.strip_prefix("draft:") {
            let val = rest.trim();
            draft = match val {
                "true" => Some(true),
                "false" => Some(false),
                _ => None,
            };
        } else if let Some(rest) = line.strip_prefix("type:") {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if !val.is_empty() {
                content_type = Some(val);
            }
        }
    }
    (title, draft, content_type)
}

/// Read the frontmatter block (between `---` fences) of a markdown file and
/// extract the `title`, `draft`, and `type` scalar values using simple line scanning.
/// Returns `(None, None, None)` if the file can't be read or has no frontmatter.
/// Uses a buffered reader so only the frontmatter is read, not the full file.
pub(crate) fn read_frontmatter_meta(path: &Path) -> (Option<String>, Option<bool>, Option<String>) {
    use std::io::{BufRead, BufReader};
    let Ok(file) = std::fs::File::open(path) else {
        return (None, None, None);
    };
    let mut reader = BufReader::new(file);
    let mut frontmatter = String::new();
    let mut frontmatter_line_count = 0;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        frontmatter.push_str(&line);
        frontmatter_line_count += 1;
        if frontmatter_line_count > 1 && line.trim() == "---" {
            break;
        }
    }
    read_frontmatter_meta_from_str(&frontmatter)
}

pub(crate) fn read_frontmatter_meta_cached(
    path: &Path,
    cache: &mut HashMap<PathBuf, CachedFrontmatter>,
) -> (Option<String>, Option<bool>, Option<String>) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return read_frontmatter_meta(path);
    };
    let modified = metadata.modified().ok();
    let len = metadata.len();

    if let Some(cached) = cache.get(path) {
        if cached.modified == modified && cached.len == len {
            return (
                cached.title.clone(),
                cached.draft,
                cached.content_type.clone(),
            );
        }
    }

    let (title, draft, content_type) = read_frontmatter_meta(path);
    cache.insert(
        path.to_path_buf(),
        CachedFrontmatter {
            modified,
            len,
            title: title.clone(),
            draft,
            content_type: content_type.clone(),
        },
    );
    (title, draft, content_type)
}

pub(crate) fn load_search_file_cached(
    path: &Path,
    cache: &mut HashMap<PathBuf, CachedSearchFile>,
    frontmatter_cache: &HashMap<PathBuf, CachedFrontmatter>,
) -> Option<CachedSearchFile> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok();
    let len = metadata.len();

    if let Some(cached) = cache.get(path) {
        if cached.modified == modified && cached.len == len {
            return Some(cached.clone());
        }
    }

    let content = std::fs::read_to_string(path).ok()?;
    let (title, draft) = if let Some(cached) = frontmatter_cache
        .get(path)
        .filter(|cached| cached.modified == modified && cached.len == len)
    {
        (cached.title.clone(), cached.draft.unwrap_or(false))
    } else {
        let (t, d, _) = read_frontmatter_meta_from_str(&content);
        (t, d.unwrap_or(false))
    };
    let entry = CachedSearchFile {
        modified,
        len,
        title,
        draft,
        lines: content.lines().map(|line| line.to_string()).collect(),
    };
    cache.insert(path.to_path_buf(), entry.clone());
    Some(entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_markdown_file(path: &Path, title: &str, body: &str) {
        let content = format!("---\ntitle: \"{title}\"\ntype: note\n---\n\n{body}\n");
        fs::write(path, content).unwrap();
    }

    #[test]
    fn read_frontmatter_meta_cached_refreshes_when_file_changes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("entry.md");
        let mut cache = HashMap::new();

        write_markdown_file(&path, "First", "short body");
        let initial = read_frontmatter_meta_cached(&path, &mut cache);
        assert_eq!(initial.0.as_deref(), Some("First"));

        write_markdown_file(
            &path,
            "Second title",
            "body with more bytes to change the file size",
        );
        let updated = read_frontmatter_meta_cached(&path, &mut cache);
        assert_eq!(updated.0.as_deref(), Some("Second title"));
    }

    #[test]
    fn load_search_file_cached_refreshes_when_file_changes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("entry.md");
        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();

        write_markdown_file(&path, "First", "alpha needle");
        let initial = load_search_file_cached(&path, &mut cache, &frontmatter_cache).unwrap();
        assert_eq!(initial.title.as_deref(), Some("First"));
        assert!(initial.lines.iter().any(|line| line.contains("needle")));

        write_markdown_file(&path, "Second", "completely different body with more bytes");
        let updated = load_search_file_cached(&path, &mut cache, &frontmatter_cache).unwrap();
        assert_eq!(updated.title.as_deref(), Some("Second"));
        assert!(!updated.lines.iter().any(|line| line.contains("needle")));
    }

    #[test]
    fn load_search_file_cached_extracts_draft_flag() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("entry.md");
        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();

        // Non-draft file
        write_markdown_file(&path, "Published", "some content");
        let non_draft = load_search_file_cached(&path, &mut cache, &frontmatter_cache).unwrap();
        assert!(!non_draft.draft);

        // Draft file (force cache miss by writing more bytes)
        let draft_content = "---\ntitle: \"Draft Post\"\ndraft: true\n---\n\nsome content here\n";
        fs::write(&path, draft_content).unwrap();
        cache.clear();
        let draft = load_search_file_cached(&path, &mut cache, &frontmatter_cache).unwrap();
        assert_eq!(draft.title.as_deref(), Some("Draft Post"));
        assert!(draft.draft);
    }
}
