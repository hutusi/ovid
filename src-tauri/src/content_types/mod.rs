use serde::Serialize;
use std::collections::BTreeMap;
use ts_rs::TS;

// Best-effort scanners for `site.config.ts`. Each parser is a small state
// machine over `scanner::scan_code_lines` (one shared comment-aware,
// brace-counting line scanner); all of them degrade to empty/`None` on any
// parse failure so a malformed or partial config never breaks workspace
// open. The structs below are the IPC surface (ts-rs generated types).

mod authors;
mod config_values;
mod features;
mod i18n;
mod scanner;

pub(crate) use authors::{parse_authors, parse_default_author};
pub(crate) use config_values::{parse_cdn_base, parse_posts_base_path};
pub(crate) use features::parse_features;
pub(crate) use i18n::parse_i18n;

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

/// A social link/QR entry under an author profile in `site.config.ts`'s
/// `authors:` map.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct AuthorSocial {
    pub(crate) image: String,
    pub(crate) description: String,
}

/// An author profile declared in `site.config.ts`'s top-level `authors:` map
/// (display name → bio / avatar / social). Distinct from `posts.authors`, which
/// only holds defaults; that block has no quoted-string keys, so it contributes
/// no entries here.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct Author {
    pub(crate) name: String,
    pub(crate) bio: Option<String>,
    pub(crate) avatar: Option<String>,
    pub(crate) social: Vec<AuthorSocial>,
}

/// The `i18n:` settings Ovid cares about: the configured `locales` and the
/// `defaultLocale`. Used to group `<slug>.<locale>` translation variants under
/// their base file in the sidebar. Empty `locales` disables grouping.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct I18nConfig {
    pub(crate) locales: Vec<String>,
    pub(crate) default_locale: Option<String>,
}

#[cfg(test)]
pub(super) mod test_util {
    use std::path::PathBuf;
    use tempfile::TempDir;

    pub(crate) fn write_config(dir: &TempDir, content: &str) -> PathBuf {
        let path = dir.path().join("site.config.ts");
        std::fs::write(&path, content).unwrap();
        path
    }
}
