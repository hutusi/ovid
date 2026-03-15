use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

// Holds workspace paths so file commands can validate against them.
struct WorkspaceState {
    tree_root: Mutex<Option<PathBuf>>,
    workspace_root: Mutex<Option<PathBuf>>,
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
    is_amytis_workspace: bool,
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

    // Store roots for path validation and git/config commands
    *state.tree_root.lock().map_err(|e| e.to_string())? = Some(tree_root.clone());
    *state.workspace_root.lock().map_err(|e| e.to_string())? = Some(root.clone());

    let is_amytis_workspace = root.join("site.config.ts").is_file() && root.join("content").is_dir();
    let tree = walk_dir(&tree_root);

    Ok(Some(WorkspaceResult {
        name,
        root_path: root.to_string_lossy().to_string(),
        tree_root: tree_root.to_string_lossy().to_string(),
        tree,
        is_amytis_workspace,
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
        // Skip symlinks to prevent traversal outside the workspace
        if entry.file_type().map(|ft| ft.is_symlink()).unwrap_or(false) {
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
    // Clone root before releasing the lock so the mutex is not held during search
    let root = {
        let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    Ok(search_dir(&root, query.trim()))
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

// ── Content types ──────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentType {
    name: String,
}

/// Best-effort scanner: find `contentTypes` in `site.config.ts` and extract
/// the top-level key names (post, page, note, …). Returns empty vec on any
/// parse failure so callers gracefully degrade to the default frontmatter.
fn parse_content_types(config_path: &Path) -> Vec<ContentType> {
    use std::io::{BufRead, BufReader};
    let Ok(file) = std::fs::File::open(config_path) else {
        return Vec::new();
    };
    let mut reader = BufReader::new(file);
    let mut type_names: Vec<ContentType> = Vec::new();
    let mut depth: i32 = 0;
    let mut found_content_types = false;
    let mut content_types_depth: Option<i32> = None;
    let mut line = String::new();

    loop {
        line.clear();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        let trimmed = line.trim();
        let open_count = line.chars().filter(|&c| c == '{').count() as i32;
        let close_count = line.chars().filter(|&c| c == '}').count() as i32;

        match content_types_depth {
            None if !found_content_types => {
                if trimmed.contains("contentTypes") {
                    found_content_types = true;
                    depth += open_count - close_count;
                    if open_count > 0 {
                        content_types_depth = Some(depth);
                    }
                } else {
                    depth += open_count - close_count;
                }
            }
            None => {
                // found keyword, waiting for opening brace
                depth += open_count - close_count;
                if open_count > 0 {
                    content_types_depth = Some(depth);
                }
            }
            Some(ct_depth) => {
                let prev_depth = depth;
                depth += open_count - close_count;
                if depth < ct_depth {
                    break;
                }
                if prev_depth == ct_depth {
                    if let Some(name) = extract_ts_key(trimmed) {
                        type_names.push(ContentType { name });
                    }
                }
            }
        }
    }
    type_names
}

fn extract_ts_key(line: &str) -> Option<String> {
    let line = line.trim();
    if line.starts_with("//") || line.starts_with('*') || line.starts_with("/*") {
        return None;
    }
    let end = line.find(':')?;
    let key = line[..end].trim().trim_matches('"').trim_matches('\'');
    if !key.is_empty() && key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        Some(key.to_string())
    } else {
        None
    }
}

#[tauri::command]
fn get_content_types(state: State<'_, WorkspaceState>) -> Result<Vec<ContentType>, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    let root = match root_guard.as_ref() {
        Some(r) => r.clone(),
        None => return Ok(Vec::new()),
    };
    drop(root_guard);
    let config = root.join("site.config.ts");
    if !config.is_file() {
        return Ok(Vec::new());
    }
    Ok(parse_content_types(&config))
}

// ── Git integration ────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitFileStatus {
    path: String,
    status: String,
}

/// Run a git subcommand rooted at `root`. Returns stdout on success or an
/// error string (stderr) on failure. Returns an empty string if git is not
/// found, so callers can treat a missing git as a graceful no-op.
fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd_args = vec!["-C", root];
    cmd_args.extend_from_slice(args);
    let output = std::process::Command::new("git")
        .args(&cmd_args)
        .output()
        .map_err(|_| "git not found".to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() { "git command failed".to_string() } else { stderr });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn get_git_status(state: State<'_, WorkspaceState>) -> Result<Vec<GitFileStatus>, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = match root_guard.as_ref() {
        Some(r) => r.clone(),
        None => return Ok(Vec::new()),
    };
    drop(root_guard);
    let root_str = root.to_string_lossy().to_string();

    // Find the git repo root (may differ from tree_root if content/ is a subdir)
    let git_root = match run_git(&root_str, &["rev-parse", "--show-toplevel"]) {
        Ok(s) => s.trim().to_string(),
        Err(_) => return Ok(Vec::new()), // not a git repo or git not found
    };

    let porcelain = match run_git(&git_root, &["status", "--porcelain"]) {
        Ok(s) => s,
        Err(_) => return Ok(Vec::new()),
    };

    let mut statuses = Vec::new();
    for line in porcelain.lines() {
        if line.len() < 4 {
            continue;
        }
        let xy = &line[..2];
        let path_part = line[3..].trim();
        // Handle renames: "R old -> new" — take the destination
        let file_path = if path_part.contains(" -> ") {
            path_part.split(" -> ").nth(1).unwrap_or(path_part)
        } else {
            path_part
        };
        let abs_path = format!("{}/{}", git_root, file_path);
        let status = if xy.starts_with('?') {
            "untracked"
        } else if xy.chars().next().map(|c| c != ' ').unwrap_or(false) {
            "staged"
        } else {
            "modified"
        };
        statuses.push(GitFileStatus { path: abs_path, status: status.to_string() });
    }
    Ok(statuses)
}

#[tauri::command]
fn get_git_branch(state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);
    run_git(&root.to_string_lossy(), &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
}

#[tauri::command]
fn git_commit(
    message: String,
    push: bool,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);
    let root_str = root.to_string_lossy().to_string();
    run_git(&root_str, &["add", "-A"])?;
    run_git(&root_str, &["commit", "-m", &message])?;
    if push {
        run_git(&root_str, &["push"])?;
    }
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState {
            tree_root: Mutex::new(None),
            workspace_root: Mutex::new(None),
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
            get_content_types,
            get_git_status,
            get_git_branch,
            git_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
