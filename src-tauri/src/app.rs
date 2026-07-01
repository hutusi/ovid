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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_path_from_same_dir() {
        let from = Path::new("/ws/content/posts/my-post");
        let to = Path::new("/ws/content/posts/my-post/images/photo.png");
        assert_eq!(relative_path_from(from, to), "images/photo.png");
    }

    #[test]
    fn relative_path_from_nested_subdir() {
        let from = Path::new("/ws/content");
        let to = Path::new("/ws/content/posts/my-post/images/photo.png");
        assert_eq!(
            relative_path_from(from, to),
            "posts/my-post/images/photo.png"
        );
    }

    #[test]
    fn relative_path_from_sibling_dir_via_dotdot() {
        let from = Path::new("/ws/content/posts/post-a");
        let to = Path::new("/ws/content/posts/post-b/images/photo.png");
        assert_eq!(relative_path_from(from, to), "../post-b/images/photo.png");
    }

    #[test]
    fn relative_path_from_climbs_multiple_levels() {
        let from = Path::new("/ws/content/posts/a/b/c");
        let to = Path::new("/ws/content/other/photo.png");
        assert_eq!(relative_path_from(from, to), "../../../../other/photo.png");
    }

    #[test]
    fn relative_path_from_root_relative_from_dir() {
        // The save_asset fallback path: no active file, from_dir defaults to "".
        let from = Path::new("");
        let to = Path::new("images/photo.png");
        assert_eq!(relative_path_from(from, to), "images/photo.png");
    }
}
