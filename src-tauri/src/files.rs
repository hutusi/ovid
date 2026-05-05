use std::path::Path;

use tauri::State;

use crate::paths::{validate_new_dir_path, validate_new_path, validate_path, write_atomic};
use crate::state::WorkspaceState;

#[tauri::command]
pub(crate) fn read_file(path: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn write_file(
    path: String,
    content: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    write_atomic(&canonical, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_file(
    path: String,
    content: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let new_path = validate_new_path(root, &path)?;
    if new_path.exists() {
        return Err("file already exists".to_string());
    }
    write_atomic(&new_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn rename_file(
    old_path: String,
    new_path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical_old = validate_path(root, &old_path)?;
    let new = validate_new_path(root, &new_path)?;
    if new.exists() {
        return Err("a file with that name already exists".to_string());
    }
    std::fs::rename(&canonical_old, &new).map_err(|e| e.to_string())
}

pub(crate) fn copy_entry_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(src).map_err(|e| e.to_string())?;
    let file_type = metadata.file_type();

    if file_type.is_symlink() {
        return Err("symlinks are not supported when duplicating entries".to_string());
    }

    if file_type.is_dir() {
        std::fs::create_dir(dest).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let child_src = entry.path();
            let child_dest = dest.join(entry.file_name());
            copy_entry_recursive(&child_src, &child_dest)?;
        }
        return Ok(());
    }

    std::fs::copy(src, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) fn duplicate_entry(
    src_path: String,
    dest_path: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root = {
        let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    let src = validate_path(&root, &src_path)?;
    let dest = validate_new_path(&root, &dest_path)?;
    if dest.exists() {
        return Err("a file with that name already exists".to_string());
    }
    copy_entry_recursive(&src, &dest)
}

#[tauri::command]
pub(crate) fn trash_file(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    trash::delete(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_dir(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let new_path = validate_new_path(root, &path)?;
    if new_path.exists() {
        return Err("directory already exists".to_string());
    }
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
}

/// Create a directory (and all ancestors) inside the workspace, succeeding if
/// it already exists. Unlike `create_dir`, the parent need not exist yet.
#[tauri::command]
pub(crate) fn ensure_dir(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);
    let new_path = validate_new_dir_path(&root, &path)?;
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn copy_entry_recursive_copies_nested_directories() {
        let dir = TempDir::new().unwrap();
        let src = dir.path().join("hello");
        let nested = src.join("images");
        let dest = dir.path().join("hello-copy");

        fs::create_dir(&src).unwrap();
        fs::create_dir(&nested).unwrap();
        fs::write(src.join("index.md"), "# Hello").unwrap();
        fs::write(nested.join("cover.png"), "png").unwrap();

        copy_entry_recursive(&src, &dest).unwrap();

        assert_eq!(fs::read_to_string(dest.join("index.md")).unwrap(), "# Hello");
        assert_eq!(fs::read_to_string(dest.join("images").join("cover.png")).unwrap(), "png");
    }
}
