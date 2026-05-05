use std::path::{Path, PathBuf};

#[tauri::command]
pub(crate) fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Compute a POSIX-style relative path from `from_dir` to `to`.
pub(crate) fn relative_path_from(from_dir: &Path, to: &Path) -> String {
    let from: Vec<_> = from_dir.components().collect();
    let to_c: Vec<_> = to.components().collect();
    let common = from
        .iter()
        .zip(to_c.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let mut rel = PathBuf::new();
    for _ in common..from.len() {
        rel.push("..");
    }
    for c in &to_c[common..] {
        rel.push(c);
    }
    rel.to_string_lossy().replace('\\', "/")
}
