use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

// Stored per-host HTTPS credentials for git remotes. Persisted as a JSON file
// in the app config directory (e.g. ~/Library/Application Support/com.hutusi.ovid/
// git_credentials.json) with 0o600 perms on Unix. The keychain is avoided for
// the same reason as wechat creds — dev/code-signature churn breaks per-binary
// ACLs and triggers user prompts.

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

/// Read and parse the credentials JSON file into a host → credentials map.
/// Empty map when the file is missing or empty. Parse failures surface so a
/// corrupted file is not silently treated as empty (which would clobber
/// surviving entries on the next write).
pub(crate) fn read_creds_map(
    path: &Path,
) -> Result<BTreeMap<String, GitHostCredentials>, String> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        return Ok(BTreeMap::new());
    }
    serde_json::from_str(&content)
        .map_err(|e| format!("git credentials file is malformed: {e}"))
}

/// Atomically write the credentials file with restrictive permissions. The
/// tmp file is chmodded to 0o600 *before* the rename — rename preserves perms,
/// so setting them afterwards leaves a window where the secrets are world-
/// readable.
fn write_creds_atomic(path: &Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600)).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            e.to_string()
        })?;
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

pub(crate) fn get_host_credentials(
    path: &Path,
    host: &str,
) -> Result<Option<GitHostCredentials>, String> {
    let map = read_creds_map(path)?;
    Ok(map.get(host).cloned())
}

pub(crate) fn save_host_credentials(
    path: &Path,
    host: &str,
    username: &str,
    password: &str,
) -> Result<(), String> {
    let mut map = read_creds_map(path)?;
    map.insert(
        host.to_string(),
        GitHostCredentials {
            username: username.to_string(),
            password: password.to_string(),
        },
    );
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    write_creds_atomic(path, &content)
}

pub(crate) fn forget_host_credentials(path: &Path, host: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let mut map = read_creds_map(path)?;
    if map.remove(host).is_none() {
        return Ok(());
    }
    if map.is_empty() {
        // Surface remove failures: returning Ok would let the UI claim the
        // credential was forgotten while the file (and the entry inside it)
        // is still on disk, so the next push would silently reuse the
        // supposedly-revoked PAT.
        if let Err(err) = std::fs::remove_file(path) {
            if err.kind() != std::io::ErrorKind::NotFound {
                return Err(err.to_string());
            }
        }
    } else {
        let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
        write_creds_atomic(path, &content)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_host_credentials_returns_none_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        assert!(get_host_credentials(&path, "github.com").unwrap().is_none());
    }

    #[test]
    fn get_host_credentials_returns_err_when_file_is_malformed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        assert!(get_host_credentials(&path, "github.com").is_err());
    }

    #[test]
    fn save_host_credentials_returns_err_when_existing_file_is_malformed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        assert!(save_host_credentials(&path, "github.com", "u", "p").is_err());
        // Malformed file must not be overwritten — leave it for inspection.
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{not valid json"
        );
    }

    #[test]
    fn get_host_credentials_treats_empty_file_as_no_creds() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        std::fs::write(&path, "").unwrap();
        assert!(get_host_credentials(&path, "github.com").unwrap().is_none());
    }

    #[test]
    fn save_and_get_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "alice", "ghp_token").unwrap();
        let creds = get_host_credentials(&path, "github.com").unwrap().unwrap();
        assert_eq!(creds.username, "alice");
        assert_eq!(creds.password, "ghp_token");
    }

    #[cfg(unix)]
    #[test]
    fn save_host_credentials_writes_file_with_owner_only_perms() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "alice", "ghp_token").unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn save_host_credentials_coexists_for_multiple_hosts() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "alice", "gh_t").unwrap();
        save_host_credentials(&path, "gitlab.com", "bob", "gl_t").unwrap();
        let gh = get_host_credentials(&path, "github.com").unwrap().unwrap();
        let gl = get_host_credentials(&path, "gitlab.com").unwrap().unwrap();
        assert_eq!(gh.username, "alice");
        assert_eq!(gl.username, "bob");
    }

    #[test]
    fn save_host_credentials_overwrites_existing_entry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "alice", "old").unwrap();
        save_host_credentials(&path, "github.com", "alice", "new").unwrap();
        assert_eq!(
            get_host_credentials(&path, "github.com").unwrap().unwrap().password,
            "new"
        );
    }

    #[test]
    fn forget_host_credentials_removes_one_and_leaves_others() {
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
    fn forget_host_credentials_removes_file_when_last_entry_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "a", "1").unwrap();
        forget_host_credentials(&path, "github.com").unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn forget_host_credentials_is_noop_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        assert!(forget_host_credentials(&path, "github.com").is_ok());
    }

    #[test]
    fn forget_host_credentials_is_noop_when_key_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("git_creds.json");
        save_host_credentials(&path, "github.com", "a", "1").unwrap();
        forget_host_credentials(&path, "gitlab.com").unwrap();
        // Surviving key still intact.
        assert!(get_host_credentials(&path, "github.com").unwrap().is_some());
    }
}
