use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
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
    pub(crate) search_cache: Mutex<HashMap<PathBuf, Arc<CachedSearchFile>>>,
    // The watcher must stay alive for notifications to continue. Replaced and
    // dropped whenever the user opens a different workspace.
    pub(crate) workspace_watcher: Mutex<Option<notify::RecommendedWatcher>>,
    // The git repository root found for a tree root, as (tree root, git root).
    // Every git command needs it; resolving it spawns `git rev-parse
    // --show-toplevel`, which a full status refresh used to pay ~5 times.
    // Keyed by the tree root, so opening another workspace misses the cache;
    // only positive answers are cached (a `git init` later is still seen).
    pub(crate) git_root_cache: Mutex<Option<(PathBuf, String)>>,
    // Files Ovid itself just saved, so the watcher can drop their events.
    pub(crate) self_writes: Arc<SelfWrites>,
}

/// What a file looked like right after a write: enough to tell, cheaply and
/// without reading it, whether a later watcher event is still about that
/// write. Any other write changes the length or (nanosecond) mtime.
#[derive(Clone, Copy, PartialEq, Debug)]
struct FileStamp {
    len: u64,
    modified: Option<SystemTime>,
}

fn file_stamp(path: &Path) -> Option<FileStamp> {
    let metadata = std::fs::metadata(path).ok()?;
    Some(FileStamp {
        len: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

/// Registry of Ovid's own recent saves.
///
/// Every autosave is a filesystem change the watcher reports; without this,
/// each one reached the frontend, which then had to read the file back to
/// recognise its own write. A save is recorded with its file's stamp, and an
/// event for that path is dropped while the file still carries exactly that
/// stamp — so an external edit landing right after (a different stamp) still
/// gets through. Entries expire after a few seconds.
#[derive(Default)]
pub(crate) struct SelfWrites {
    entries: Mutex<std::collections::HashMap<PathBuf, (FileStamp, Instant)>>,
}

const SELF_WRITE_TTL: Duration = Duration::from_secs(5);

impl SelfWrites {
    pub(crate) fn record(&self, path: &Path) {
        let Some(stamp) = file_stamp(path) else {
            return;
        };
        if let Ok(mut entries) = self.entries.lock() {
            entries.retain(|_, (_, at)| at.elapsed() < SELF_WRITE_TTL);
            entries.insert(path.to_path_buf(), (stamp, Instant::now()));
        }
    }

    pub(crate) fn is_own_write(&self, path: &Path) -> bool {
        let Ok(entries) = self.entries.lock() else {
            return false;
        };
        match entries.get(path) {
            Some((stamp, at)) if at.elapsed() < SELF_WRITE_TTL => file_stamp(path) == Some(*stamp),
            _ => false,
        }
    }
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
    /// `lines`, lowercased once at load — a query used to lowercase every
    /// line of the corpus again on every keystroke-debounced search.
    pub(crate) lines_lower: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::SelfWrites;

    #[test]
    fn a_recorded_write_is_recognised_until_the_file_changes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        std::fs::write(&path, "saved by ovid").unwrap();
        let writes = SelfWrites::default();
        assert!(!writes.is_own_write(&path), "nothing recorded yet");

        writes.record(&path);
        assert!(writes.is_own_write(&path));

        // An external edit right after (different size) must get through.
        std::fs::write(&path, "edited elsewhere, longer").unwrap();
        assert!(!writes.is_own_write(&path));
    }

    #[test]
    fn other_paths_are_not_own_writes() {
        let dir = tempfile::tempdir().unwrap();
        let ours = dir.path().join("a.md");
        let theirs = dir.path().join("b.md");
        std::fs::write(&ours, "a").unwrap();
        std::fs::write(&theirs, "b").unwrap();
        let writes = SelfWrites::default();
        writes.record(&ours);
        assert!(!writes.is_own_write(&theirs));
    }
}
