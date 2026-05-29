use std::path::PathBuf;
use std::time::Instant;

use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::content_types::{parse_default_author, parse_features, parse_posts_base_path};
use crate::paths::to_slash;
use crate::perf::log_perf;
use crate::state::WorkspaceState;

use super::revision::compute_workspace_revision;
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

/// Shared body for `open_workspace` / `open_workspace_at_path`. Validates the
/// folder, stores roots in shared state, walks the canonical workspace tree
/// once, and assembles the result the frontend consumes.
///
/// Note: the canonical tree is rooted at `workspace_root` (the project root),
/// not at `tree_root` (the Amytis `content/` subtree). The frontend applies
/// mode-specific selectors to scope display — content mode dives into
/// `content/` for Amytis workspaces, files mode shows the full tree. This is
/// what lets Files mode see top-level files like `site.config.ts` without a
/// second backend call.
fn build_workspace_result(
    root: &PathBuf,
    state: &State<'_, WorkspaceState>,
    app: &tauri::AppHandle,
) -> Result<WorkspaceResult, String> {
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    let content_dir = root.join("content");
    let tree_root = if content_dir.is_dir() {
        content_dir
    } else {
        root.clone()
    };

    *state.tree_root.lock().map_err(|e| e.to_string())? = Some(tree_root.clone());
    *state.workspace_root.lock().map_err(|e| e.to_string())? = Some(root.clone());

    let is_amytis_workspace =
        root.join("site.config.ts").is_file() && root.join("content").is_dir();
    let tree = {
        let mut cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
        walk_tree(root, &mut cache)
    };
    let (asset_root, cdn_base) = derive_workspace_meta(root);
    let config_path = root.join("site.config.ts");
    let default_author = parse_default_author(&config_path);
    let posts_base_path = parse_posts_base_path(&config_path);
    let features = parse_features(&config_path);

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

    Ok(WorkspaceResult {
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
    })
}

/// Re-walk the workspace tree from `workspace_root` and return the full
/// canonical tree. Called by the frontend after mutations and on the periodic
/// revision poll. Replaces the previous `list_workspace` (content-only walk)
/// and `list_workspace_children` (shallow lazy-load).
#[tauri::command]
pub(crate) fn list_workspace_tree(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<FileNode>, String> {
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
}

#[tauri::command]
pub(crate) fn get_workspace_revision(state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    Ok(compute_workspace_revision(root))
}
