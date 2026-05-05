use serde::Serialize;
use std::path::Path;

use tauri::State;

use crate::state::WorkspaceState;

// ── Content types ──────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContentType {
    pub(crate) name: String,
}

/// Extract the first quoted string value from the beginning of `s`.
pub(crate) fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim();
    let quote = s.chars().next()?;
    if quote != '\'' && quote != '"' && quote != '`' {
        return None;
    }
    let inner = &s[quote.len_utf8()..];
    let end = inner.find(quote)?;
    Some(inner[..end].to_string())
}

/// Strip an optional leading quote char that matches `quote` from `s`.
pub(crate) fn strip_quote_pair<'a>(s: &'a str, key: &str, quote: char) -> Option<&'a str> {
    let s = s.strip_prefix(quote)?;
    let s = s.strip_prefix(key)?;
    s.strip_prefix(quote)
}

/// Best-effort scanner: look for `cdnBase`, `cdnBaseUrl`, or `cdnUrl` keys in
/// `site.config.ts` and return the URL value. Handles both bare (`cdnBase:`)
/// and quoted (`"cdnBase":` / `'cdnBase':`) key forms. Returns `None` on any
/// parse failure.
pub(crate) fn parse_cdn_base(config_path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(config_path).ok()?;
    let reader = BufReader::new(file);
    let mut in_block_comment = false;
    for line in reader.lines().flatten() {
        let trimmed = line.trim();
        // Track /* ... */ block comments that may span multiple lines
        if in_block_comment {
            if trimmed.contains("*/") {
                in_block_comment = false;
            }
            continue;
        }
        if trimmed.starts_with("/*") {
            if !trimmed.contains("*/") {
                in_block_comment = true;
            }
            continue;
        }
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }
        for key in &["cdnBase", "cdnBaseUrl", "cdnUrl"] {
            // Match: cdnBase, "cdnBase", or 'cdnBase'
            let after_key = trimmed
                .strip_prefix(key)
                .or_else(|| strip_quote_pair(trimmed, key, '"'))
                .or_else(|| strip_quote_pair(trimmed, key, '\''));
            if let Some(rest) = after_key {
                let rest = rest.trim_start();
                let Some(rest) = rest.strip_prefix(':') else {
                    continue;
                };
                if let Some(url) = extract_quoted_string(rest) {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        return Some(url);
                    }
                }
            }
        }
    }
    None
}

/// Best-effort scanner: read the first entry from `posts.authors.default` in
/// `site.config.ts`. Returns `None` on any parse failure so callers degrade
/// gracefully when the workspace has no site config.
pub(crate) fn parse_default_author(config_path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(config_path).ok()?;
    let mut in_authors = false;
    let mut brace_depth: i32 = 0;
    let mut authors_depth: i32 = 0;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }

        let opens = trimmed.chars().filter(|&c| c == '{').count() as i32;
        let closes = trimmed.chars().filter(|&c| c == '}').count() as i32;

        // Exit the authors scope when brace depth returns to entry level
        if in_authors && brace_depth + opens - closes <= authors_depth {
            in_authors = false;
        }

        if !in_authors {
            // Detect `authors:` key — may appear inline (e.g. `posts: { authors: { ... } }`)
            if let Some(pos) = trimmed.find("authors:") {
                // Reject if `authors` is part of a longer identifier (e.g. `defaultAuthors:`)
                let is_word_boundary =
                    pos == 0 || !trimmed.as_bytes()[pos - 1].is_ascii_alphanumeric();
                if is_word_boundary {
                    in_authors = true;
                    authors_depth = brace_depth;
                    // Check for inline `default:` on the same line
                    if let Some(author) = parse_authors_default(trimmed) {
                        return Some(author);
                    }
                }
            }
        } else {
            // Inside authors block — look for `default: [...]`
            if let Some(author) = parse_authors_default(trimmed) {
                return Some(author);
            }
        }

        brace_depth += opens - closes;
    }
    None
}

/// Extract the first author name from a line containing `default: ["Author", ...]`.
pub(crate) fn parse_authors_default(trimmed: &str) -> Option<String> {
    let pos = trimmed.find("default:")?;
    // Reject if `default` is part of a longer identifier
    if pos > 0 && trimmed.as_bytes()[pos - 1].is_ascii_alphanumeric() {
        return None;
    }
    let rest = trimmed[pos + "default:".len()..].trim();
    let inner = rest.strip_prefix('[')?;
    let author = extract_quoted_string(inner)?;
    if author.is_empty() {
        None
    } else {
        Some(author)
    }
}

/// Best-effort scanner: find `contentTypes` in `site.config.ts` and extract
/// the top-level key names (post, page, note, …). Returns empty vec on any
/// parse failure so callers gracefully degrade to the default frontmatter.
pub(crate) fn parse_content_types(config_path: &Path) -> Vec<ContentType> {
    use std::io::{BufRead, BufReader};
    let Ok(file) = std::fs::File::open(config_path) else {
        return Vec::new();
    };
    let mut reader = BufReader::new(file);
    let mut type_names: Vec<ContentType> = Vec::new();
    let mut depth: i32 = 0;
    let mut found_content_types = false;
    let mut content_types_depth: Option<i32> = None;
    let mut line = String::new();

    loop {
        line.clear();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        let trimmed = line.trim();
        let open_count = line.chars().filter(|&c| c == '{').count() as i32;
        let close_count = line.chars().filter(|&c| c == '}').count() as i32;

        match content_types_depth {
            None if !found_content_types => {
                if trimmed.contains("contentTypes") {
                    found_content_types = true;
                    depth += open_count - close_count;
                    if open_count > 0 {
                        content_types_depth = Some(depth);
                    }
                } else {
                    depth += open_count - close_count;
                }
            }
            None => {
                // found keyword, waiting for opening brace
                depth += open_count - close_count;
                if open_count > 0 {
                    content_types_depth = Some(depth);
                }
            }
            Some(ct_depth) => {
                let prev_depth = depth;
                depth += open_count - close_count;
                if depth < ct_depth {
                    break;
                }
                if prev_depth == ct_depth {
                    if let Some(name) = extract_ts_key(trimmed) {
                        type_names.push(ContentType { name });
                    }
                }
            }
        }
    }
    type_names
}

pub(crate) fn extract_ts_key(line: &str) -> Option<String> {
    let line = line.trim();
    if line.starts_with("//") || line.starts_with('*') || line.starts_with("/*") {
        return None;
    }
    let end = line.find(':')?;
    let key = line[..end].trim().trim_matches('"').trim_matches('\'');
    if !key.is_empty() && key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        Some(key.to_string())
    } else {
        None
    }
}

#[tauri::command]
pub(crate) fn get_content_types(state: State<'_, WorkspaceState>) -> Result<Vec<ContentType>, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = match root_guard.as_ref() {
        Some(r) => r.clone(),
        None => return Ok(Vec::new()),
    };
    drop(root_guard);
    let config = root.join("site.config.ts");
    if !config.is_file() {
        return Ok(Vec::new());
    }
    Ok(parse_content_types(&config))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    // ── extract_quoted_string ────────────────────────────────────────────────

    #[test]
    fn extract_quoted_string_double_quotes() {
        assert_eq!(
            extract_quoted_string(r#" "https://cdn.example.com" "#),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn extract_quoted_string_single_quotes() {
        assert_eq!(
            extract_quoted_string(" 'https://cdn.example.com' "),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn extract_quoted_string_backtick() {
        assert_eq!(
            extract_quoted_string("`https://cdn.example.com`"),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn extract_quoted_string_no_quote_returns_none() {
        assert_eq!(extract_quoted_string("https://cdn.example.com"), None);
    }

    #[test]
    fn extract_quoted_string_empty_returns_none() {
        assert_eq!(extract_quoted_string(""), None);
    }

    // ── strip_quote_pair ─────────────────────────────────────────────────────

    #[test]
    fn strip_quote_pair_matches_double_quote() {
        assert_eq!(strip_quote_pair(r#""cdnBase":"#, "cdnBase", '"'), Some(":"));
    }

    #[test]
    fn strip_quote_pair_matches_single_quote() {
        assert_eq!(strip_quote_pair("'cdnBase':", "cdnBase", '\''), Some(":"));
    }

    #[test]
    fn strip_quote_pair_wrong_quote_returns_none() {
        assert_eq!(strip_quote_pair("\"cdnBase\":", "cdnBase", '\''), None);
    }

    #[test]
    fn strip_quote_pair_no_closing_quote_returns_none() {
        assert_eq!(strip_quote_pair("\"cdnBase:", "cdnBase", '"'), None);
    }

    // ── parse_cdn_base ───────────────────────────────────────────────────────

    fn write_config(dir: &TempDir, content: &str) -> PathBuf {
        let path = dir.path().join("site.config.ts");
        fs::write(&path, content).unwrap();
        path
    }

    #[test]
    fn parse_cdn_base_bare_key_single_quotes() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnBase: 'https://cdn.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_bare_key_double_quotes() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnBase: \"https://cdn.example.com\",\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_double_quoted_key() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  \"cdnBase\": \"https://cdn.example.com\",\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_single_quoted_key() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  'cdnBase': 'https://cdn.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_cdn_url_variant() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnUrl: 'https://assets.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://assets.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_cdn_base_url_variant() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnBaseUrl: 'https://cdn.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_skips_line_comments() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "// cdnBase: 'https://cdn.example.com'\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    fn parse_cdn_base_skips_block_comment_lines() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "/**\n * cdnBase: 'https://cdn.example.com'\n */\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    fn parse_cdn_base_non_http_value_returns_none() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, "export const config = { cdnBase: 'relative/path' };");
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    fn parse_cdn_base_missing_file_returns_none() {
        assert_eq!(
            parse_cdn_base(Path::new("/nonexistent/site.config.ts")),
            None
        );
    }

    // ── parse_default_author ─────────────────────────────────────────────────

    #[test]
    fn parse_default_author_returns_first_name_from_single_entry_array() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  posts: {\n    authors: {\n      default: [\"John Hu\"] as string[],\n    },\n  },\n};\n",
        );
        assert_eq!(parse_default_author(&path), Some("John Hu".to_string()));
    }

    #[test]
    fn parse_default_author_returns_first_name_from_multi_entry_array() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  posts: {\n    authors: {\n      default: [\"Alice\", \"Bob\"] as string[],\n    },\n  },\n};\n",
        );
        assert_eq!(parse_default_author(&path), Some("Alice".to_string()));
    }

    #[test]
    fn parse_default_author_returns_none_when_default_array_is_empty() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  posts: { authors: { default: [] as string[] } },\n};\n",
        );
        assert_eq!(parse_default_author(&path), None);
    }

    #[test]
    fn parse_default_author_returns_none_when_file_missing() {
        assert_eq!(
            parse_default_author(Path::new("/nonexistent/site.config.ts")),
            None
        );
    }

    #[test]
    fn parse_default_author_ignores_line_comments() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "// default: [\"Fake\"]\nexport const siteConfig = {\n  posts: {\n    authors: {\n      default: [\"Real Author\"],\n    },\n  },\n};\n",
        );
        assert_eq!(parse_default_author(&path), Some("Real Author".to_string()));
    }

    #[test]
    fn parse_cdn_base_skips_multi_line_block_comments() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "/* This config has no CDN\n  cdnBase: 'https://cdn.example.com'\n*/\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
    }
}
