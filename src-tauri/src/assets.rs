use std::path::{Path, PathBuf};

use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::app::relative_path_from;
use crate::paths::{normalize_path, to_slash};
use crate::state::WorkspaceState;

/// Copy an image from an arbitrary path into `<workspace>/assets/` and return
/// a path relative to the active markdown file (or `assets/<name>` as fallback).
///
/// Note: unlike `read_file`/`write_file`, `src_path` is intentionally not
/// Open a native file picker filtered to image types and return the chosen path.
#[tauri::command]
pub(crate) async fn pick_image_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog()
        .file()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"],
        )
        .pick_file(move |file| {
            tx.send(file).ok();
        });
    let file = match rx.await.ok().flatten() {
        Some(f) => f,
        None => return Ok(None),
    };
    let path = match file {
        tauri_plugin_dialog::FilePath::Path(p) => to_slash(&p),
        tauri_plugin_dialog::FilePath::Url(u) => {
            let p = u.to_file_path().unwrap_or_else(|_| PathBuf::from(u.path()));
            to_slash(&p)
        }
    };
    Ok(Some(path))
}

/// Resolve the `images/` directory for saving an asset.
/// Uses the active file's sibling `images/` when available; falls back to
/// `<workspace_root>/images/`.
pub(crate) fn resolve_images_dir(active_file_path: Option<&str>, root: &Path) -> PathBuf {
    if let Some(p) = active_file_path {
        if let Some(parent) = Path::new(p).parent() {
            let norm_parent = normalize_path(parent);
            let norm_root = normalize_path(root);
            if norm_parent.starts_with(&norm_root) {
                return norm_parent.join("images");
            }
        }
    }
    root.join("images")
}

/// Atomically reserve a unique filename inside `dir`.
/// Tries `base_name` first; if taken, prepends a millisecond timestamp until a
/// slot is free. Returns the reserved name on success.
pub(crate) fn reserve_unique_name(dir: &Path, base_name: &str) -> Result<String, String> {
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join(base_name))
    {
        Ok(_) => Ok(base_name.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => loop {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let candidate = format!("{ts}_{base_name}");
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dir.join(&candidate))
            {
                Ok(_) => break Ok(candidate),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => break Err(format!("could not reserve asset path: {e}")),
            }
        },
        Err(e) => Err(format!("could not reserve asset path: {e}")),
    }
}

/// Save a drag-and-dropped image file to the active file's sibling `images/`
/// directory (falls back to `<workspace_root>/images/`).
#[tauri::command]
pub(crate) fn save_asset(
    src_path: String,
    active_file_path: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);

    let src = Path::new(&src_path);
    let file_name = src
        .file_name()
        .ok_or("invalid source path")?
        .to_string_lossy()
        .to_string();

    let images_dir = resolve_images_dir(active_file_path.as_deref(), &root);
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("could not create images dir: {e}"))?;

    let dest_name = reserve_unique_name(&images_dir, &file_name)?;
    let dest = images_dir.join(&dest_name);
    std::fs::copy(src, &dest).map_err(|e| format!("copy failed: {e}"))?;

    let rel = if let Some(active) = active_file_path {
        let from_dir = PathBuf::from(&active);
        let from_dir = from_dir.parent().unwrap_or(Path::new(""));
        relative_path_from(from_dir, &dest)
    } else {
        format!("images/{dest_name}")
    };

    Ok(rel)
}

const ALLOWED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"];


/// Save raw image bytes (e.g. from the clipboard) to the active file's sibling
/// `images/` directory (falls back to `<workspace_root>/images/`).
/// Returns the relative path to insert into the document.
#[tauri::command]
pub(crate) fn save_asset_from_bytes(
    bytes: Vec<u8>,
    extension: String,
    active_file_path: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<String, String> {
    let ext = extension.trim_start_matches('.').to_lowercase();
    if !ALLOWED_IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("unsupported image type: {ext}"));
    }

    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);

    let images_dir = resolve_images_dir(active_file_path.as_deref(), &root);
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("could not create images dir: {e}"))?;

    let base_name = format!("pasted-image.{ext}");
    let dest_name = reserve_unique_name(&images_dir, &base_name)?;
    let dest = images_dir.join(&dest_name);
    std::fs::write(&dest, &bytes).map_err(|e| format!("write failed: {e}"))?;

    let rel = if let Some(active) = active_file_path {
        let from_dir = PathBuf::from(&active);
        let from_dir = from_dir.parent().unwrap_or(Path::new(""));
        relative_path_from(from_dir, &dest)
    } else {
        format!("images/{dest_name}")
    };

    Ok(rel)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── resolve_images_dir ───────────────────────────────────────────────────

    #[test]
    fn resolve_images_dir_uses_sibling_when_active_file_given() {
        let root = Path::new("/workspace");
        let result = resolve_images_dir(Some("/workspace/content/posts/my-post/index.md"), root);
        assert_eq!(result, PathBuf::from("/workspace/content/posts/my-post/images"));
    }

    #[test]
    fn resolve_images_dir_falls_back_to_root_when_no_active_file() {
        let root = Path::new("/workspace");
        let result = resolve_images_dir(None, root);
        assert_eq!(result, PathBuf::from("/workspace/images"));
    }

    #[test]
    fn resolve_images_dir_file_at_root_level_uses_root_images() {
        let root = Path::new("/workspace");
        let result = resolve_images_dir(Some("/workspace/README.md"), root);
        assert_eq!(result, PathBuf::from("/workspace/images"));
    }

    #[test]
    fn resolve_images_dir_rejects_path_traversal_outside_workspace() {
        let root = Path::new("/workspace");
        let result = resolve_images_dir(Some("/workspace/../etc/passwd"), root);
        assert_eq!(result, PathBuf::from("/workspace/images"));
    }

    // ── reserve_unique_name ──────────────────────────────────────────────────

    #[test]
    fn reserve_unique_name_returns_base_name_when_available() {
        let dir = TempDir::new().unwrap();
        let name = reserve_unique_name(dir.path(), "image.png").unwrap();
        assert_eq!(name, "image.png");
        assert!(dir.path().join("image.png").exists());
    }

    #[test]
    fn reserve_unique_name_uses_timestamp_prefix_when_name_taken() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("image.png"), b"").unwrap();
        let name = reserve_unique_name(dir.path(), "image.png").unwrap();
        assert!(name.ends_with("_image.png"), "expected timestamp prefix, got: {name}");
        assert!(dir.path().join(&name).exists());
    }
}
