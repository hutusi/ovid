// The one comment-aware, brace-counting line scanner behind every
// site.config.ts parser, plus the small string helpers they share. Before
// the consolidation each parser re-implemented comment skipping (with
// inconsistent block-comment support) and brace-depth tracking; now the
// tokenizing lives here and the per-parser files keep only their genuinely
// different state machines.

/// One line of code surviving comment filtering, with its brace counts.
pub(super) struct CodeLine<'a> {
    pub(super) trimmed: &'a str,
    pub(super) opens: i32,
    pub(super) closes: i32,
}

/// Iterate the code lines of a TS config: skips `//` lines, `*` JSDoc
/// continuations, and `/* … */` block comments (single- or multi-line).
pub(super) fn scan_code_lines(content: &str) -> impl Iterator<Item = CodeLine<'_>> {
    let mut in_block_comment = false;
    content.lines().filter_map(move |raw| {
        let trimmed = raw.trim();
        if in_block_comment {
            if trimmed.contains("*/") {
                in_block_comment = false;
            }
            return None;
        }
        if trimmed.starts_with("/*") {
            if !trimmed.contains("*/") {
                in_block_comment = true;
            }
            return None;
        }
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            return None;
        }
        let opens = raw.chars().filter(|&c| c == '{').count() as i32;
        let closes = raw.chars().filter(|&c| c == '}').count() as i32;
        Some(CodeLine {
            trimmed,
            opens,
            closes,
        })
    })
}

/// Return the slice after `key:` when `line` contains `key` as a bare property
/// name at a word boundary. Used to read scalar fields (`enabled:`) and locate
/// nested sub-objects (`name:` inside a feature bucket).
pub(super) fn value_after_key<'a>(line: &'a str, key: &str) -> Option<&'a str> {
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

/// Extract the first quoted string value from the beginning of `s`.
pub(super) fn extract_quoted_string(s: &str) -> Option<String> {
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
pub(super) fn strip_quote_pair<'a>(s: &'a str, key: &str, quote: char) -> Option<&'a str> {
    let s = s.strip_prefix(quote)?;
    let s = s.strip_prefix(key)?;
    s.strip_prefix(quote)
}

/// Read a quoted property-name key (e.g. `"John Hu": {`) from the start of a
/// line. Bare keys (`default:`) return `None`, which is how author profiles are
/// told apart from the scalar fields in `posts.authors`.
pub(super) fn extract_quoted_key(line: &str) -> Option<String> {
    let line = line.trim();
    let first = line.chars().next()?;
    if first != '"' && first != '\'' {
        return None;
    }
    extract_quoted_string(line)
}

/// Parse a single `<locale>: "name"` pair from a comma-delimited fragment such as
/// `{ en: "Articles"` or ` zh: "文章" }`. Returns `None` when the fragment is not
/// a string-valued entry (e.g. `enabled: true` or the `name: {` opener).
pub(super) fn extract_locale_pair(part: &str) -> Option<(String, String)> {
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

/// Extract every quoted string from an inline array fragment such as
/// `['en', 'zh']`.
pub(super) fn extract_string_array(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = s;
    loop {
        let Some(qpos) = rest.find(['\'', '"', '`']) else {
            break;
        };
        let sub = &rest[qpos..];
        let Some(value) = extract_quoted_string(sub) else {
            break;
        };
        out.push(value);
        let quote = sub.chars().next().unwrap();
        let after_open = &sub[quote.len_utf8()..];
        let Some(end) = after_open.find(quote) else {
            break;
        };
        rest = &rest[qpos + quote.len_utf8() + end + quote.len_utf8()..];
    }
    out
}

/// Return the text between the first `[` and its matching `]` in `s`.
pub(super) fn slice_bracketed(s: &str) -> Option<&str> {
    let start = s.find('[')?;
    let mut depth = 0i32;
    for (i, ch) in s[start..].char_indices() {
        if ch == '[' {
            depth += 1;
        } else if ch == ']' {
            depth -= 1;
            if depth == 0 {
                return Some(&s[start + 1..start + i]);
            }
        }
    }
    None
}

/// Capture the inner text of the first `key: { ... }` object as a single string,
/// joining its code lines. Brace-counted so it works whether the object is
/// written on one line or many; expects the opening `{` on the same line as
/// `key`. Returns `None` when the key/object isn't found.
pub(super) fn capture_object_block(content: &str, key: &str) -> Option<String> {
    let mut buf = String::new();
    let mut depth: i32 = 0;
    let mut started = false;

    for line in scan_code_lines(content) {
        let trimmed = line.trimmed;
        if !started {
            let Some(after) = value_after_key(trimmed, key) else {
                continue;
            };
            let Some(brace) = after.find('{') else {
                continue;
            };
            started = true;
            let from_brace = &after[brace..];
            for ch in from_brace.chars() {
                if ch == '{' {
                    depth += 1;
                } else if ch == '}' {
                    depth -= 1;
                }
            }
            buf.push_str(&from_brace[1..]);
            buf.push('\n');
            if depth <= 0 {
                return Some(buf);
            }
        } else {
            for ch in trimmed.chars() {
                if ch == '{' {
                    depth += 1;
                } else if ch == '}' {
                    depth -= 1;
                }
            }
            buf.push_str(trimmed);
            buf.push('\n');
            if depth <= 0 {
                return Some(buf);
            }
        }
    }
    if started { Some(buf) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── scan_code_lines ──────────────────────────────────────────────────────

    fn code_lines(content: &str) -> Vec<String> {
        scan_code_lines(content)
            .map(|l| l.trimmed.to_string())
            .collect()
    }

    #[test]
    fn scan_skips_line_comments_and_jsdoc_continuations() {
        let src = "// header\ncode1\n * jsdoc body\ncode2\n";
        assert_eq!(code_lines(src), vec!["code1", "code2"]);
    }

    #[test]
    fn scan_skips_single_line_block_comment() {
        let src = "/* one line */\ncode\n";
        assert_eq!(code_lines(src), vec!["code"]);
    }

    #[test]
    fn scan_skips_multi_line_block_comment() {
        let src = "code1\n/*\nhidden: { ignored }\nstill hidden\n*/\ncode2\n";
        assert_eq!(code_lines(src), vec!["code1", "code2"]);
    }

    #[test]
    fn scan_counts_braces_per_line() {
        let lines: Vec<_> = scan_code_lines("a: { b: { } }\n}\n").collect();
        assert_eq!((lines[0].opens, lines[0].closes), (2, 2));
        assert_eq!((lines[1].opens, lines[1].closes), (0, 1));
    }

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
}
