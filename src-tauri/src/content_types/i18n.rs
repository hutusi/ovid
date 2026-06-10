use std::path::Path;

use super::scanner::{
    capture_object_block, extract_quoted_string, extract_string_array, slice_bracketed,
    value_after_key,
};
use super::I18nConfig;

/// Best-effort scanner: read `i18n.locales` and `i18n.defaultLocale` from
/// `site.config.ts`. Captures the whole `i18n { ... }` block first, so it works
/// for single-line objects and multi-line `locales` arrays alike. When
/// `i18n.enabled` is `false`, the site uses a single locale, so the returned
/// `locales` is empty (grouping disabled). Returns an empty config on any parse
/// failure.
pub(crate) fn parse_i18n(config_path: &Path) -> I18nConfig {
    let mut result = I18nConfig {
        locales: Vec::new(),
        default_locale: None,
    };
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return result;
    };
    let Some(block) = capture_object_block(&content, "i18n") else {
        return result;
    };

    let enabled = match value_after_key(&block, "enabled") {
        Some(v) => !v.trim_start().starts_with("false"),
        None => true,
    };
    if !enabled {
        return result;
    }

    if let Some(v) = value_after_key(&block, "defaultLocale") {
        if let Some(s) = extract_quoted_string(v.trim_start()) {
            result.default_locale = Some(s);
        }
    }
    if let Some(v) = value_after_key(&block, "locales") {
        result.locales = extract_string_array(slice_bracketed(v).unwrap_or(v));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::super::test_util::write_config;
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn parse_i18n_reads_locales_and_default_locale() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: {\n    enabled: true,\n    defaultLocale: 'en',\n    locales: ['en', 'zh'],\n  },\n};\n",
        );
        let cfg = parse_i18n(&path);
        assert_eq!(cfg.locales, vec!["en".to_string(), "zh".to_string()]);
        assert_eq!(cfg.default_locale.as_deref(), Some("en"));
    }

    #[test]
    fn parse_i18n_disabled_yields_no_locales() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: {\n    enabled: false,\n    defaultLocale: 'en',\n    locales: ['en', 'zh'],\n  },\n};\n",
        );
        let cfg = parse_i18n(&path);
        assert!(cfg.locales.is_empty());
    }

    #[test]
    fn parse_i18n_does_not_confuse_default_locale_with_locales() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: {\n    defaultLocale: 'zh',\n    locales: ['en', 'zh', 'ja'],\n  },\n};\n",
        );
        let cfg = parse_i18n(&path);
        assert_eq!(cfg.default_locale.as_deref(), Some("zh"));
        assert_eq!(cfg.locales.len(), 3);
    }

    #[test]
    fn parse_i18n_returns_empty_when_absent() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, "export const siteConfig = { posts: { toc: true } };\n");
        let cfg = parse_i18n(&path);
        assert!(cfg.locales.is_empty());
        assert!(cfg.default_locale.is_none());
    }

    #[test]
    fn parse_i18n_reads_single_line_block() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: { enabled: true, defaultLocale: 'en', locales: ['en', 'zh'] },\n};\n",
        );
        let cfg = parse_i18n(&path);
        assert_eq!(cfg.locales, vec!["en".to_string(), "zh".to_string()]);
        assert_eq!(cfg.default_locale.as_deref(), Some("en"));
    }

    #[test]
    fn parse_i18n_reads_multiline_locales_array() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: {\n    defaultLocale: 'en',\n    locales: [\n      'en',\n      'zh',\n      'ja',\n    ],\n  },\n};\n",
        );
        let cfg = parse_i18n(&path);
        assert_eq!(
            cfg.locales,
            vec!["en".to_string(), "zh".to_string(), "ja".to_string()]
        );
        assert_eq!(cfg.default_locale.as_deref(), Some("en"));
    }

    #[test]
    fn parse_i18n_returns_empty_when_file_missing() {
        let cfg = parse_i18n(Path::new("/nonexistent/site.config.ts"));
        assert!(cfg.locales.is_empty());
    }

    #[test]
    fn parse_i18n_rejects_an_unclosed_block() {
        // A truncated/malformed file must degrade to "not found", not feed
        // a partial capture (which could span unrelated config) downstream.
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: {\n    defaultLocale: 'en',\n    locales: ['en', 'zh'],\n",
        );
        let cfg = parse_i18n(&path);
        assert!(cfg.locales.is_empty());
        assert!(cfg.default_locale.is_none());
    }

    #[test]
    fn parse_i18n_tolerates_trailing_comments_with_braces() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const siteConfig = {\n  i18n: { // shape: { locales }\n    defaultLocale: 'en',\n    locales: ['en', 'zh'],\n  },\n};\n",
        );
        let cfg = parse_i18n(&path);
        assert_eq!(cfg.locales, vec!["en".to_string(), "zh".to_string()]);
        assert_eq!(cfg.default_locale.as_deref(), Some("en"));
    }
}
