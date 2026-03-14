use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

// Holds the workspace tree root so file commands can validate paths against it.
struct WorkspaceState {
    tree_root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchMatch {
    line_number: usize,
    line_content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    path: String,
    title: Option<String>,
    matches: Vec<SearchMatch>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    is_directory: bool,
    children: Option<Vec<FileNode>>,
    extension: Option<String>,
    title: Option<String>,
    draft: Option<bool>,
}

/// Read the frontmatter block (between `---` fences) of a markdown file and
/// extract the `title` and `draft` scalar values using simple line scanning.
/// Returns `(None, None)` if the file can't be read or has no frontmatter.
/// Uses a buffered reader so only the frontmatter is read, not the full file.
fn read_frontmatter_meta(path: &Path) -> (Option<String>, Option<bool>) {
    use std::io::{BufRead, BufReader};
    let Ok(file) = std::fs::File::open(path) else {
        return (None, None);
    };
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    if reader.read_line(&mut first_line).is_err() || first_line.trim() != "---" {
        return (None, None);
    }
    let mut title: Option<String> = None;
    let mut draft: Option<bool> = None;
    let mut line = String::new();
    while reader.read_line(&mut line).unwrap_or(0) > 0 {
        if line.trim() == "---" {
            break;
        }
        if let Some(rest) = line.strip_prefix("title:") {
            title = Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
        } else if let Some(rest) = line.strip_prefix("draft:") {
            let val = rest.trim();
            draft = match val {
                "true" => Some(true),
                "false" => Some(false),
                _ => None,
            };
        }
        line.clear();
    }
    (title, draft)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceResult {
    name: String,
    root_path: String,
    tree_root: String,
    tree: Vec<FileNode>,
}

fn walk_dir(path: &Path) -> Vec<FileNode> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };

    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let mut nodes = Vec::new();

    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        if entry_path.is_dir() {
            let children = walk_dir(&entry_path);
            if !children.is_empty() {
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: true,
                    children: Some(children),
                    extension: None,
                    title: None,
                    draft: None,
                });
            }
        } else {
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if ext == "md" || ext == "mdx" {
                let (title, draft) = read_frontmatter_meta(&entry_path);
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: false,
                    children: None,
                    extension: Some(format!(".{}", ext)),
                    title,
                    draft,
                });
            }
        }
    }

    nodes
}

/// Canonicalize `requested` and verify it is inside `workspace_root`.
fn validate_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let canonical_path =
        std::fs::canonicalize(requested).map_err(|e| format!("invalid path: {e}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }
    Ok(canonical_path)
}

/// Validate that a prospective new path's parent exists inside the workspace root.
fn validate_new_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let new_path = PathBuf::from(requested);
    let parent = new_path
        .parent()
        .ok_or("path has no parent directory")?;
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|e| format!("invalid parent path: {e}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }
    Ok(new_path)
}

/// Write content atomically: write to a sibling temp file then rename over the target.
fn write_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no parent dir"))?;
    let tmp_name = format!(
        ".~{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    );
    let tmp_path = dir.join(&tmp_name);

    let mut file = std::fs::File::create(&tmp_path)?;
    file.write_all(content.as_bytes())?;
    file.flush()?;
    file.sync_all()?;
    drop(file);

    std::fs::rename(&tmp_path, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        e
    })
}

#[tauri::command]
async fn open_workspace(
    app: tauri::AppHandle,
    state: State<'_, WorkspaceState>,
) -> Result<Option<WorkspaceResult>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<tauri_plugin_dialog::FilePath>>();
    app.dialog().file().pick_folder(move |folder| {
        tx.send(folder).ok();
    });
    let folder = match rx.await.ok().flatten() {
        Some(f) => f,
        None => return Ok(None),
    };
    let root: PathBuf = match folder {
        tauri_plugin_dialog::FilePath::Path(p) => p,
        tauri_plugin_dialog::FilePath::Url(u) => PathBuf::from(u.path()),
    };

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    // Prefer content/ subdirectory for Amytis workspaces
    let content_dir = root.join("content");
    let tree_root = if content_dir.is_dir() {
        content_dir
    } else {
        root.clone()
    };

    // Store tree root for path validation in read/write commands
    *state.tree_root.lock().map_err(|e| e.to_string())? = Some(tree_root.clone());

    let tree = walk_dir(&tree_root);

    Ok(Some(WorkspaceResult {
        name,
        root_path: root.to_string_lossy().to_string(),
        tree_root: tree_root.to_string_lossy().to_string(),
        tree,
    }))
}

#[tauri::command]
fn list_workspace(state: State<'_, WorkspaceState>) -> Result<Vec<FileNode>, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    Ok(walk_dir(root))
}

#[tauri::command]
fn read_file(path: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    write_atomic(&canonical, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(path: String, content: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let new_path = validate_new_path(root, &path)?;
    if new_path.exists() {
        return Err("file already exists".to_string());
    }
    write_atomic(&new_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical_old = validate_path(root, &old_path)?;
    let new = validate_new_path(root, &new_path)?;
    if new.exists() {
        return Err("a file with that name already exists".to_string());
    }
    std::fs::rename(&canonical_old, &new).map_err(|e| e.to_string())
}

#[tauri::command]
fn trash_file(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    trash::delete(&canonical).map_err(|e| e.to_string())
}

/// Search all markdown files under `path` for lines containing `query` (case-insensitive).
fn search_dir(path: &Path, query: &str) -> Vec<SearchResult> {
    let Ok(entries) = std::fs::read_dir(path) else {
        return Vec::new();
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    let mut results = Vec::new();
    for entry in entries {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if entry_path.is_dir() {
            results.extend(search_dir(&entry_path, query));
        } else {
            let ext = entry_path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext != "md" && ext != "mdx" {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&entry_path) else {
                continue;
            };
            let q = query.to_lowercase();
            let matches: Vec<SearchMatch> = content
                .lines()
                .enumerate()
                .filter_map(|(i, line)| {
                    if line.to_lowercase().contains(&q) {
                        Some(SearchMatch {
                            line_number: i + 1,
                            line_content: line.trim().to_string(),
                        })
                    } else {
                        None
                    }
                })
                .collect();
            if !matches.is_empty() {
                let (title, _) = read_frontmatter_meta(&entry_path);
                results.push(SearchResult {
                    path: entry_path.to_string_lossy().to_string(),
                    title,
                    matches,
                });
            }
        }
    }
    results
}

#[tauri::command]
fn search_workspace(query: String, state: State<'_, WorkspaceState>) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    Ok(search_dir(root, query.trim()))
}

#[tauri::command]
fn create_dir(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let new_path = validate_new_path(root, &path)?;
    if new_path.exists() {
        return Err("directory already exists".to_string());
    }
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState {
            tree_root: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_workspace,
            read_file,
            write_file,
            create_file,
            rename_file,
            trash_file,
            create_dir,
            search_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
