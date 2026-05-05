use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use tauri::State;

use crate::paths::{is_markdown_path, to_slash};
use crate::perf::log_perf;
use crate::state::{CachedFrontmatter, CachedSearchFile, WorkspaceState};
use crate::workspace::load_search_file_cached;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchMatch {
    pub(crate) line_number: usize,
    pub(crate) line_content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchResult {
    pub(crate) path: String,
    pub(crate) title: Option<String>,
    pub(crate) draft: bool,
    pub(crate) matches: Vec<SearchMatch>,
    pub(crate) total_matches: usize,
    pub(crate) has_more_matches: bool,
}

pub(crate) fn search_display_name(result: &SearchResult) -> String {
    if let Some(title) = result
        .title
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty())
    {
        return title.to_lowercase();
    }

    Path::new(&result.path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(&result.path)
        .to_lowercase()
}

pub(crate) fn search_relative_path(path: &str, root: &Path) -> String {
    Path::new(path)
        .strip_prefix(root)
        .unwrap_or_else(|_| Path::new(path))
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase()
}

pub(crate) fn score_search_result(result: &SearchResult, query_lower: &str, root: &Path) -> i64 {
    let display_name = search_display_name(result);
    let relative_path = search_relative_path(&result.path, root);
    let base_name = Path::new(&result.path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_lowercase();

    let text_score = if display_name == query_lower || base_name == query_lower {
        1_200
    } else if display_name.starts_with(query_lower) {
        900 - (display_name.len().saturating_sub(query_lower.len()) as i64)
    } else if base_name.starts_with(query_lower) {
        850 - (base_name.len().saturating_sub(query_lower.len()) as i64)
    } else if relative_path.split('/').any(|part| {
        part == query_lower
            || part == format!("{query_lower}.md")
            || part == format!("{query_lower}.mdx")
    }) {
        825
    } else if relative_path
        .split(|c: char| matches!(c, '/' | '\\' | '.' | '_' | '-' | ' '))
        .any(|segment| segment == query_lower)
    {
        800
    } else if let Some(index) = display_name.find(query_lower) {
        600 - index as i64
    } else if let Some(index) = base_name.find(query_lower) {
        500 - index as i64
    } else if let Some(index) = relative_path.find(query_lower) {
        300 - std::cmp::min(index, 250) as i64
    } else {
        0
    };

    text_score + std::cmp::min(result.total_matches, 25) as i64
}

const MAX_SEARCH_MATCHES_PER_FILE: usize = 8;

/// Search all markdown files under `path` for lines containing `query` (case-insensitive).
pub(crate) fn search_dir(
    path: &Path,
    query_lower: &str,
    cache: &mut HashMap<PathBuf, CachedSearchFile>,
    frontmatter_cache: &HashMap<PathBuf, CachedFrontmatter>,
) -> Vec<SearchResult> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let mut results = Vec::new();
    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        // Skip symlinks to prevent traversal outside the workspace
        if entry.file_type().map(|ft| ft.is_symlink()).unwrap_or(false) {
            continue;
        }
        if entry_path.is_dir() {
            results.extend(search_dir(
                &entry_path,
                query_lower,
                cache,
                frontmatter_cache,
            ));
        } else {
            if !is_markdown_path(&entry_path) {
                continue;
            }
            let Some(file) = load_search_file_cached(&entry_path, cache, frontmatter_cache) else {
                continue;
            };
            let mut total_matches = 0;
            let mut matches = Vec::new();

            for (i, line) in file.lines.iter().enumerate() {
                if !line.to_lowercase().contains(query_lower) {
                    continue;
                }
                total_matches += 1;
                if matches.len() < MAX_SEARCH_MATCHES_PER_FILE {
                    matches.push(SearchMatch {
                        line_number: i + 1,
                        line_content: line.trim().to_string(),
                    });
                }
            }

            if total_matches > 0 {
                results.push(SearchResult {
                    path: to_slash(&entry_path),
                    title: file.title.clone(),
                    draft: file.draft,
                    matches,
                    total_matches,
                    has_more_matches: total_matches > MAX_SEARCH_MATCHES_PER_FILE,
                });
            }
        }
    }
    results
}

#[tauri::command]
pub(crate) fn search_workspace(
    query: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<SearchResult>, String> {
    let started = Instant::now();
    if query.trim().is_empty() {
        log_perf(
            "search_workspace",
            started.elapsed(),
            &[("query", "empty".to_string()), ("results", "0".to_string())],
        );
        return Ok(Vec::new());
    }
    // Clone root before releasing the lock so the mutex is not held during search
    let root = {
        let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    let query_lower = query.trim().to_lowercase();
    let results = {
        // Keep cache lock ordering consistent: search_cache first, then
        // frontmatter_cache. If this path ever changes, preserve that order to
        // avoid introducing deadlocks across future cache-aware search/tree code.
        let mut cache = state.search_cache.lock().map_err(|e| e.to_string())?;
        let frontmatter_cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
        search_dir(&root, &query_lower, &mut cache, &frontmatter_cache)
    };
    let mut scored_results = results
        .into_iter()
        .map(|result| {
            let score = score_search_result(&result, &query_lower, &root);
            (score, result)
        })
        .collect::<Vec<_>>();
    scored_results.sort_by(|(score_a, result_a), (score_b, result_b)| {
        score_b
            .cmp(score_a)
            .then_with(|| result_a.path.cmp(&result_b.path))
    });
    let results = scored_results
        .into_iter()
        .map(|(_, result)| result)
        .collect::<Vec<_>>();
    let file_count = results.len();
    let match_count = results
        .iter()
        .map(|result| result.total_matches)
        .sum::<usize>();
    log_perf(
        "search_workspace",
        started.elapsed(),
        &[
            ("query", query.trim().to_string()),
            ("files", file_count.to_string()),
            ("matches", match_count.to_string()),
        ],
    );
    Ok(results)
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
    fn perf_search_dir_large_workspace_fixture() {
        let dir = create_large_workspace_fixture(40, 80, 5);
        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();

        let first_started = Instant::now();
        let first_results = search_dir(
            &dir.path().join("content"),
            "needle",
            &mut cache,
            &frontmatter_cache,
        );
        let first_elapsed = first_started.elapsed();

        let second_started = Instant::now();
        let second_results = search_dir(
            &dir.path().join("content"),
            "needle",
            &mut cache,
            &frontmatter_cache,
        );
        let second_elapsed = second_started.elapsed();

        let file_count = first_results.len();
        let match_count = first_results
            .iter()
            .map(|result| result.matches.len())
            .sum::<usize>();
        assert_eq!(file_count, 640);
        assert_eq!(match_count, 640);
        assert_eq!(second_results.len(), first_results.len());
        eprintln!(
            "[perf-test] search_dir fixture dirs=40 files_per_dir=80 matched_files={} matched_lines={} first={}ms second={}ms",
            file_count,
            match_count,
            first_elapsed.as_millis(),
            second_elapsed.as_millis()
        );
    }

    #[test]
    fn search_dir_propagates_draft_flag_to_results() {
        let dir = TempDir::new().unwrap();
        let content_root = dir.path().join("content");
        fs::create_dir_all(&content_root).unwrap();

        let draft_path = content_root.join("draft.md");
        let published_path = content_root.join("published.md");
        fs::write(
            &draft_path,
            "---\ntitle: \"Draft\"\ndraft: true\n---\n\nkeyword here\n",
        )
        .unwrap();
        write_markdown_file(&published_path, "Published", "keyword here");

        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();
        let mut results = search_dir(&content_root, "keyword", &mut cache, &frontmatter_cache);
        results.sort_by(|a, b| a.path.cmp(&b.path));

        assert_eq!(results.len(), 2);
        let draft_result = results.iter().find(|r| r.path.ends_with("draft.md")).unwrap();
        let published_result = results
            .iter()
            .find(|r| r.path.ends_with("published.md"))
            .unwrap();
        assert!(draft_result.draft);
        assert!(!published_result.draft);
    }

    #[test]
    fn search_dir_caps_returned_matches_per_file_but_keeps_total_count() {
        let dir = TempDir::new().unwrap();
        let content_root = dir.path().join("content");
        fs::create_dir_all(&content_root).unwrap();
        let path = content_root.join("entry.md");
        let body = (0..12)
            .map(|index| format!("needle line {index}"))
            .collect::<Vec<_>>()
            .join("\n");
        write_markdown_file(&path, "Needle", &body);

        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();
        let results = search_dir(&content_root, "needle", &mut cache, &frontmatter_cache);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].matches.len(), MAX_SEARCH_MATCHES_PER_FILE);
        assert_eq!(results[0].total_matches, 13);
        assert!(results[0].has_more_matches);
    }

    fn make_search_result(path: &str, title: Option<&str>, total_matches: usize) -> SearchResult {
        SearchResult {
            path: path.to_string(),
            title: title.map(str::to_string),
            draft: false,
            matches: Vec::new(),
            total_matches,
            has_more_matches: false,
        }
    }

    #[test]
    fn score_search_result_prefers_exact_title_matches() {
        let root = PathBuf::from("/workspace");
        let exact = make_search_result("/workspace/notes/rust.md", Some("Rust"), 1);
        let prefix = make_search_result("/workspace/notes/rust-book.md", Some("Rust Book"), 1);

        assert!(
            score_search_result(&exact, "rust", &root)
                > score_search_result(&prefix, "rust", &root)
        );
    }

    #[test]
    fn score_search_result_prefers_exact_path_parts_over_substrings() {
        let root = PathBuf::from("/workspace");
        let exact_part = make_search_result("/workspace/posts/hello/index.md", None, 1);
        let substring = make_search_result("/workspace/posts/say-hello/index.md", None, 1);

        assert!(
            score_search_result(&exact_part, "hello", &root)
                > score_search_result(&substring, "hello", &root)
        );
    }

    #[test]
    fn search_workspace_sort_prefers_relevance_then_match_count() {
        let root = PathBuf::from("/workspace");
        let mut results = vec![
            make_search_result("/workspace/archive/rust-notes.md", Some("Notes"), 5),
            make_search_result("/workspace/notes/rust.md", Some("Rust"), 1),
            make_search_result("/workspace/notes/rust-book.md", Some("Rust Book"), 2),
        ];

        results.sort_by(|a, b| {
            score_search_result(b, "rust", &root)
                .cmp(&score_search_result(a, "rust", &root))
                .then_with(|| a.path.cmp(&b.path))
        });

        assert_eq!(results[0].path, "/workspace/notes/rust.md");
        assert_eq!(results[1].path, "/workspace/notes/rust-book.md");
        assert_eq!(results[2].path, "/workspace/archive/rust-notes.md");
    }
}
