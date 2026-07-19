use std::path::{Path, PathBuf};

use tauri::{Manager, State};

use crate::creds_store::CredsStore;
use crate::state::{WechatCredStatus, WechatState};

use super::{WECHAT_APP_ID_KEY, WECHAT_APP_SECRET_KEY};

// WeChat app credentials, persisted via the shared creds store (JSON file
// in the app config directory, e.g. ~/Library/Application Support/
// com.hutusi.ovid/wechat_credentials.json) — see creds_store.rs for why the
// keychain is avoided.
pub(crate) fn wechat_creds_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("wechat_credentials.json"))
        .map_err(|e| e.to_string())
}

fn store(path: &Path) -> CredsStore<String> {
    CredsStore::new(path, "wechat")
}

pub(crate) fn wechat_get_cred(path: &Path, key: &str) -> Result<Option<String>, String> {
    store(path).get(key)
}

pub(crate) fn wechat_set_cred(path: &Path, key: &str, value: &str) -> Result<(), String> {
    store(path).set(key, value.to_string())
}

pub(crate) fn wechat_del_cred(path: &Path, key: &str) -> Result<(), String> {
    store(path).remove(key)
}

#[tauri::command]
pub(crate) fn get_wechat_credentials_status(
    app: tauri::AppHandle,
) -> Result<WechatCredStatus, String> {
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

    // The store mechanics (atomicity, perms, corruption tolerance) are
    // covered in creds_store.rs; these tests pin the wechat adapter
    // surface: the two well-known keys and the error label.

    #[test]
    fn set_and_get_the_two_wechat_keys() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, WECHAT_APP_ID_KEY, "wx123").unwrap();
        wechat_set_cred(&path, WECHAT_APP_SECRET_KEY, "secret456").unwrap();
        assert_eq!(
            wechat_get_cred(&path, WECHAT_APP_ID_KEY).unwrap(),
            Some("wx123".to_string())
        );
        assert_eq!(
            wechat_get_cred(&path, WECHAT_APP_SECRET_KEY).unwrap(),
            Some("secret456".to_string())
        );
    }

    #[test]
    fn malformed_file_errors_carry_the_wechat_label() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        let err = wechat_get_cred(&path, "app_id").unwrap_err();
        assert!(
            err.starts_with("wechat credentials file is malformed:"),
            "{err}"
        );
    }

    #[test]
    fn del_removes_key_and_deletes_file_when_last() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        wechat_set_cred(&path, "app_id", "wx123").unwrap();
        wechat_set_cred(&path, "app_secret", "s").unwrap();
        wechat_del_cred(&path, "app_id").unwrap();
        assert_eq!(wechat_get_cred(&path, "app_id").unwrap(), None);
        assert_eq!(
            wechat_get_cred(&path, "app_secret").unwrap(),
            Some("s".to_string())
        );
        wechat_del_cred(&path, "app_secret").unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn reads_files_written_by_the_pre_store_code() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(
            &path,
            "{\n  \"app_id\": \"wx123\",\n  \"app_secret\": \"s\"\n}",
        )
        .unwrap();
        assert_eq!(
            wechat_get_cred(&path, "app_id").unwrap(),
            Some("wx123".to_string())
        );
    }
}
