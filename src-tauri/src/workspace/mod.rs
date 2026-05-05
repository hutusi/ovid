use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::content_types::parse_cdn_base;

mod cache;
pub(crate) mod commands;
mod revision;
mod tree;

pub(crate) use cache::load_search_file_cached;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileNode {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) is_directory: bool,
    pub(crate) children: Option<Vec<FileNode>>,
    pub(crate) children_loaded: Option<bool>,
    pub(crate) extension: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) draft: Option<bool>,
    pub(crate) content_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceResult {
    pub(crate) name: String,
    pub(crate) root_path: String,
    pub(crate) tree_root: String,
    /// Directory to resolve root-relative image paths against.
    /// Set to `<workspace>/public` when that directory exists (static-site
    /// convention), otherwise falls back to the workspace root.
    pub(crate) asset_root: String,
    pub(crate) tree: Vec<FileNode>,
    pub(crate) is_amytis_workspace: bool,
    pub(crate) cdn_base: Option<String>,
    /// First entry from `posts.authors.default` in `site.config.ts`, if present.
    pub(crate) default_author: Option<String>,
}

/// Compute the asset-serving root and CDN base for a workspace.
/// `asset_root` is `<workspace>/public/` when that directory exists (static-site
/// convention), falling back to the workspace root itself.
/// `cdn_base` is read from `site.config.ts` whenever that file exists,
/// regardless of whether the full Amytis structure (content/ dir) is present.
pub(crate) fn derive_workspace_meta(root: &Path) -> (PathBuf, Option<String>) {
    let pub_dir = root.join("public");
    let asset_root = if pub_dir.is_dir() {
        pub_dir
    } else {
        root.to_path_buf()
    };
    let cdn_base = parse_cdn_base(&root.join("site.config.ts"));
    (asset_root, cdn_base)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── derive_workspace_meta ────────────────────────────────────────────────

    #[test]
    fn derive_workspace_meta_uses_public_dir_when_present() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("public")).unwrap();
        let (asset_root, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(asset_root, dir.path().join("public"));
        assert_eq!(cdn_base, None);
    }

    #[test]
    fn derive_workspace_meta_falls_back_to_workspace_root() {
        let dir = TempDir::new().unwrap();
        let (asset_root, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(asset_root, dir.path().to_path_buf());
        assert_eq!(cdn_base, None);
    }

    #[test]
    fn derive_workspace_meta_extracts_cdn_base_when_config_present() {
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("site.config.ts"),
            "export const config = {\n  cdnBase: 'https://cdn.example.com',\n};\n",
        )
        .unwrap();
        let (_, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(cdn_base, Some("https://cdn.example.com".to_string()));
    }

    #[test]
    fn derive_workspace_meta_extracts_cdn_base_url_when_config_present() {
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("site.config.ts"),
            "export const config = {\n  cdnBaseUrl: 'https://cdn.example.com',\n};\n",
        )
        .unwrap();
        let (_, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(cdn_base, Some("https://cdn.example.com".to_string()));
    }

    #[test]
    fn derive_workspace_meta_no_cdn_without_config() {
        let dir = TempDir::new().unwrap();
        // No site.config.ts — cdn_base must be None regardless of workspace type
        let (_, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(cdn_base, None);
    }
}
