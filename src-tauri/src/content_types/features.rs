use std::collections::BTreeMap;
use std::path::Path;

use super::scanner::{extract_locale_pair, scan_code_lines, value_after_key};
use super::FeatureBucket;

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

    for line in scan_code_lines(&content) {
        let trimmed = line.trimmed.as_str();
        let opens = line.opens;
        let closes = line.closes;

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

#[cfg(test)]
mod tests {
    use super::super::test_util::write_config;
    use super::*;
    use tempfile::TempDir;

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

    #[test]
    fn parse_features_tolerates_trailing_comments_with_braces() {
        // A brace inside a trailing comment must not desync the depth
        // tracking that delimits buckets.
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  features: { // buckets: { posts }\n    posts: {\n      enabled: true, // always on {\n      name: { en: \"Articles\" },\n    },\n    series: {\n      enabled: false,\n      name: { en: \"Series\" },\n    },\n  },\n};\n",
        );
        let buckets = parse_features(&path);
        let ids: Vec<&str> = buckets.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec!["posts", "series"]);
        assert!(buckets[0].enabled);
        assert!(!buckets[1].enabled);
    }

    #[test]
    fn parse_features_tolerates_block_comments_around_the_block() {
        // The shared scanner gives every parser multi-line /* */ tolerance —
        // previously parse_features mis-read comment bodies as code.
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n/*\n  features: { ghost: { enabled: true } },\n*/\n  features: {\n    posts: { enabled: true, name: { en: \"Articles\" } },\n  },\n};\n",
        );
        let buckets = parse_features(&path);
        let ids: Vec<&str> = buckets.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec!["posts"]);
    }
}
