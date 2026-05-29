use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;
use ts_rs::TS;

// ── Features ─────────────────────────────────────────────────────────────────

/// A content bucket declared in `site.config.ts`'s `features:` block. `id` is the
/// bucket key (`posts` / `series` / `books` / `flow`); `names` maps a locale code
/// to the bucket's display name. Amytis has no `features.notes` entry — notes is
/// an always-on bucket — so the frontend treats a missing bucket as enabled.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct FeatureBucket {
    pub(crate) id: String,
    pub(crate) enabled: bool,
    pub(crate) names: BTreeMap<String, String>,
}

/// Return the slice after `key:` when `line` contains `key` as a bare property
/// name at a word boundary. Used to read scalar fields (`enabled:`) and locate
/// the `name:` sub-object inside a feature bucket.
fn value_after_key<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let is_ident = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    let mut from = 0;
    while let Some(rel) = line[from..].find(key) {
        let pos = from + rel;
        let before_ok = pos == 0 || !is_ident(line.as_bytes()[pos - 1]);
        let rest = line[pos + key.len()..].trim_start();
        if before_ok {
            if let Some(after_colon) = rest.strip_prefix(':') {
                return Some(after_colon);
            }
        }
        from = pos + key.len();
    }
    None
}

/// Parse a single `<locale>: "name"` pair from a comma-delimited fragment such as
/// `{ en: "Articles"` or ` zh: "文章" }`. Returns `None` when the fragment is not
/// a string-valued entry (e.g. `enabled: true` or the `name: {` opener).
fn extract_locale_pair(part: &str) -> Option<(String, String)> {
    let part = part.trim().trim_start_matches('{').trim();
    let colon = part.find(':')?;
    let key = part[..colon].trim().trim_matches('"').trim_matches('\'');
    if key.is_empty()
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    let value = extract_quoted_string(part[colon + 1..].trim())?;
    Some((key.to_string(), value))
}

/// Best-effort scanner: read the `features:` block from `site.config.ts`. Each
/// top-level key is a content bucket with an `enabled` flag and a localized
/// `name` object. Returns an empty vec on any parse failure so callers fall back
/// to the conventional bucket names.
pub(crate) fn parse_features(config_path: &Path) -> Vec<FeatureBucket> {
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return Vec::new();
    };
    let mut buckets: Vec<FeatureBucket> = Vec::new();
    let mut current: Option<FeatureBucket> = None;
    let mut depth: i32 = 0;
    let mut found_features = false;
    let mut features_depth: Option<i32> = None;
    let mut in_name = false;

    for raw in content.lines() {
        let trimmed = raw.trim();
        if trimmed.starts_with("//") || trimmed.starts_with('*') || trimmed.starts_with("/*") {
            continue;
        }
        let opens = raw.chars().filter(|&c| c == '{').count() as i32;
        let closes = raw.chars().filter(|&c| c == '}').count() as i32;

        match features_depth {
            None if !found_features => {
                if value_after_key(trimmed, "features").is_some() {
                    found_features = true;
                    depth += opens - closes;
                    if opens > 0 {
                        features_depth = Some(depth);
                    }
                } else {
                    depth += opens - closes;
                }
            }
            None => {
                depth += opens - closes;
                if opens > 0 {
                    features_depth = Some(depth);
                }
            }
            Some(fdepth) => {
                let prev_depth = depth;
                depth += opens - closes;
                if depth < fdepth {
                    if let Some(b) = current.take() {
                        buckets.push(b);
                    }
                    break;
                }
                if prev_depth == fdepth && opens > 0 {
                    // A new bucket key: `posts: {`.
                    if let Some(b) = current.take() {
                        buckets.push(b);
                    }
                    in_name = false;
                    if let Some(colon) = trimmed.find(':') {
                        let key = trimmed[..colon].trim().trim_matches('"').trim_matches('\'');
                        if !key.is_empty()
                            && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                        {
                            current = Some(FeatureBucket {
                                id: key.to_string(),
                                enabled: true,
                                names: BTreeMap::new(),
                            });
                        }
                    }
                } else if let Some(bucket) = current.as_mut() {
                    if let Some(rest) = value_after_key(trimmed, "enabled") {
                        let rest = rest.trim_start();
                        if rest.starts_with("true") {
                            bucket.enabled = true;
                        } else if rest.starts_with("false") {
                            bucket.enabled = false;
                        }
                    }
                    if let Some(after) = value_after_key(trimmed, "name") {
                        for part in after.split(',') {
                            if let Some((k, v)) = extract_locale_pair(part) {
                                bucket.names.insert(k, v);
                            }
                        }
                        // Track an unbalanced `name: {` that spills onto later lines.
                        in_name = after.matches('{').count() > after.matches('}').count();
                    } else if in_name {
                        if let Some((k, v)) = extract_locale_pair(trimmed) {
                            bucket.names.insert(k, v);
                        }
                        if trimmed.contains('}') {
                            in_name = false;
                        }
                    }
                }
            }
        }
    }
    if let Some(b) = current.take() {
        buckets.push(b);
    }
    buckets
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

/// Best-effort scanner: read `posts.basePath` from `site.config.ts` (the only
/// `basePath:` key Amytis defines). Returns `None` on any parse failure so the
/// caller falls back to the conventional `posts` folder name.
pub(crate) fn parse_posts_base_path(config_path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(config_path).ok()?;
    let reader = BufReader::new(file);
    let mut in_block_comment = false;
    for line in reader.lines().flatten() {
        let trimmed = line.trim();
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
        let after_key = trimmed
            .strip_prefix("basePath")
            .or_else(|| strip_quote_pair(trimmed, "basePath", '"'))
            .or_else(|| strip_quote_pair(trimmed, "basePath", '\''));
        if let Some(rest) = after_key {
            // Reject longer identifiers like `customBasePath:`
            let Some(rest) = rest.trim_start().strip_prefix(':') else {
                continue;
            };
            if let Some(val) = extract_quoted_string(rest) {
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    None
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

    // ── parse_posts_base_path ────────────────────────────────────────────────

    #[test]
    fn parse_posts_base_path_reads_quoted_value() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  posts: {\n    basePath: 'articles',\n  },\n};\n",
        );
        assert_eq!(parse_posts_base_path(&path), Some("articles".to_string()));
    }

    #[test]
    fn parse_posts_base_path_ignores_comment_mentions() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  // served at the default posts basePath\n  posts: {\n    basePath: \"posts\",\n  },\n};\n",
        );
        assert_eq!(parse_posts_base_path(&path), Some("posts".to_string()));
    }

    #[test]
    fn parse_posts_base_path_returns_none_when_absent() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, "export const siteConfig = { posts: { toc: true } };\n");
        assert_eq!(parse_posts_base_path(&path), None);
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

    // ── parse_features ───────────────────────────────────────────────────────

    const FEATURES_CONFIG: &str = r#"export const siteConfig = {
  nav: [{ name: "Posts", url: "/posts" }],
  features: {
    posts: {
      enabled: true,
      name: { en: "Articles", zh: "文章" },
    },
    series: {
      enabled: true,
      name: { en: "Series", zh: "系列" },
    },
    books: {
      enabled: false,
      name: { en: "Books", zh: "书籍" },
    },
    flow: {
      enabled: true,
      name: { en: "Flow", zh: "随笔" },
    },
  },
  hero: { title: "x" },
};
"#;

    #[test]
    fn parse_features_reads_all_buckets_in_order() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, FEATURES_CONFIG);
        let buckets = parse_features(&path);
        let ids: Vec<&str> = buckets.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec!["posts", "series", "books", "flow"]);
    }

    #[test]
    fn parse_features_reads_enabled_flag() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, FEATURES_CONFIG);
        let buckets = parse_features(&path);
        let books = buckets.iter().find(|b| b.id == "books").unwrap();
        assert!(!books.enabled);
        let posts = buckets.iter().find(|b| b.id == "posts").unwrap();
        assert!(posts.enabled);
    }

    #[test]
    fn parse_features_reads_localized_names() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, FEATURES_CONFIG);
        let buckets = parse_features(&path);
        let posts = buckets.iter().find(|b| b.id == "posts").unwrap();
        assert_eq!(posts.names.get("en").map(String::as_str), Some("Articles"));
        assert_eq!(posts.names.get("zh").map(String::as_str), Some("文章"));
    }

    #[test]
    fn parse_features_handles_multiline_name_object() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  features: {\n    posts: {\n      enabled: true,\n      name: {\n        en: \"Articles\",\n        zh: \"文章\",\n      },\n    },\n  },\n};\n",
        );
        let buckets = parse_features(&path);
        let posts = buckets.iter().find(|b| b.id == "posts").unwrap();
        assert_eq!(posts.names.get("en").map(String::as_str), Some("Articles"));
        assert_eq!(posts.names.get("zh").map(String::as_str), Some("文章"));
    }

    #[test]
    fn parse_features_returns_empty_without_block() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, "export const siteConfig = { posts: { toc: true } };\n");
        assert!(parse_features(&path).is_empty());
    }

    #[test]
    fn parse_features_returns_empty_when_file_missing() {
        assert!(parse_features(Path::new("/nonexistent/site.config.ts")).is_empty());
    }
}
