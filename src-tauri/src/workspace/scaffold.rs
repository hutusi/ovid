//! Scaffolding for a brand-new Amytis workspace.
//!
//! The minimal stub produced here is just enough for
//! `build_workspace_result_core` to recognize the directory as an Amytis
//! workspace (`site.config.ts` file + `content/` directory present). The
//! user is expected to flesh out the config in their editor; we only seed
//! a parseable skeleton.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Reasons a `name` argument is not a valid workspace folder name.
#[derive(Debug, PartialEq)]
pub(crate) enum ScaffoldError {
    EmptyName,
    NameContainsSeparator,
    NameStartsWithDot,
    ParentMissing,
    TargetExists,
    Io(String),
}

impl From<io::Error> for ScaffoldError {
    fn from(value: io::Error) -> Self {
        ScaffoldError::Io(value.to_string())
    }
}

impl ScaffoldError {
    pub(crate) fn user_message(&self) -> String {
        match self {
            ScaffoldError::EmptyName => "Workspace name cannot be empty.".to_string(),
            ScaffoldError::NameContainsSeparator => {
                "Workspace name cannot contain `/` or `\\`.".to_string()
            }
            ScaffoldError::NameStartsWithDot => "Workspace name cannot start with `.`".to_string(),
            ScaffoldError::ParentMissing => {
                "The chosen parent directory does not exist.".to_string()
            }
            ScaffoldError::TargetExists => {
                "A folder with that name already exists at the chosen location.".to_string()
            }
            ScaffoldError::Io(msg) => format!("Filesystem error: {msg}"),
        }
    }
}

/// Validate the user-supplied workspace folder name. Returns the trimmed name.
pub(crate) fn validate_name(name: &str) -> Result<&str, ScaffoldError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(ScaffoldError::EmptyName);
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(ScaffoldError::NameContainsSeparator);
    }
    if trimmed.starts_with('.') {
        return Err(ScaffoldError::NameStartsWithDot);
    }
    Ok(trimmed)
}

/// Create the workspace skeleton at `<parent>/<name>` and return that path.
///
/// Layout:
/// ```text
/// <name>/
///   site.config.ts    — minimal stub (title + features + posts.basePath)
///   content/
///     posts/.gitkeep
///   README.md
/// ```
pub(crate) fn scaffold_amytis_workspace(
    parent: &Path,
    name: &str,
) -> Result<PathBuf, ScaffoldError> {
    let trimmed = validate_name(name)?;
    if !parent.is_dir() {
        return Err(ScaffoldError::ParentMissing);
    }
    let target = parent.join(trimmed);
    if target.exists() {
        return Err(ScaffoldError::TargetExists);
    }

    fs::create_dir(&target)?;
    // If any of the inner writes fails we'd otherwise leave a half-scaffolded
    // directory behind, which then makes the next attempt fail with
    // `TargetExists`. Bundle the writes in a closure so a single error path
    // can roll back the directory before propagating the failure.
    let write_result: Result<(), io::Error> = (|| {
        fs::create_dir_all(target.join("content").join("posts"))?;
        fs::write(target.join("content").join("posts").join(".gitkeep"), "")?;
        fs::write(target.join("site.config.ts"), minimal_site_config(trimmed))?;
        fs::write(target.join("README.md"), readme(trimmed))?;
        Ok(())
    })();
    if let Err(err) = write_result {
        let _ = fs::remove_dir_all(&target);
        return Err(ScaffoldError::Io(err.to_string()));
    }

    Ok(target)
}

fn minimal_site_config(name: &str) -> String {
    let escaped = name.replace('"', "\\\"");
    format!(
        r#"// Minimal Amytis site config. See https://github.com/hutusi/amytis
// for the full set of options. Edit freely — Ovid only requires this
// file (plus a `content/` directory) to recognise the folder as a
// workspace.

export const siteConfig = {{
  title: {{ en: "{escaped}" }},
  baseUrl: "",
  i18n: {{
    enabled: false,
    defaultLocale: 'en',
    locales: ['en'],
  }},
  features: {{
    posts: {{ enabled: true, name: {{ en: "Posts" }} }},
    notes: {{ enabled: true, name: {{ en: "Notes" }} }},
    series: {{ enabled: true, name: {{ en: "Series" }} }},
    books: {{ enabled: true, name: {{ en: "Books" }} }},
    flow: {{ enabled: true, name: {{ en: "Flow" }} }},
  }},
  posts: {{
    basePath: 'posts',
    authors: {{
      default: [] as string[],
    }},
  }},
}};
"#
    )
}

fn readme(name: &str) -> String {
    format!("# {name}\n\nAn Amytis workspace, created with Ovid.\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    use crate::workspace::commands::build_workspace_result_core;

    #[test]
    fn validate_name_trims_and_returns_ok() {
        assert_eq!(validate_name("  my-vault  ").unwrap(), "my-vault");
    }

    #[test]
    fn validate_name_rejects_empty() {
        assert_eq!(validate_name("   ").unwrap_err(), ScaffoldError::EmptyName);
    }

    #[test]
    fn validate_name_rejects_separators() {
        assert_eq!(
            validate_name("foo/bar").unwrap_err(),
            ScaffoldError::NameContainsSeparator
        );
        assert_eq!(
            validate_name("foo\\bar").unwrap_err(),
            ScaffoldError::NameContainsSeparator
        );
    }

    #[test]
    fn validate_name_rejects_dotfile() {
        assert_eq!(
            validate_name(".hidden").unwrap_err(),
            ScaffoldError::NameStartsWithDot
        );
    }

    #[test]
    fn scaffold_amytis_workspace_writes_skeleton() {
        let dir = TempDir::new().unwrap();
        let target = scaffold_amytis_workspace(dir.path(), "demo").unwrap();

        assert_eq!(target, dir.path().join("demo"));
        assert!(target.join("site.config.ts").is_file());
        assert!(target.join("content").is_dir());
        assert!(target.join("content/posts").is_dir());
        assert!(target.join("content/posts/.gitkeep").is_file());
        assert!(target.join("README.md").is_file());
    }

    #[test]
    fn scaffold_amytis_workspace_rejects_existing_target() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("demo")).unwrap();
        assert_eq!(
            scaffold_amytis_workspace(dir.path(), "demo").unwrap_err(),
            ScaffoldError::TargetExists
        );
    }

    #[test]
    fn scaffold_amytis_workspace_rejects_missing_parent() {
        let missing = PathBuf::from("/this/does/not/exist/ovid-test");
        assert_eq!(
            scaffold_amytis_workspace(&missing, "demo").unwrap_err(),
            ScaffoldError::ParentMissing
        );
    }

    #[test]
    fn scaffold_produces_dir_recognized_as_amytis_workspace() {
        // This composition test is the load-bearing guarantee: whatever the
        // scaffold writes must satisfy `is_amytis_workspace` so opening it
        // immediately afterwards behaves like opening any other workspace.
        let dir = TempDir::new().unwrap();
        let target = scaffold_amytis_workspace(dir.path(), "demo").unwrap();

        let mut cache = HashMap::new();
        let result = build_workspace_result_core(&target, &mut cache);

        assert!(result.is_amytis_workspace);
        assert!(result.tree_root.ends_with("/content"));
    }
}
