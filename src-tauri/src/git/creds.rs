use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::creds_store::CredsStore;

// Stored per-host HTTPS credentials for git remotes. Persisted via the
// shared creds store (JSON file in the app config directory, e.g.
// ~/Library/Application Support/com.hutusi.ovid/git_credentials.json, with
// 0o600 perms on Unix) — see creds_store.rs for why the keychain is avoided.

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub(crate) struct GitHostCredentials {
    pub(crate) username: String,
    pub(crate) password: String,
}

pub(crate) fn git_creds_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("git_credentials.json"))
        .map_err(|e| e.to_string())
}

fn store(path: &Path) -> CredsStore<GitHostCredentials> {
    CredsStore::new(path, "git")
}

pub(crate) fn get_host_credentials(
    path: &Path,
    host: &str,
) -> Result<Option<GitHostCredentials>, String> {
    store(path).get(host)
}

pub(crate) fn save_host_credentials(
    path: &Path,
    host: &str,
    username: &str,
    password: &str,
) -> Result<(), String> {
    store(path).set(
        host,
        GitHostCredentials {
            username: username.to_string(),
            password: password.to_string(),
        },
    )
}

pub(crate) fn forget_host_credentials(path: &Path, host: &str) -> Result<(), String> {
    store(path).remove(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The store mechanics (atomicity, perms, corruption tolerance) are
    // covered in creds_store.rs; these tests pin the git adapter surface:
    // the struct value type, the error label, and the file name contract.

    #[test]
    fn save_and_get_roundtrip_struct_values() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "alice", "ghp_token").unwrap();
        let creds = get_host_credentials(&path, "github.com").unwrap().unwrap();
        assert_eq!(creds.username, "alice");
        assert_eq!(creds.password, "ghp_token");
    }

    #[test]
    fn malformed_file_errors_carry_the_git_label() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        let err = get_host_credentials(&path, "github.com").unwrap_err();
        assert!(err.starts_with("git credentials file is malformed:"), "{err}");
    }

    #[test]
    fn forget_removes_one_host_and_leaves_others() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "a", "1").unwrap();
        save_host_credentials(&path, "gitlab.com", "b", "2").unwrap();
        forget_host_credentials(&path, "github.com").unwrap();
        assert!(get_host_credentials(&path, "github.com").unwrap().is_none());
        assert_eq!(
            get_host_credentials(&path, "gitlab.com").unwrap().unwrap().username,
            "b"
        );
    }

    #[test]
    fn reads_files_written_by_the_pre_store_code() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        std::fs::write(
            &path,
            "{\n  \"github.com\": {\n    \"username\": \"alice\",\n    \"password\": \"tok\"\n  }\n}",
        )
        .unwrap();
        let creds = get_host_credentials(&path, "github.com").unwrap().unwrap();
        assert_eq!(creds.username, "alice");
        assert_eq!(creds.password, "tok");
    }
}
