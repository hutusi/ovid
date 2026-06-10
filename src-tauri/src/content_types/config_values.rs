use std::path::Path;

use super::scanner::{extract_quoted_string, scan_code_lines, strip_quote_pair};

/// Best-effort scanner: look for `cdnBase`, `cdnBaseUrl`, or `cdnUrl` keys in
/// `site.config.ts` and return the URL value. Handles both bare (`cdnBase:`)
/// and quoted (`"cdnBase":` / `'cdnBase':`) key forms. Returns `None` on any
/// parse failure.
pub(crate) fn parse_cdn_base(config_path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(config_path).ok()?;
    for line in scan_code_lines(&content) {
        let trimmed = line.trimmed;
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

/// Best-effort scanner: read `posts.basePath` from `site.config.ts` (the only
/// `basePath:` key Amytis defines). Returns `None` on any parse failure so the
/// caller falls back to the conventional `posts` folder name.
pub(crate) fn parse_posts_base_path(config_path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(config_path).ok()?;
    for line in scan_code_lines(&content) {
        let trimmed = line.trimmed;
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
    use super::super::test_util::write_config;
    use super::*;
    use tempfile::TempDir;

    // ── parse_cdn_base ───────────────────────────────────────────────────────

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

    #[test]
    fn parse_cdn_base_skips_multi_line_block_comments() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "/* This config has no CDN\n  cdnBase: 'https://cdn.example.com'\n*/\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
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
}
