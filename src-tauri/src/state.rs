use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Instant, SystemTime};
use ts_rs::TS;

// Holds workspace paths so file commands can validate against them.
pub(crate) struct WorkspaceState {
    pub(crate) tree_root: Mutex<Option<PathBuf>>,
    pub(crate) workspace_root: Mutex<Option<PathBuf>>,
    // Both caches are cleared on workspace open (see build_workspace_result) so
    // they can't grow unbounded across a multi-workspace session; within one
    // workspace they stay bounded by its file set, keyed by path and refreshed
    // by (mtime, len).
    pub(crate) frontmatter_cache: Mutex<HashMap<PathBuf, CachedFrontmatter>>,
    pub(crate) search_cache: Mutex<HashMap<PathBuf, CachedSearchFile>>,
    // The watcher must stay alive for notifications to continue. Replaced and
    // dropped whenever the user opens a different workspace.
    pub(crate) workspace_watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

impl WorkspaceState {
    /// The open workspace root, cloned out of its mutex so a command's IO never
    /// runs with the lock held.
    pub(crate) fn workspace_root_path(&self) -> Result<PathBuf, String> {
        self.workspace_root
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "no workspace open".to_string())
    }

    /// The open tree root (the visible content root), cloned out of its mutex.
    pub(crate) fn tree_root_path(&self) -> Result<PathBuf, String> {
        self.tree_root
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "no workspace open".to_string())
    }
}

/// Run blocking filesystem work on the async runtime's blocking pool.
///
/// Synchronous Tauri commands execute on the main thread, so a save's fsync,
/// a slow or network volume, a large duplicate, or the `osascript` round-trip
/// behind moving a file to the Trash would freeze the whole UI while it ran.
pub(crate) async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

// Caches the WeChat access token so we don't refetch it on every publish.
pub(crate) struct WechatState {
    pub(crate) token_cache: Mutex<Option<WechatTokenCache>>,
}

pub(crate) struct WechatTokenCache {
    pub(crate) app_id: String,
    pub(crate) access_token: String,
    pub(crate) expires_at: Instant,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct WechatCredStatus {
    pub(crate) app_id: Option<String>,
    pub(crate) has_secret: bool,
}

#[derive(Serialize, TS)]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct WechatPublishResult {
    pub(crate) media_id: String,
    pub(crate) updated: bool,
}

#[derive(Serialize, Clone, TS)]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct WechatUploadProgress {
    pub(crate) current: usize,
    pub(crate) total: usize,
}

#[derive(Clone)]
pub(crate) struct CachedFrontmatter {
    pub(crate) modified: Option<SystemTime>,
    pub(crate) len: u64,
    pub(crate) title: Option<String>,
    pub(crate) draft: Option<bool>,
    pub(crate) content_type: Option<String>,
}

#[derive(Clone)]
pub(crate) struct CachedSearchFile {
    pub(crate) modified: Option<SystemTime>,
    pub(crate) len: u64,
    pub(crate) title: Option<String>,
    pub(crate) draft: bool,
    pub(crate) lines: Vec<String>,
}
