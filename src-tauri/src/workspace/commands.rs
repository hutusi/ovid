use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::content_types::{
    parse_authors, parse_default_author, parse_features, parse_i18n, parse_posts_base_path,
};
use crate::paths::to_slash;
use crate::perf::log_perf;
use crate::state::{CachedFrontmatter, WorkspaceState};

use super::clone::{clone_blocking, resolve_target};
use super::revision::compute_workspace_revision;
use super::scaffold::scaffold_amytis_workspace;
use super::tree::walk_tree;
use super::{FileNode, WorkspaceResult, derive_workspace_meta};

#[tauri::command]
pub(crate) async fn open_workspace_at_path(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceResult>, String> {
    let started = Instant::now();
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        log_perf(
            "open_workspace_at_path",
            started.elapsed(),
            &[("result", "missing".to_string())],
        );
        return Ok(None);
    }

    let result = build_workspace_result(&root, &state, &app)?;
    log_perf(
        "open_workspace_at_path",
        started.elapsed(),
        &[
            ("treeRoot", result.tree_root.clone()),
            ("nodes", result.tree.len().to_string()),
            ("amytis", result.is_amytis_workspace.to_string()),
        ],
    );

    Ok(Some(result))
}

#[tauri::command]
pub(crate) async fn open_workspace(
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceResult>, String> {
    let started = Instant::now();
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog().file().pick_folder(move |folder| {
        tx.send(folder).ok();
    });
    let folder = match rx.await.ok().flatten() {
        Some(f) => f,
        None => {
            log_perf(
                "open_workspace",
                started.elapsed(),
                &[("result", "cancelled".to_string())],
            );
            return Ok(None);
        }
    };
    let root: PathBuf = match folder {
        tauri_plugin_dialog::FilePath::Path(p) => p,
        tauri_plugin_dialog::FilePath::Url(u) => PathBuf::from(u.path()),
    };

    let result = build_workspace_result(&root, &state, &app)?;
    log_perf(
        "open_workspace",
        started.elapsed(),
        &[
            ("treeRoot", result.tree_root.clone()),
            ("nodes", result.tree.len().to_string()),
            ("amytis", result.is_amytis_workspace.to_string()),
        ],
    );

    Ok(Some(result))
}

/// Pure assembly of a `WorkspaceResult` from a workspace root and an externally
/// owned frontmatter cache. Does the canonical tree walk, frontmatter parse,
/// metadata derivation, and `site.config.ts` parsing.
///
/// Note: the canonical tree is rooted at `workspace_root` (the project root),
/// not at `tree_root` (the Amytis `content/` subtree). The frontend applies
/// mode-specific selectors to scope display — content mode dives into
/// `content/` for Amytis workspaces, files mode shows the full tree. This is
/// what lets Files mode see top-level files like `site.config.ts` without a
/// second backend call.
///
/// Pure: no Tauri State, no AppHandle, no shared-mutex locks. State storage
/// and asset-protocol scope are handled by the calling wrapper.
pub(crate) fn build_workspace_result_core(
    root: &Path,
    frontmatter_cache: &mut HashMap<PathBuf, CachedFrontmatter>,
) -> WorkspaceResult {
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    let tree_root = derive_tree_root(root);
    let is_amytis_workspace =
        root.join("site.config.ts").is_file() && root.join("content").is_dir();
    let tree = walk_tree(root, frontmatter_cache);
    let (asset_root, cdn_base) = derive_workspace_meta(root);
    let config_path = root.join("site.config.ts");
    let default_author = parse_default_author(&config_path);
    let posts_base_path = parse_posts_base_path(&config_path);
    let features = parse_features(&config_path);
    let authors = parse_authors(&config_path);
    let i18n = parse_i18n(&config_path);

    WorkspaceResult {
        name,
        root_path: to_slash(root),
        tree_root: to_slash(&tree_root),
        asset_root: to_slash(&asset_root),
        tree,
        is_amytis_workspace,
        cdn_base,
        default_author,
        posts_base_path,
        features,
        authors,
        i18n,
    }
}

fn derive_tree_root(root: &Path) -> PathBuf {
    let content_dir = root.join("content");
    if content_dir.is_dir() {
        content_dir
    } else {
        root.to_path_buf()
    }
}

/// Shared body for `open_workspace` / `open_workspace_at_path`. Stores roots
/// in shared state, calls the pure core to assemble the result, and grants
/// asset-protocol scope.
fn build_workspace_result(
    root: &PathBuf,
    state: &State<'_, WorkspaceState>,
    app: &tauri::AppHandle,
) -> Result<WorkspaceResult, String> {
    let tree_root = derive_tree_root(root);

    *state.tree_root.lock().map_err(|e| e.to_string())? = Some(tree_root);
    *state.workspace_root.lock().map_err(|e| e.to_string())? = Some(root.clone());

    // Drop per-file caches from any previously-opened workspace so they don't
    // accumulate across a long-running multi-workspace session. Within a single
    // workspace the caches stay bounded by its file set (they are keyed by path
    // and refreshed by mtime/len).
    state.frontmatter_cache.lock().map_err(|e| e.to_string())?.clear();
    state.search_cache.lock().map_err(|e| e.to_string())?.clear();

    let result = {
        let mut cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
        build_workspace_result_core(root, &mut cache)
    };

    // Grant asset protocol access to the entire workspace root so that both
    // root-relative paths (resolved inside public/) and relative paths
    // (resolved anywhere within the workspace) can be served.
    // Note: Tauri 2's Scope API has no reset/clear, so allowances from prior
    // workspace sessions accumulate in long-running processes. This is an
    // accepted trade-off; the scope is bounded to workspace roots the user
    // explicitly opened.
    if let Err(e) = app.asset_protocol_scope().allow_directory(root, true) {
        eprintln!("Failed to grant asset protocol access for {root:?}: {e}");
    }

    Ok(result)
}

/// Re-walk the workspace tree from `workspace_root` and return the full
/// canonical tree. Called by the frontend after mutations and on the periodic
/// revision poll. Replaces the previous `list_workspace` (content-only walk)
/// and `list_workspace_children` (shallow lazy-load).
// Async + spawn_blocking so the full recursive tree walk (and its
// frontmatter-cache access) runs off the main thread. State is reached via the
// AppHandle inside the blocking closure since `State` can't cross the boundary.
#[tauri::command]
pub(crate) async fn list_workspace_tree(app: tauri::AppHandle) -> Result<Vec<FileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<WorkspaceState>();
        let started = Instant::now();
        let root = {
            let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
            root_guard.as_ref().ok_or("no workspace open")?.clone()
        };
        let tree = {
            let mut cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
            walk_tree(&root, &mut cache)
        };
        log_perf(
            "list_workspace_tree",
            started.elapsed(),
            &[
                ("workspaceRoot", to_slash(&root)),
                ("nodes", tree.len().to_string()),
            ],
        );
        Ok(tree)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Scaffold a brand-new Amytis workspace at `<parent_dir>/<name>` and open
/// it. The freshly-created folder gets the same `build_workspace_result`
/// treatment as `open_workspace_at_path`, so on success the workspace is
/// already the active one (asset-protocol scope granted, state stored) and
/// the returned `WorkspaceResult` flows through the usual frontend path.
#[tauri::command]
pub(crate) async fn create_amytis_workspace(
    parent_dir: String,
    name: String,
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceResult, String> {
    let started = Instant::now();
    let parent = PathBuf::from(&parent_dir);
    let target =
        scaffold_amytis_workspace(&parent, &name).map_err(|err| err.user_message())?;
    let result = build_workspace_result(&target, &state, &app)?;
    log_perf(
        "create_amytis_workspace",
        started.elapsed(),
        &[
            ("treeRoot", result.tree_root.clone()),
            ("nodes", result.tree.len().to_string()),
        ],
    );
    Ok(result)
}

/// Clone a remote git repository into `<parent_dir>/<name or derived>` and
/// open the result as a workspace. Streams `workspace_clone_progress`
/// events line-by-line while the underlying `git clone --progress` runs.
///
/// Validation that does not touch the network (empty URL, missing parent,
/// existing target) happens up front; clone failures from git itself bubble
/// up as the trimmed stderr string.
#[tauri::command]
pub(crate) async fn clone_workspace(
    url: String,
    parent_dir: String,
    name: Option<String>,
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<WorkspaceResult, String> {
    let started = Instant::now();
    let parent = PathBuf::from(&parent_dir);
    let target =
        resolve_target(&url, &parent, name.as_deref()).map_err(|e| e.user_message())?;

    // Move clone work onto the blocking thread pool so we don't block the
    // tokio reactor for the duration of a network clone. The closure owns
    // its clones of url/target/app so it's `'static`.
    let url_owned = url.clone();
    let target_owned = target.clone();
    let app_for_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        clone_blocking(&url_owned, &target_owned, &app_for_clone)
            .map_err(|e| e.user_message())
    })
    .await
    .map_err(|e| e.to_string())??;

    let result = build_workspace_result(&target, &state, &app)?;
    log_perf(
        "clone_workspace",
        started.elapsed(),
        &[
            ("treeRoot", result.tree_root.clone()),
            ("nodes", result.tree.len().to_string()),
            ("amytis", result.is_amytis_workspace.to_string()),
        ],
    );
    Ok(result)
}

#[tauri::command]
pub(crate) async fn get_workspace_revision(
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    // Clone the root out of the mutex, then hash off the main thread — this runs
    // every couple of seconds from the poll and stats every markdown file.
    let root = {
        let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    tauri::async_runtime::spawn_blocking(move || compute_workspace_revision(&root))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_markdown_file(path: &Path, title: &str, body: &str) {
        let content = format!("---\ntitle: \"{title}\"\ntype: post\n---\n\n{body}\n");
        fs::write(path, content).unwrap();
    }

    #[test]
    fn build_workspace_result_core_recognizes_amytis_workspace() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        fs::write(root.join("site.config.ts"), "export const config = {};").unwrap();
        fs::create_dir_all(root.join("content/posts")).unwrap();
        write_markdown_file(&root.join("content/posts/hello.md"), "Hello", "body");

        let mut cache = HashMap::new();
        let result = build_workspace_result_core(root, &mut cache);

        assert!(result.is_amytis_workspace);
        assert!(
            result.tree_root.ends_with("/content"),
            "tree_root should dive into content/ for Amytis workspaces, got {:?}",
            result.tree_root
        );
        assert_eq!(result.asset_root, result.root_path);
        assert!(!result.tree.is_empty(), "tree should include workspace files");
    }

    #[test]
    fn build_workspace_result_core_plain_directory_is_not_amytis() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        write_markdown_file(&root.join("note.md"), "Note", "body");

        let mut cache = HashMap::new();
        let result = build_workspace_result_core(root, &mut cache);

        assert!(!result.is_amytis_workspace);
        assert_eq!(
            result.tree_root, result.root_path,
            "tree_root falls back to root when no content/ dir is present"
        );
        assert!(result.tree.iter().any(|n| n.name == "note.md"));
    }

    #[test]
    fn build_workspace_result_core_missing_path_returns_empty_tree_without_panic() {
        let missing = PathBuf::from("/this/path/does/not/exist/ovid-test");
        let mut cache = HashMap::new();
        let result = build_workspace_result_core(&missing, &mut cache);

        assert!(result.tree.is_empty());
        assert!(!result.is_amytis_workspace);
    }

    #[test]
    fn build_workspace_result_core_populates_frontmatter_cache() {
        let dir = TempDir::new().unwrap();
        let root = dir.path();
        write_markdown_file(&root.join("a.md"), "A", "body");
        write_markdown_file(&root.join("b.md"), "B", "body");

        let mut cache = HashMap::new();
        assert!(cache.is_empty());

        let _ = build_workspace_result_core(root, &mut cache);

        assert!(
            cache.contains_key(&root.join("a.md")),
            "cache should be populated for markdown files after a walk"
        );
        assert!(cache.contains_key(&root.join("b.md")));
    }
}
