use std::collections::BTreeMap;
use std::marker::PhantomData;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::de::DeserializeOwned;
use serde::Serialize;

/// Serializes every read-modify-write across all stores in this process.
/// `set`/`remove` re-read the whole map before writing it back; two
/// concurrent Tauri commands hitting the same file (e.g. the two sequential
/// sets in `set_wechat_credentials` racing a clear) could otherwise both
/// start from the same snapshot and the last writer would drop the other's
/// key. One process-wide lock is enough — contention is a few writes per
/// user action, and reads stay lock-free (the atomic rename means a reader
/// always sees a complete file).
static WRITE_LOCK: Mutex<()> = Mutex::new(());

// One credentials store for every domain that persists secrets as a JSON
// key→value file in the app config dir (git per-host HTTPS credentials,
// WeChat app id/secret). The keychain is deliberately avoided — dev/code-
// signature churn breaks per-binary ACLs and triggers user prompts. The
// domain adapters (git/creds.rs, wechat/creds.rs) own their file name,
// value type, and command surface; this module owns the corruption-tolerant
// parsing and the atomic 0o600 write.

pub(crate) struct CredsStore<V> {
    path: PathBuf,
    /// Error-message prefix ("git", "wechat") so UX copy stays
    /// domain-specific.
    label: &'static str,
    _value: PhantomData<V>,
}

impl<V: Serialize + DeserializeOwned> CredsStore<V> {
    pub(crate) fn new(path: &Path, label: &'static str) -> Self {
        Self {
            path: path.to_path_buf(),
            label,
            _value: PhantomData,
        }
    }

    /// Read and parse the credentials JSON file into a key → value map.
    /// Empty map when the file is missing or empty. Parse failures surface
    /// so a corrupted file is not silently treated as empty (which would
    /// clobber surviving entries on the next write).
    pub(crate) fn read_map(&self) -> Result<BTreeMap<String, V>, String> {
        if !self.path.exists() {
            return Ok(BTreeMap::new());
        }
        let content = std::fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
        if content.trim().is_empty() {
            return Ok(BTreeMap::new());
        }
        serde_json::from_str(&content)
            .map_err(|e| format!("{} credentials file is malformed: {e}", self.label))
    }

    pub(crate) fn get(&self, key: &str) -> Result<Option<V>, String> {
        let mut map = self.read_map()?;
        Ok(map.remove(key))
    }

    pub(crate) fn set(&self, key: &str, value: V) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
        let mut map = self.read_map()?;
        map.insert(key.to_string(), value);
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
        write_atomic_0600(&self.path, &content)
    }

    /// Remove one entry; deletes the file when it was the last one. No-op
    /// when the file or the key is missing.
    pub(crate) fn remove(&self, key: &str) -> Result<(), String> {
        let _guard = WRITE_LOCK.lock().map_err(|e| e.to_string())?;
        if !self.path.exists() {
            return Ok(());
        }
        let mut map = self.read_map()?;
        if map.remove(key).is_none() {
            return Ok(());
        }
        if map.is_empty() {
            // Surface remove failures: returning Ok would let the UI claim
            // the credential was forgotten while the file (and the entry
            // inside it) is still on disk, so the next use would silently
            // reuse the supposedly-revoked secret.
            if let Err(err) = std::fs::remove_file(&self.path) {
                if err.kind() != std::io::ErrorKind::NotFound {
                    return Err(err.to_string());
                }
            }
        } else {
            let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
            write_atomic_0600(&self.path, &content)?;
        }
        Ok(())
    }
}

/// Atomically write a secrets file with restrictive permissions. The tmp
/// file is chmodded to 0o600 *before* the rename — rename preserves perms,
/// so setting them afterwards leaves a window where the secrets are world-
/// readable.
fn write_atomic_0600(path: &Path, content: &str) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn store(path: &std::path::Path) -> CredsStore<String> {
        CredsStore::new(path, "test")
    }

    #[test]
    fn get_returns_none_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        assert_eq!(store(&path).get("k").unwrap(), None);
    }

    #[test]
    fn get_returns_err_with_label_when_file_is_malformed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        let err = store(&path).get("k").unwrap_err();
        assert!(err.starts_with("test credentials file is malformed:"), "{err}");
    }

    #[test]
    fn set_returns_err_when_existing_file_is_malformed() {
        // A corrupted credentials file must not be silently overwritten —
        // doing so would clobber the surviving entries on the next set.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "{not valid json").unwrap();
        assert!(store(&path).set("k", "v".to_string()).is_err());
        // The malformed file must be left in place for inspection / recovery.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{not valid json");
    }

    #[test]
    fn get_treats_empty_file_as_no_creds() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "").unwrap();
        assert_eq!(store(&path).get("k").unwrap(), None);
    }

    #[test]
    fn set_creates_file_and_get_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("app_id", "wx123".to_string()).unwrap();
        assert_eq!(store(&path).get("app_id").unwrap(), Some("wx123".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn set_writes_file_with_owner_only_perms() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("app_secret", "very-secret".to_string()).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[test]
    fn set_keys_coexist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("a", "1".to_string()).unwrap();
        store(&path).set("b", "2".to_string()).unwrap();
        assert_eq!(store(&path).get("a").unwrap(), Some("1".to_string()));
        assert_eq!(store(&path).get("b").unwrap(), Some("2".to_string()));
    }

    #[test]
    fn set_overwrites_existing_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("k", "old".to_string()).unwrap();
        store(&path).set("k", "new".to_string()).unwrap();
        assert_eq!(store(&path).get("k").unwrap(), Some("new".to_string()));
    }

    #[test]
    fn remove_deletes_one_and_leaves_others() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("a", "1".to_string()).unwrap();
        store(&path).set("b", "2".to_string()).unwrap();
        store(&path).remove("a").unwrap();
        assert_eq!(store(&path).get("a").unwrap(), None);
        assert_eq!(store(&path).get("b").unwrap(), Some("2".to_string()));
    }

    #[test]
    fn remove_deletes_file_when_last_entry_removed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("k", "v".to_string()).unwrap();
        store(&path).remove("k").unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn remove_is_noop_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        assert!(store(&path).remove("k").is_ok());
    }

    #[test]
    fn remove_is_noop_when_key_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("a", "1".to_string()).unwrap();
        store(&path).remove("b").unwrap();
        // Surviving key still intact.
        assert_eq!(store(&path).get("a").unwrap(), Some("1".to_string()));
    }

    #[test]
    fn get_returns_none_for_missing_key_in_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        store(&path).set("a", "1".to_string()).unwrap();
        assert_eq!(store(&path).get("b").unwrap(), None);
    }

    #[test]
    fn reads_files_written_by_the_pre_store_code() {
        // The old implementations serialized serde_json::Map (wechat) /
        // BTreeMap (git) with to_string_pretty — byte-compatible with what
        // the store reads today. Lock the format in.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("creds.json");
        std::fs::write(&path, "{\n  \"app_id\": \"wx123\",\n  \"app_secret\": \"s\"\n}").unwrap();
        assert_eq!(store(&path).get("app_id").unwrap(), Some("wx123".to_string()));
        assert_eq!(store(&path).get("app_secret").unwrap(), Some("s".to_string()));
    }
}
