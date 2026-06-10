use std::path::Path;

use super::scanner::{extract_quoted_key, extract_quoted_string, scan_code_lines, value_after_key};
use super::{Author, AuthorSocial};

/// Best-effort scanner: read author profiles from any `authors:` block in
/// `site.config.ts`. Only entries with a quoted-string key (the author's display
/// name) mapping to an object are collected, so `posts.authors` (bare keys)
/// yields nothing. Returns an empty vec on any parse failure.
pub(crate) fn parse_authors(config_path: &Path) -> Vec<Author> {
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return Vec::new();
    };
    let mut authors: Vec<Author> = Vec::new();
    let mut depth: i32 = 0;
    let mut authors_depth: Option<i32> = None;
    let mut current: Option<Author> = None;
    // A social entry's `image` and `description` may sit on separate lines, so
    // accumulate them and flush once both are known (handles inline and
    // multiline `{ image, description }` objects regardless of key order).
    let mut pending_image: Option<String> = None;
    let mut pending_desc: Option<String> = None;

    for line in scan_code_lines(&content) {
        let trimmed = line.trimmed;
        let opens = line.opens;
        let closes = line.closes;
        let after = depth + opens - closes;

        if let Some(adepth) = authors_depth {
            if current.is_none() {
                if depth == adepth && opens > 0 {
                    if let Some(name) = extract_quoted_key(trimmed) {
                        pending_image = None;
                        pending_desc = None;
                        current = Some(Author {
                            name,
                            bio: None,
                            avatar: None,
                            social: Vec::new(),
                        });
                    }
                }
            } else if let Some(author) = current.as_mut() {
                if let Some(v) = value_after_key(trimmed, "bio") {
                    if let Some(s) = extract_quoted_string(v.trim_start()) {
                        author.bio = Some(s);
                    }
                }
                if let Some(v) = value_after_key(trimmed, "avatar") {
                    if let Some(s) = extract_quoted_string(v.trim_start()) {
                        author.avatar = Some(s);
                    }
                }
                if let Some(v) = value_after_key(trimmed, "image") {
                    if let Some(s) = extract_quoted_string(v.trim_start()) {
                        pending_image = Some(s);
                    }
                }
                if let Some(v) = value_after_key(trimmed, "description") {
                    if let Some(s) = extract_quoted_string(v.trim_start()) {
                        pending_desc = Some(s);
                    }
                }
                if pending_image.is_some() && pending_desc.is_some() {
                    author.social.push(AuthorSocial {
                        image: pending_image.take().unwrap(),
                        description: pending_desc.take().unwrap(),
                    });
                }
                // The author object closes when depth returns to the key level.
                if after <= adepth {
                    authors.push(current.take().unwrap());
                    pending_image = None;
                    pending_desc = None;
                }
            }
            depth = after;
            if depth < adepth {
                authors_depth = None;
            }
            continue;
        }

        if value_after_key(trimmed, "authors").is_some() && opens > closes {
            authors_depth = Some(depth + 1);
        }
        depth = after;
    }
    if let Some(a) = current.take() {
        authors.push(a);
    }
    authors
}

/// Best-effort scanner: read the first entry from `posts.authors.default` in
/// `site.config.ts`. Returns `None` on any parse failure so callers degrade
/// gracefully when the workspace has no site config.
pub(crate) fn parse_default_author(config_path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(config_path).ok()?;
    let mut in_authors = false;
    let mut brace_depth: i32 = 0;
    let mut authors_depth: i32 = 0;

    for line in scan_code_lines(&content) {
        let trimmed = line.trimmed;
        let opens = line.opens;
        let closes = line.closes;

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
fn parse_authors_default(trimmed: &str) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::super::test_util::write_config;
    use super::*;
    use tempfile::TempDir;

    const AUTHORS_CONFIG: &str = r#"export const siteConfig = {
  posts: {
    authors: {
      default: ["John Hu"] as string[],
      showInHeader: true,
      showAuthorCard: true,
    },
  },
  authors: {
    "John Hu": {
      bio: "Coder, Writer, Creator.",
      avatar: "/images/avatar.jpg",
      social: [
        { image: "/images/wechat-qr.jpg", description: "Follow on WeChat" },
      ],
    },
    "Jane Doe": {
      bio: "Designer.",
      avatar: "/images/jane.jpg",
      social: [],
    },
  } as Record<string, {
    bio?: string;
    avatar?: string;
    social?: Array<{
      image: string;
      description: string;
    }>;
  }>,
};
"#;

    #[test]
    fn parse_authors_reads_profiles_skipping_posts_authors_defaults() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, AUTHORS_CONFIG);
        let authors = parse_authors(&path);
        let names: Vec<&str> = authors.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["John Hu", "Jane Doe"]);
    }

    #[test]
    fn parse_authors_reads_bio_avatar_and_social() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, AUTHORS_CONFIG);
        let authors = parse_authors(&path);
        let john = authors.iter().find(|a| a.name == "John Hu").unwrap();
        assert_eq!(john.bio.as_deref(), Some("Coder, Writer, Creator."));
        assert_eq!(john.avatar.as_deref(), Some("/images/avatar.jpg"));
        assert_eq!(john.social.len(), 1);
        assert_eq!(john.social[0].image, "/images/wechat-qr.jpg");
        assert_eq!(john.social[0].description, "Follow on WeChat");
    }

    #[test]
    fn parse_authors_handles_empty_social_array() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, AUTHORS_CONFIG);
        let authors = parse_authors(&path);
        let jane = authors.iter().find(|a| a.name == "Jane Doe").unwrap();
        assert_eq!(jane.bio.as_deref(), Some("Designer."));
        assert!(jane.social.is_empty());
    }

    #[test]
    fn parse_authors_does_not_treat_type_annotation_as_authors() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, AUTHORS_CONFIG);
        // The `} as Record<string, { ... }>` type annotation must not leak in.
        let authors = parse_authors(&path);
        assert_eq!(authors.len(), 2);
    }

    #[test]
    fn parse_authors_returns_empty_when_file_missing() {
        assert!(parse_authors(Path::new("/nonexistent/site.config.ts")).is_empty());
    }

    #[test]
    fn parse_authors_reads_multiline_social_object() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  authors: {\n    \"John Hu\": {\n      bio: \"Coder.\",\n      social: [\n        {\n          image: \"/images/wechat-qr.jpg\",\n          description: \"Follow on WeChat\",\n        },\n      ],\n    },\n  },\n};\n",
        );
        let authors = parse_authors(&path);
        let john = authors.iter().find(|a| a.name == "John Hu").unwrap();
        assert_eq!(john.social.len(), 1);
        assert_eq!(john.social[0].image, "/images/wechat-qr.jpg");
        assert_eq!(john.social[0].description, "Follow on WeChat");
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
    fn parse_default_author_ignores_block_comments() {
        // Block-comment tolerance comes from the shared scanner — the old
        // parser would have read the commented-out default.
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "/*\nposts: { authors: { default: [\"Fake\"] } },\n*/\nexport const siteConfig = {\n  posts: {\n    authors: {\n      default: [\"Real Author\"],\n    },\n  },\n};\n",
        );
        assert_eq!(parse_default_author(&path), Some("Real Author".to_string()));
    }
}
