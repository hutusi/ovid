use std::path::{Path, PathBuf};

use tauri::{Manager, State};

use crate::state::{WechatCredStatus, WechatState};

use super::{WECHAT_APP_ID_KEY, WECHAT_APP_SECRET_KEY};

// Credentials are stored as a plain JSON file in the app config directory
// (e.g. ~/Library/Application Support/com.hutusi.ovid/wechat_credentials.json).
// This avoids macOS Keychain ACL prompts that arise from per-app-binary access
// policies — which break in dev mode and are fragile across code-signature changes.
pub(crate) fn wechat_creds_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("wechat_credentials.json"))
        .map_err(|e| e.to_string())
}

/// Read and parse the credentials JSON file into a map.
/// Returns an empty map when the file does not exist or is empty.
/// Surfaces parse errors so a corrupted file is not silently treated as empty
/// (which would otherwise clobber the surviving key on the next write).
fn read_creds_map(path: &Path) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        return Ok(serde_json::Map::new());
    }
    serde_json::from_str(&content)
        .map_err(|e| format!("wechat credentials file is malformed: {e}"))
}

/// Atomically write the credentials JSON file with restrictive permissions.
/// The tmp file is chmodded to 0o600 *before* the rename so the destination
/// is never readable by other local users (rename preserves perms; setting
/// them after rename leaves a TOCTOU window where the secret is world-readable).
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

pub(crate) fn wechat_get_cred(path: &Path, key: &str) -> Result<Option<String>, String> {
    let map = read_creds_map(path)?;
    Ok(map.get(key).and_then(|v| v.as_str()).map(|s| s.to_string()))
}

pub(crate) fn wechat_set_cred(path: &Path, key: &str, value: &str) -> Result<(), String> {
    let mut map = read_creds_map(path)?;
    map.insert(key.to_string(), serde_json::Value::String(value.to_string()));
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    write_creds_atomic(path, &content)
}

pub(crate) fn wechat_del_cred(path: &Path, key: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let mut map = read_creds_map(path)?;
    map.remove(key);
    if map.is_empty() {
        let _ = std::fs::remove_file(path);
    } else {
        let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
        write_creds_atomic(path, &content)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_wechat_credentials_status(app: tauri::AppHandle) -> Result<WechatCredStatus, String> {
    let path = wechat_creds_path(&app)?;
    let app_id = wechat_get_cred(&path, WECHAT_APP_ID_KEY)?;
    let has_secret = wechat_get_cred(&path, WECHAT_APP_SECRET_KEY)?.is_some();
    Ok(WechatCredStatus { app_id, has_secret })
}

#[tauri::command]
pub(crate) fn set_wechat_credentials(
    app: tauri::AppHandle,
    app_id: String,
    app_secret: String,
    wechat_state: State<'_, WechatState>,
) -> Result<(), String> {
    let path = wechat_creds_path(&app)?;
    wechat_set_cred(&path, WECHAT_APP_ID_KEY, &app_id)?;
    wechat_set_cred(&path, WECHAT_APP_SECRET_KEY, &app_secret)?;
    *wechat_state.token_cache.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub(crate) fn clear_wechat_credentials(
    app: tauri::AppHandle,
    wechat_state: State<'_, WechatState>,
) -> Result<(), String> {
    *wechat_state.token_cache.lock().map_err(|e| e.to_string())? = None;
    let path = wechat_creds_path(&app)?;
    wechat_del_cred(&path, WECHAT_APP_ID_KEY)?;
    wechat_del_cred(&path, WECHAT_APP_SECRET_KEY)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── wechat credential file helpers ───────────────────────────────────────

    #[test]
    fn wechat_get_cred_returns_none_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        assert_eq!(wechat_get_cred(&path, "app_id").unwrap(), None);
    }

    #[test]
    fn wechat_get_cred_returns_err_when_file_is_malformed_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        assert!(wechat_get_cred(&path, "app_id").is_err());
    }

    #[test]
    fn wechat_set_cred_returns_err_when_existing_file_is_malformed() {
        // A corrupted credentials file must not be silently overwritten —
        // doing so would clobber the surviving credential half on the next set.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        assert!(wechat_set_cred(&path, "app_id", "wx123").is_err());
        // The malformed file must be left in place for inspection / recovery.
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "{not valid json"
        );
    }

    #[test]
    fn wechat_get_cred_treats_empty_file_as_no_creds() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "").unwrap();
        assert_eq!(wechat_get_cred(&path, "app_id").unwrap(), None);
    }

    #[test]
    fn wechat_set_cred_creates_file_and_get_returns_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "wx123").unwrap();
        assert_eq!(
            wechat_get_cred(&path, "app_id").unwrap(),
            Some("wx123".to_string())
        );
    }

    #[cfg(unix)]
    #[test]
    fn wechat_set_cred_writes_file_with_owner_only_perms() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_secret", "very-secret").unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn wechat_set_cred_two_keys_coexist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "wx123").unwrap();
        wechat_set_cred(&path, "app_secret", "secret456").unwrap();
        assert_eq!(
            wechat_get_cred(&path, "app_id").unwrap(),
            Some("wx123".to_string())
        );
        assert_eq!(
            wechat_get_cred(&path, "app_secret").unwrap(),
            Some("secret456".to_string())
        );
    }

    #[test]
    fn wechat_set_cred_overwrites_existing_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "old").unwrap();
        wechat_set_cred(&path, "app_id", "new").unwrap();
        assert_eq!(
            wechat_get_cred(&path, "app_id").unwrap(),
            Some("new".to_string())
        );
    }

    #[test]
    fn wechat_del_cred_removes_key_and_leaves_other() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "wx123").unwrap();
        wechat_set_cred(&path, "app_secret", "secret456").unwrap();
        wechat_del_cred(&path, "app_id").unwrap();
        assert_eq!(wechat_get_cred(&path, "app_id").unwrap(), None);
        assert_eq!(
            wechat_get_cred(&path, "app_secret").unwrap(),
            Some("secret456".to_string())
        );
    }

    #[test]
    fn wechat_del_cred_removes_file_when_last_key_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "wx123").unwrap();
        wechat_del_cred(&path, "app_id").unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn wechat_del_cred_is_noop_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        assert!(wechat_del_cred(&path, "app_id").is_ok());
    }

    #[test]
    fn wechat_get_cred_returns_none_for_missing_key_in_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "wx123").unwrap();
        assert_eq!(wechat_get_cred(&path, "app_secret").unwrap(), None);
    }
}
