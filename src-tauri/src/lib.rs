use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Instant, SystemTime};
use tauri::menu::{MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// Holds workspace paths so file commands can validate against them.
struct WorkspaceState {
    tree_root: Mutex<Option<PathBuf>>,
    workspace_root: Mutex<Option<PathBuf>>,
    // TODO: add bounded eviction or explicit workspace/session clears if cache
    // growth becomes a measured memory issue in long-running large-workspace sessions.
    frontmatter_cache: Mutex<HashMap<PathBuf, CachedFrontmatter>>,
    search_cache: Mutex<HashMap<PathBuf, CachedSearchFile>>,
}

#[derive(Clone)]
struct CachedFrontmatter {
    modified: Option<SystemTime>,
    len: u64,
    title: Option<String>,
    draft: Option<bool>,
    content_type: Option<String>,
}

#[derive(Clone)]
struct CachedSearchFile {
    modified: Option<SystemTime>,
    len: u64,
    title: Option<String>,
    lines: Vec<String>,
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
    total_matches: usize,
    has_more_matches: bool,
}

fn search_display_name(result: &SearchResult) -> String {
    if let Some(title) = result.title.as_deref().map(str::trim).filter(|title| !title.is_empty()) {
        return title.to_lowercase();
    }

    Path::new(&result.path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or(&result.path)
        .to_lowercase()
}

fn search_relative_path(path: &str, root: &Path) -> String {
    Path::new(path)
        .strip_prefix(root)
        .unwrap_or_else(|_| Path::new(path))
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase()
}

fn score_search_result(result: &SearchResult, query_lower: &str, root: &Path) -> i64 {
    let display_name = search_display_name(result);
    let relative_path = search_relative_path(&result.path, root);
    let base_name = Path::new(&result.path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_lowercase();

    let text_score = if display_name == query_lower || base_name == query_lower {
        1_200
    } else if display_name.starts_with(query_lower) {
        900 - (display_name.len().saturating_sub(query_lower.len()) as i64)
    } else if base_name.starts_with(query_lower) {
        850 - (base_name.len().saturating_sub(query_lower.len()) as i64)
    } else if relative_path
        .split('/')
        .any(|part| part == query_lower || part == format!("{query_lower}.md") || part == format!("{query_lower}.mdx"))
    {
        825
    } else if relative_path
        .split(|c: char| matches!(c, '/' | '\\' | '.' | '_' | '-' | ' '))
        .any(|segment| segment == query_lower)
    {
        800
    } else if let Some(index) = display_name.find(query_lower) {
        600 - index as i64
    } else if let Some(index) = base_name.find(query_lower) {
        500 - index as i64
    } else if let Some(index) = relative_path.find(query_lower) {
        300 - std::cmp::min(index, 250) as i64
    } else {
        0
    };

    text_score + std::cmp::min(result.total_matches, 25) as i64
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
    content_type: Option<String>,
}

fn read_frontmatter_meta_from_str(content: &str) -> (Option<String>, Option<bool>, Option<String>) {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None, None);
    };
    let mut title: Option<String> = None;
    let mut draft: Option<bool> = None;
    let mut content_type: Option<String> = None;
    for line in lines {
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
        } else if let Some(rest) = line.strip_prefix("type:") {
            let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if !val.is_empty() {
                content_type = Some(val);
            }
        }
    }
    (title, draft, content_type)
}

/// Read the frontmatter block (between `---` fences) of a markdown file and
/// extract the `title`, `draft`, and `type` scalar values using simple line scanning.
/// Returns `(None, None, None)` if the file can't be read or has no frontmatter.
/// Uses a buffered reader so only the frontmatter is read, not the full file.
fn read_frontmatter_meta(path: &Path) -> (Option<String>, Option<bool>, Option<String>) {
    use std::io::{BufRead, BufReader};
    let Ok(file) = std::fs::File::open(path) else {
        return (None, None, None);
    };
    let mut reader = BufReader::new(file);
    let mut frontmatter = String::new();
    let mut frontmatter_line_count = 0;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        frontmatter.push_str(&line);
        frontmatter_line_count += 1;
        if frontmatter_line_count > 1 && line.trim() == "---" {
            break;
        }
    }
    read_frontmatter_meta_from_str(&frontmatter)
}

fn read_frontmatter_meta_cached(
    path: &Path,
    cache: &mut HashMap<PathBuf, CachedFrontmatter>,
) -> (Option<String>, Option<bool>, Option<String>) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return read_frontmatter_meta(path);
    };
    let modified = metadata.modified().ok();
    let len = metadata.len();

    if let Some(cached) = cache.get(path) {
        if cached.modified == modified && cached.len == len {
            return (
                cached.title.clone(),
                cached.draft,
                cached.content_type.clone(),
            );
        }
    }

    let (title, draft, content_type) = read_frontmatter_meta(path);
    cache.insert(
        path.to_path_buf(),
        CachedFrontmatter {
            modified,
            len,
            title: title.clone(),
            draft,
            content_type: content_type.clone(),
        },
    );
    (title, draft, content_type)
}

fn load_search_file_cached(
    path: &Path,
    cache: &mut HashMap<PathBuf, CachedSearchFile>,
    frontmatter_cache: &HashMap<PathBuf, CachedFrontmatter>,
) -> Option<CachedSearchFile> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok();
    let len = metadata.len();

    if let Some(cached) = cache.get(path) {
        if cached.modified == modified && cached.len == len {
            return Some(cached.clone());
        }
    }

    let content = std::fs::read_to_string(path).ok()?;
    let title = frontmatter_cache
        .get(path)
        .filter(|cached| cached.modified == modified && cached.len == len)
        .and_then(|cached| cached.title.clone())
        .or_else(|| read_frontmatter_meta_from_str(&content).0);
    let entry = CachedSearchFile {
        modified,
        len,
        title,
        lines: content.lines().map(|line| line.to_string()).collect(),
    };
    cache.insert(path.to_path_buf(), entry.clone());
    Some(entry)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceResult {
    name: String,
    root_path: String,
    tree_root: String,
    /// Directory to resolve root-relative image paths against.
    /// Set to `<workspace>/public` when that directory exists (static-site
    /// convention), otherwise falls back to the workspace root.
    asset_root: String,
    tree: Vec<FileNode>,
    is_amytis_workspace: bool,
    cdn_base: Option<String>,
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("md") | Some("mdx")
    )
}

fn perf_logging_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var_os("OVID_PERF").is_some()
}

fn log_perf(command: &str, elapsed: std::time::Duration, details: &[(&str, String)]) {
    if !perf_logging_enabled() {
        return;
    }

    let mut message = format!("[perf] {command} took {}ms", elapsed.as_millis());
    if !details.is_empty() {
        let suffix = details
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join(" ");
        message.push(' ');
        message.push_str(&suffix);
    }
    eprintln!("{message}");
}

fn walk_dir(path: &Path, cache: &mut HashMap<PathBuf, CachedFrontmatter>) -> Vec<FileNode> {
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

        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            let children = walk_dir(&entry_path, cache);
            if !children.is_empty() {
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: true,
                    children: Some(children),
                    extension: None,
                    title: None,
                    draft: None,
                    content_type: None,
                });
            }
        } else {
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if ext == "md" || ext == "mdx" {
                let (title, draft, content_type) = read_frontmatter_meta_cached(&entry_path, cache);
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: false,
                    children: None,
                    extension: Some(format!(".{}", ext)),
                    title,
                    draft,
                    content_type,
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
    let parent = new_path.parent().ok_or("path has no parent directory")?;
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

/// Normalize a path to forward-slash separators for JSON serialization.
/// The frontend's `resolveImageSrc` splits on "/" so native Windows backslashes
/// would produce wrong results; this keeps paths consistent across platforms.
fn to_slash(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Compute the asset-serving root and CDN base for a workspace.
/// `asset_root` is `<workspace>/public/` when that directory exists (static-site
/// convention), falling back to the workspace root itself.
/// `cdn_base` is read from `site.config.ts` whenever that file exists,
/// regardless of whether the full Amytis structure (content/ dir) is present.
fn derive_workspace_meta(root: &Path) -> (PathBuf, Option<String>) {
    let pub_dir = root.join("public");
    let asset_root = if pub_dir.is_dir() {
        pub_dir
    } else {
        root.to_path_buf()
    };
    let cdn_base = parse_cdn_base(&root.join("site.config.ts"));
    (asset_root, cdn_base)
}

#[tauri::command]
async fn open_workspace_at_path(
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
        walk_dir(&tree_root, &mut cache)
    };
    let (asset_root, cdn_base) = derive_workspace_meta(&root);

    // Grant asset protocol access to the entire workspace root so that both
    // root-relative paths (resolved inside public/) and relative paths
    // (resolved anywhere within the workspace) can be served.
    if let Err(e) = app.asset_protocol_scope().allow_directory(&root, true) {
        eprintln!("Failed to grant asset protocol access for {root:?}: {e}");
    }

    let result = WorkspaceResult {
        name,
        root_path: to_slash(&root),
        tree_root: to_slash(&tree_root),
        asset_root: to_slash(&asset_root),
        tree,
        is_amytis_workspace,
        cdn_base,
    };
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
async fn open_workspace(
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

    let is_amytis_workspace =
        root.join("site.config.ts").is_file() && root.join("content").is_dir();
    let tree = {
        let mut cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
        walk_dir(&tree_root, &mut cache)
    };
    let (asset_root, cdn_base) = derive_workspace_meta(&root);

    // Grant asset protocol access to the entire workspace root so that both
    // root-relative paths (resolved inside public/) and relative paths
    // (resolved anywhere within the workspace) can be served.
    // Note: Tauri 2's Scope API has no reset/clear, so allowances from prior
    // workspace sessions accumulate in long-running processes. This is an
    // accepted trade-off; the scope is bounded to workspace roots the user
    // explicitly opened.
    if let Err(e) = app.asset_protocol_scope().allow_directory(&root, true) {
        eprintln!("Failed to grant asset protocol access for {root:?}: {e}");
    }

    let result = WorkspaceResult {
        name,
        root_path: to_slash(&root),
        tree_root: to_slash(&tree_root),
        asset_root: to_slash(&asset_root),
        tree,
        is_amytis_workspace,
        cdn_base,
    };
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

#[tauri::command]
fn list_workspace(state: State<'_, WorkspaceState>) -> Result<Vec<FileNode>, String> {
    let started = Instant::now();
    let root = {
        let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    let tree = {
        let mut cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
        walk_dir(&root, &mut cache)
    };
    log_perf(
        "list_workspace",
        started.elapsed(),
        &[
            ("treeRoot", to_slash(&root)),
            ("nodes", tree.len().to_string()),
        ],
    );
    Ok(tree)
}

#[tauri::command]
fn read_file(path: String, state: State<'_, WorkspaceState>) -> Result<String, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    std::fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(
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
fn create_file(
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
fn rename_file(
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

#[tauri::command]
fn trash_file(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?;
    let canonical = validate_path(root, &path)?;
    trash::delete(&canonical).map_err(|e| e.to_string())
}

const MAX_SEARCH_MATCHES_PER_FILE: usize = 8;

/// Search all markdown files under `path` for lines containing `query` (case-insensitive).
fn search_dir(
    path: &Path,
    query_lower: &str,
    cache: &mut HashMap<PathBuf, CachedSearchFile>,
    frontmatter_cache: &HashMap<PathBuf, CachedFrontmatter>,
) -> Vec<SearchResult> {
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
            results.extend(search_dir(
                &entry_path,
                query_lower,
                cache,
                frontmatter_cache,
            ));
        } else {
            if !is_markdown_path(&entry_path) {
                continue;
            }
            let Some(file) = load_search_file_cached(&entry_path, cache, frontmatter_cache) else {
                continue;
            };
            let mut total_matches = 0;
            let mut matches = Vec::new();

            for (i, line) in file.lines.iter().enumerate() {
                if !line.to_lowercase().contains(query_lower) {
                    continue;
                }
                total_matches += 1;
                if matches.len() < MAX_SEARCH_MATCHES_PER_FILE {
                    matches.push(SearchMatch {
                        line_number: i + 1,
                        line_content: line.trim().to_string(),
                    });
                }
            }

            if total_matches > 0 {
                results.push(SearchResult {
                    path: entry_path.to_string_lossy().to_string(),
                    title: file.title.clone(),
                    matches,
                    total_matches,
                    has_more_matches: total_matches > MAX_SEARCH_MATCHES_PER_FILE,
                });
            }
        }
    }
    results
}

#[tauri::command]
fn search_workspace(
    query: String,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<SearchResult>, String> {
    let started = Instant::now();
    if query.trim().is_empty() {
        log_perf(
            "search_workspace",
            started.elapsed(),
            &[("query", "empty".to_string()), ("results", "0".to_string())],
        );
        return Ok(Vec::new());
    }
    // Clone root before releasing the lock so the mutex is not held during search
    let root = {
        let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
        root_guard.as_ref().ok_or("no workspace open")?.clone()
    };
    let query_lower = query.trim().to_lowercase();
    let results = {
        // Keep cache lock ordering consistent: search_cache first, then
        // frontmatter_cache. If this path ever changes, preserve that order to
        // avoid introducing deadlocks across future cache-aware search/tree code.
        let mut cache = state.search_cache.lock().map_err(|e| e.to_string())?;
        let frontmatter_cache = state.frontmatter_cache.lock().map_err(|e| e.to_string())?;
        search_dir(&root, &query_lower, &mut cache, &frontmatter_cache)
    };
    let mut scored_results = results
        .into_iter()
        .map(|result| {
            let score = score_search_result(&result, &query_lower, &root);
            (score, result)
        })
        .collect::<Vec<_>>();
    scored_results.sort_by(|(score_a, result_a), (score_b, result_b)| {
        score_b
            .cmp(score_a)
            .then_with(|| result_a.path.cmp(&result_b.path))
    });
    let results = scored_results
        .into_iter()
        .map(|(_, result)| result)
        .collect::<Vec<_>>();
    let file_count = results.len();
    let match_count = results
        .iter()
        .map(|result| result.total_matches)
        .sum::<usize>();
    log_perf(
        "search_workspace",
        started.elapsed(),
        &[
            ("query", query.trim().to_string()),
            ("files", file_count.to_string()),
            ("matches", match_count.to_string()),
        ],
    );
    Ok(results)
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

/// Resolve `.` and `..` components without requiring the path to exist on disk.
fn normalize_path(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            c => out.push(c),
        }
    }
    out
}

/// Create a directory (and all ancestors) inside the workspace, succeeding if
/// it already exists. Unlike `create_dir`, the parent need not exist yet.
#[tauri::command]
fn ensure_dir(path: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = root_guard.as_ref().ok_or("no workspace open")?.clone();
    drop(root_guard);
    let canonical_root =
        std::fs::canonicalize(&root).map_err(|e| format!("workspace root: {e}"))?;
    let new_path = normalize_path(Path::new(&path));
    if !new_path.is_absolute() {
        return Err("path must be absolute".to_string());
    }
    if !new_path.starts_with(&canonical_root) {
        return Err("path is outside the opened workspace".to_string());
    }
    std::fs::create_dir_all(&new_path).map_err(|e| e.to_string())
}

// ── Content types ──────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentType {
    name: String,
}

/// Extract the first quoted string value from the beginning of `s`.
fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim();
    let quote = s.chars().next()?;
    if quote != '\'' && quote != '"' && quote != '`' {
        return None;
    }
    let inner = &s[quote.len_utf8()..];
    let end = inner.find(quote)?;
    Some(inner[..end].to_string())
}

/// Strip an optional leading quote char that matches `quote` from `s`.
fn strip_quote_pair<'a>(s: &'a str, key: &str, quote: char) -> Option<&'a str> {
    let s = s.strip_prefix(quote)?;
    let s = s.strip_prefix(key)?;
    s.strip_prefix(quote)
}

/// Best-effort scanner: look for `cdnBase` or `cdnUrl` keys in `site.config.ts`
/// and return the URL value. Handles both bare (`cdnBase:`) and quoted
/// (`"cdnBase":` / `'cdnBase':`) key forms. Returns `None` on any parse failure.
fn parse_cdn_base(config_path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(config_path).ok()?;
    let reader = BufReader::new(file);
    let mut in_block_comment = false;
    for line in reader.lines().flatten() {
        let trimmed = line.trim();
        // Track /* ... */ block comments that may span multiple lines
        if in_block_comment {
            if trimmed.contains("*/") {
                in_block_comment = false;
            }
            continue;
        }
        if trimmed.starts_with("/*") {
            if !trimmed.contains("*/") {
                in_block_comment = true;
            }
            continue;
        }
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }
        for key in &["cdnBase", "cdnUrl"] {
            // Match: cdnBase, "cdnBase", or 'cdnBase'
            let after_key = trimmed
                .strip_prefix(key)
                .or_else(|| strip_quote_pair(trimmed, key, '"'))
                .or_else(|| strip_quote_pair(trimmed, key, '\''));
            if let Some(rest) = after_key {
                let rest = rest.trim_start();
                let Some(rest) = rest.strip_prefix(':') else {
                    continue;
                };
                if let Some(url) = extract_quoted_string(rest) {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        return Some(url);
                    }
                }
            }
        }
    }
    None
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitChange {
    path: String,
    display_path: String,
    status: String,
    staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranch {
    name: String,
    upstream: Option<String>,
    ahead_behind: Option<String>,
    is_current: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitRemoteBranch {
    name: String,
    remote_name: String,
    remote_ref: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitRemote {
    name: String,
    url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitRemoteInfo {
    remotes: Vec<GitRemote>,
    remote_name: Option<String>,
    remote_url: Option<String>,
    upstream: Option<String>,
    ahead_behind: Option<String>,
}

/// Run a git subcommand rooted at `root`. Returns stdout on success or an
/// error string (stderr) on failure. Returns an empty string if git is not
/// found, so callers can treat a missing git as a graceful no-op.
fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd_args = vec!["-C", root];
    cmd_args.extend_from_slice(args);
    let output = std::process::Command::new("git")
        .args(&cmd_args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .output()
        .map_err(|_| "git not found".to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn resolve_git_root(state: State<'_, WorkspaceState>) -> Result<Option<String>, String> {
    let root_guard = state.tree_root.lock().map_err(|e| e.to_string())?;
    let root = match root_guard.as_ref() {
        Some(r) => r.clone(),
        None => return Ok(None),
    };
    drop(root_guard);

    Ok(
        run_git(&root.to_string_lossy(), &["rev-parse", "--show-toplevel"])
            .ok()
            .map(|s| s.trim().to_string()),
    )
}

fn resolve_workspace_root(state: State<'_, WorkspaceState>) -> Result<Option<PathBuf>, String> {
    let root_guard = state.workspace_root.lock().map_err(|e| e.to_string())?;
    Ok(root_guard.as_ref().cloned())
}

fn validate_git_commit_path(workspace_root: &Path, requested: &str) -> Result<String, String> {
    let requested_path = Path::new(requested);
    if requested.trim().is_empty() {
        return Err("commit path cannot be empty".to_string());
    }
    if requested_path.is_absolute() {
        return Err("commit path must be relative to the opened workspace".to_string());
    }

    let canonical_root =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let candidate = canonical_root.join(requested_path);
    if candidate.exists() {
        validate_path(&canonical_root, &candidate.to_string_lossy())?;
    } else {
        let normalized = normalize_path(&candidate);
        if !normalized.starts_with(&canonical_root) {
            return Err("path is outside the opened workspace".to_string());
        }
    }

    Ok(requested.to_string())
}

fn validate_git_commit_selection(
    git_root: &Path,
    workspace_root: &Path,
    requested: &str,
) -> Result<String, String> {
    validate_git_commit_path(git_root, requested)?;

    let git_root_canonical =
        std::fs::canonicalize(git_root).map_err(|e| format!("git root: {e}"))?;
    let workspace_root_canonical =
        std::fs::canonicalize(workspace_root).map_err(|e| format!("workspace root: {e}"))?;
    let candidate = git_root_canonical.join(requested);

    let target = if candidate.exists() {
        std::fs::canonicalize(&candidate).map_err(|e| format!("commit path: {e}"))?
    } else {
        normalize_path(&candidate)
    };

    if !target.starts_with(&workspace_root_canonical) {
        return Err("path is outside the opened workspace".to_string());
    }

    Ok(requested.to_string())
}

fn parse_git_status_output(git_root: &str, porcelain: &str) -> Vec<GitCommitChange> {
    let mut changes = Vec::new();
    let mut records = porcelain.split('\0').filter(|record| !record.is_empty());

    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let xy = &record[..2];
        let path_part = &record[3..];
        let index_status = xy.chars().next().unwrap_or(' ');
        let worktree_status = xy.chars().nth(1).unwrap_or(' ');
        let file_path = if matches!(index_status, 'R' | 'C') || matches!(worktree_status, 'R' | 'C')
        {
            records.next().unwrap_or(path_part)
        } else {
            path_part
        };
        let staged = index_status != ' ' && index_status != '?';
        let status = if xy.starts_with('?') {
            "untracked"
        } else if index_status == 'D' || worktree_status == 'D' {
            "deleted"
        } else if matches!(index_status, 'R' | 'C') || matches!(worktree_status, 'R' | 'C') {
            "renamed"
        } else if index_status == 'A' {
            "added"
        } else if staged {
            "staged"
        } else {
            "modified"
        };

        changes.push(GitCommitChange {
            path: PathBuf::from(git_root)
                .join(file_path)
                .to_string_lossy()
                .into_owned(),
            display_path: file_path.to_string(),
            status: status.to_string(),
            staged,
        });
    }

    changes
}

fn parse_git_status(git_root: &str) -> Result<Vec<GitCommitChange>, String> {
    let porcelain = run_git(git_root, &["status", "--porcelain=v1", "-z"])?;
    Ok(parse_git_status_output(git_root, &porcelain))
}

fn parse_git_branches(git_root: &str) -> Result<Vec<GitBranch>, String> {
    let refs = run_git(
        git_root,
        &[
            "for-each-ref",
            "--format=%(refname:short)\t%(upstream:short)\t%(upstream:trackshort)\t%(HEAD)",
            "refs/heads",
        ],
    )?;

    Ok(parse_git_branch_lines(&refs))
}

fn parse_git_branch_lines(refs: &str) -> Vec<GitBranch> {
    let mut branches = Vec::new();
    for line in refs.lines() {
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let upstream = parts.next().map(str::trim).filter(|s| !s.is_empty());
        let ahead_behind = parts.next().map(str::trim).filter(|s| !s.is_empty());
        let head = parts.next().unwrap_or("").trim();
        branches.push(GitBranch {
            name: name.to_string(),
            upstream: upstream.map(ToString::to_string),
            ahead_behind: ahead_behind.map(ToString::to_string),
            is_current: head == "*",
        });
    }

    branches.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    branches
}

fn parse_git_remote_branch_lines(refs: &str) -> Vec<GitRemoteBranch> {
    let mut branches = Vec::new();
    for line in refs.lines() {
        let remote_ref = line.trim();
        if remote_ref.is_empty() || remote_ref.ends_with("/HEAD") {
            continue;
        }
        let Some((remote_name, branch_name)) = remote_ref.split_once('/') else {
            continue;
        };
        if branch_name.trim().is_empty() {
            continue;
        }
        branches.push(GitRemoteBranch {
            name: branch_name.to_string(),
            remote_name: remote_name.to_string(),
            remote_ref: remote_ref.to_string(),
        });
    }

    branches.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.remote_name.cmp(&b.remote_name))
    });
    branches
}

fn parse_git_remote_branches(git_root: &str) -> Result<Vec<GitRemoteBranch>, String> {
    let refs = run_git(
        git_root,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )?;

    Ok(parse_git_remote_branch_lines(&refs))
}

fn parse_remote_name(upstream: &str) -> Option<String> {
    upstream
        .split('/')
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
}

fn get_git_remotes(git_root: &str) -> Result<Vec<GitRemote>, String> {
    let output = run_git(git_root, &["remote"])?;
    let mut remotes = output
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| GitRemote {
            name: name.to_string(),
            url: run_git(git_root, &["remote", "get-url", name])
                .ok()
                .and_then(|url| normalize_remote_url(url.trim()))
                .filter(|url| !url.is_empty()),
        })
        .collect::<Vec<_>>();
    remotes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(remotes)
}

fn get_git_config_value(git_root: &str, key: &str) -> Option<String> {
    run_git(git_root, &["config", "--get", key])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn get_preferred_remote_name(
    git_root: &str,
    current_branch: &GitBranch,
    remotes: &[GitRemote],
) -> Option<String> {
    let is_known_remote = |name: &str| remotes.iter().any(|remote| remote.name == name);

    if let Some(name) = current_branch
        .upstream
        .as_deref()
        .and_then(parse_remote_name)
        .filter(|name| is_known_remote(name))
    {
        return Some(name);
    }

    if let Some(name) = get_git_config_value(
        git_root,
        &format!("branch.{}.pushRemote", current_branch.name),
    )
    .filter(|name| is_known_remote(name))
    {
        return Some(name);
    }

    if let Some(name) =
        get_git_config_value(git_root, "remote.pushDefault").filter(|name| is_known_remote(name))
    {
        return Some(name);
    }

    if remotes.len() == 1 {
        return remotes.first().map(|remote| remote.name.clone());
    }

    None
}

fn normalize_remote_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let (scheme, rest) = trimmed.split_once("://")?;
        let (authority, path) = rest.split_once('/').unwrap_or((rest, ""));
        let sanitized_authority = authority
            .rsplit_once('@')
            .map(|(_, host)| host)
            .unwrap_or(authority);
        let sanitized = if path.is_empty() {
            format!("{scheme}://{sanitized_authority}")
        } else {
            format!("{scheme}://{sanitized_authority}/{path}")
        };
        return Some(sanitized.trim_end_matches(".git").to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        return Some(format!(
            "https://{}/{}",
            host,
            path.trim_end_matches(".git")
        ));
    }
    if let Some(rest) = trimmed.strip_prefix("ssh://git@") {
        let (host, path) = rest.split_once('/')?;
        return Some(format!(
            "https://{}/{}",
            host,
            path.trim_end_matches(".git")
        ));
    }
    None
}

fn get_git_remote_info_inner(git_root: &str) -> Result<GitRemoteInfo, String> {
    let branches = parse_git_branches(git_root)?;
    let current = branches.iter().find(|branch| branch.is_current);
    let remotes = get_git_remotes(git_root)?;
    let remote_name =
        current.and_then(|branch| get_preferred_remote_name(git_root, branch, &remotes));
    let remote_url = remote_name.as_deref().and_then(|name| {
        remotes
            .iter()
            .find(|remote| remote.name == name)
            .and_then(|remote| remote.url.clone())
    });

    Ok(GitRemoteInfo {
        remotes,
        remote_name,
        remote_url,
        upstream: current.and_then(|branch| branch.upstream.clone()),
        ahead_behind: current.and_then(|branch| branch.ahead_behind.clone()),
    })
}

fn get_current_branch_inner(git_root: &str) -> Result<String, String> {
    run_git(git_root, &["rev-parse", "--abbrev-ref", "HEAD"]).map(|s| s.trim().to_string())
}

fn git_push_args(
    remote: &GitRemoteInfo,
    current_branch: &str,
    explicit_remote_name: Option<&str>,
) -> Result<Vec<String>, String> {
    let explicit_remote_name = explicit_remote_name
        .map(str::trim)
        .filter(|name| !name.is_empty());

    if remote.upstream.is_some() && explicit_remote_name.is_none() {
        return Ok(vec!["push".to_string()]);
    }

    if let Some(name) = explicit_remote_name {
        if !remote
            .remotes
            .iter()
            .any(|configured| configured.name == name)
        {
            return Err("selected remote is no longer configured".to_string());
        }
    }

    let remote_name = explicit_remote_name
        .map(ToString::to_string)
        .or_else(|| remote.remote_name.clone())
        .ok_or_else(|| {
            if remote.remotes.len() > 1 {
                "multiple remotes configured; choose one to set upstream".to_string()
            } else {
                "no remote configured".to_string()
            }
        })?;
    if current_branch.trim().is_empty() {
        return Err("could not determine current branch".to_string());
    }
    Ok(vec![
        "push".to_string(),
        "-u".to_string(),
        remote_name,
        current_branch.to_string(),
    ])
}

fn git_create_branch_args(branch_name: &str) -> Vec<String> {
    vec![
        "switch".to_string(),
        "-c".to_string(),
        branch_name.to_string(),
    ]
}

fn git_rename_branch_args(old_branch: &str, new_branch: &str) -> Vec<String> {
    vec![
        "branch".to_string(),
        "-m".to_string(),
        old_branch.to_string(),
        new_branch.to_string(),
    ]
}

fn git_delete_branch_args(branch_name: &str) -> Vec<String> {
    vec![
        "branch".to_string(),
        "-d".to_string(),
        branch_name.to_string(),
    ]
}

fn git_checkout_remote_branch_args(remote_ref: &str) -> Result<Vec<String>, String> {
    let trimmed = remote_ref.trim();
    let Some((_, branch_name)) = trimmed.split_once('/') else {
        return Err("remote branch must include a remote name".to_string());
    };
    if branch_name.trim().is_empty() {
        return Err("remote branch name cannot be empty".to_string());
    }
    Ok(vec![
        "switch".to_string(),
        "-c".to_string(),
        branch_name.to_string(),
        "--track".to_string(),
        trimmed.to_string(),
    ])
}

fn validate_git_branch_rename(
    old_branch: &str,
    new_branch: &str,
) -> Result<(String, String), String> {
    let old_branch = old_branch.trim();
    let new_branch = new_branch.trim();
    if old_branch.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    if new_branch.is_empty() {
        return Err("new branch name cannot be empty".to_string());
    }
    if old_branch == new_branch {
        return Err("branch name is unchanged".to_string());
    }
    Ok((old_branch.to_string(), new_branch.to_string()))
}

fn validate_git_branch_delete(branches: &[GitBranch], branch_name: &str) -> Result<String, String> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    let Some(branch) = branches.iter().find(|branch| branch.name == branch_name) else {
        return Err("branch is unavailable".to_string());
    };
    if branch.is_current {
        return Err("cannot delete the current branch".to_string());
    }
    Ok(branch_name.to_string())
}

fn is_git_transport_error(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("permission denied")
        || lower.contains("repository not found")
        || lower.contains("could not resolve host")
        || lower.contains("failed to connect")
        || lower.contains("connection timed out")
}

fn classify_git_push_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("non-fast-forward")
        || lower.contains("[rejected]")
        || lower.contains("fetch first")
    {
        return "Push rejected. Remote has new commits. Pull or fetch first.".to_string();
    }
    if is_git_transport_error(stderr) {
        return "Push failed because the remote could not be reached or authorized.".to_string();
    }
    stderr.to_string()
}

fn classify_git_pull_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("not possible to fast-forward") || lower.contains("cannot fast-forward") {
        return "Pull stopped because the branch cannot be fast-forwarded. Resolve it in Git, then refresh.".to_string();
    }
    if lower.contains("would be overwritten by merge") || lower.contains("local changes") {
        return "Pull blocked by local changes. Commit, stash, or discard changes first."
            .to_string();
    }
    if lower.contains("conflict") {
        return "Pull stopped because of conflicts. Resolve them in Git, then refresh.".to_string();
    }
    if is_git_transport_error(stderr) {
        return "Pull failed because the remote could not be reached or authorized.".to_string();
    }
    stderr.to_string()
}

fn classify_git_branch_delete_error(stderr: &str) -> String {
    let lower = stderr.to_lowercase();
    if lower.contains("not fully merged") {
        return "Delete stopped because the branch has unmerged commits. Merge it first or use Git CLI to force delete.".to_string();
    }
    stderr.to_string()
}

#[tauri::command]
fn get_git_status(state: State<'_, WorkspaceState>) -> Result<Vec<GitFileStatus>, String> {
    let git_root = match resolve_git_root(state)? {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };

    Ok(parse_git_status(&git_root)?
        .into_iter()
        .map(|change| GitFileStatus {
            path: change.path,
            status: if change.status == "untracked" {
                "untracked".to_string()
            } else if change.staged {
                "staged".to_string()
            } else {
                "modified".to_string()
            },
        })
        .collect())
}

#[tauri::command]
fn get_git_commit_changes(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitCommitChange>, String> {
    let git_root = match resolve_git_root(state)? {
        Some(root) => root,
        None => return Ok(Vec::new()),
    };
    parse_git_status(&git_root)
}

#[tauri::command]
fn get_git_branch(state: State<'_, WorkspaceState>) -> Result<String, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(String::new());
    };
    Ok(get_current_branch_inner(&git_root).unwrap_or_default())
}

#[tauri::command]
fn get_git_branches(state: State<'_, WorkspaceState>) -> Result<Vec<GitBranch>, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(Vec::new());
    };
    parse_git_branches(&git_root)
}

#[tauri::command]
fn get_git_remote_branches(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<GitRemoteBranch>, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(Vec::new());
    };
    parse_git_remote_branches(&git_root)
}

#[tauri::command]
fn get_git_remote_info(state: State<'_, WorkspaceState>) -> Result<GitRemoteInfo, String> {
    let Some(git_root) = resolve_git_root(state)? else {
        return Ok(GitRemoteInfo {
            remotes: Vec::new(),
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        });
    };
    get_git_remote_info_inner(&git_root)
}

async fn run_blocking_git<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn git_commit(
    message: String,
    push: bool,
    paths: Vec<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    if paths.is_empty() {
        return Err("select at least one file to commit".to_string());
    }

    let workspace_root = resolve_workspace_root(state.clone())?.ok_or("no workspace open")?;
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let validated_paths = paths
        .iter()
        .map(|path| validate_git_commit_selection(Path::new(&git_root), &workspace_root, path))
        .collect::<Result<Vec<_>, _>>()?;
    run_blocking_git(move || {
        let mut add_args: Vec<&str> = vec!["add", "-A", "--"];
        for path in &validated_paths {
            add_args.push(path.as_str());
        }
        run_git(&git_root, &add_args)?;

        let mut commit_args: Vec<&str> = vec!["commit", "-m", &message, "--"];
        for path in &validated_paths {
            commit_args.push(path.as_str());
        }
        run_git(&git_root, &commit_args)?;
        if push {
            let push_result = (|| -> Result<(), String> {
                let remote = get_git_remote_info_inner(&git_root)?;
                let branch = get_current_branch_inner(&git_root)?;
                let args = git_push_args(&remote, &branch, None)?;
                let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
                run_git(&git_root, &arg_refs).map_err(|err| classify_git_push_error(&err))?;
                Ok(())
            })();
            if let Err(err) = push_result {
                return Err(format!("commit created, but push failed: {err}"));
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_push(
    remote_name: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        let remote = get_git_remote_info_inner(&git_root)?;
        let branch = get_current_branch_inner(&git_root)?;
        let args = git_push_args(&remote, &branch, remote_name.as_deref())?;
        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        run_git(&git_root, &arg_refs).map_err(|err| classify_git_push_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_pull(state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["pull", "--ff-only"]).map_err(|err| classify_git_pull_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_fetch(state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["fetch"])?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_switch_branch(branch: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        run_git(&git_root, &["switch", "--", &branch])?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_create_branch(branch: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let name = branch.trim();
    if name.is_empty() {
        return Err("branch name cannot be empty".to_string());
    }
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let branch_name = name.to_string();
    run_blocking_git(move || {
        let args = git_create_branch_args(&branch_name);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_rename_branch(
    old_branch: String,
    new_branch: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let (old_branch, new_branch) = validate_git_branch_rename(&old_branch, &new_branch)?;
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        let args = git_rename_branch_args(&old_branch, &new_branch);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_delete_branch(branch: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    run_blocking_git(move || {
        let branches = parse_git_branches(&git_root)?;
        let branch_name = validate_git_branch_delete(&branches, &branch)?;
        let args = git_delete_branch_args(&branch_name);
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs).map_err(|err| classify_git_branch_delete_error(&err))?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn git_checkout_remote_branch(
    remote_ref: String,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let remote_ref = remote_ref.trim().to_string();
    if remote_ref.is_empty() {
        return Err("remote branch cannot be empty".to_string());
    }
    let remote_branches = parse_git_remote_branches(&git_root)?;
    if !remote_branches
        .iter()
        .any(|branch| branch.remote_ref == remote_ref)
    {
        return Err("remote branch is unavailable".to_string());
    }

    run_blocking_git(move || {
        let branches = parse_git_branches(&git_root)?;
        if let Some(existing) = branches
            .iter()
            .find(|branch| branch.upstream.as_deref() == Some(remote_ref.as_str()))
        {
            run_git(&git_root, &["switch", "--", &existing.name])?;
            return Ok(());
        }

        let Some((_, branch_name)) = remote_ref.split_once('/') else {
            return Err("remote branch must include a remote name".to_string());
        };
        if branches.iter().any(|branch| branch.name == branch_name) {
            return Err(format!(
                "local branch `{branch_name}` already exists; switch to it or rename it first"
            ));
        }

        let args = git_checkout_remote_branch_args(&remote_ref)?;
        let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
        run_git(&git_root, &arg_refs)?;
        Ok(())
    })
    .await
}

#[tauri::command]
fn open_git_remote(
    app: tauri::AppHandle,
    remote_name: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let git_root = resolve_git_root(state)?.ok_or("no git repository open")?;
    let info = get_git_remote_info_inner(&git_root)?;
    let remote_count = info.remotes.len();
    let remote_url = match remote_name.as_deref() {
        Some(name) => info
            .remotes
            .iter()
            .find(|remote| remote.name == name)
            .and_then(|remote| remote.url.clone())
            .ok_or_else(|| format!("remote `{name}` is unavailable"))?,
        None => info.remote_url.ok_or_else(|| {
            if remote_count > 1 {
                "multiple remotes configured; choose one in the branch switcher".to_string()
            } else {
                "no remote configured".to_string()
            }
        })?,
    };
    app.opener()
        .open_url(&remote_url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Compute a POSIX-style relative path from `from_dir` to `to`.
fn relative_path_from(from_dir: &Path, to: &Path) -> String {
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

/// Copy an image from an arbitrary path into `<workspace>/assets/` and return
/// a path relative to the active markdown file (or `assets/<name>` as fallback).
///
/// Note: unlike `read_file`/`write_file`, `src_path` is intentionally not
/// Open a native file picker filtered to image types and return the chosen path.
#[tauri::command]
async fn pick_image_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
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
        tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().to_string(),
        tauri_plugin_dialog::FilePath::Url(u) => u.path().to_string(),
    };
    Ok(Some(path))
}

/// validated against the workspace root — drag-and-drop sources originate from
/// external locations (desktop, downloads, etc.). The destination is safely
/// constrained to `<workspace>/assets/`.
#[tauri::command]
fn save_asset(
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

    let assets_dir = root.join("assets");
    std::fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("could not create assets dir: {e}"))?;

    // Atomically reserve a destination path to avoid TOCTOU races.
    // Try the original name first; fall back to timestamp-prefixed candidates.
    let dest_name = match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(assets_dir.join(&file_name))
    {
        Ok(_) => file_name.clone(),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => loop {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let candidate = format!("{ts}_{file_name}");
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(assets_dir.join(&candidate))
            {
                Ok(_) => break candidate,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("could not reserve asset path: {e}")),
            }
        },
        Err(e) => return Err(format!("could not reserve asset path: {e}")),
    };

    let dest = assets_dir.join(&dest_name);
    std::fs::copy(src, &dest).map_err(|e| format!("copy failed: {e}"))?;

    // Return a path relative to the active file's directory when available.
    let rel = if let Some(active) = active_file_path {
        let from_dir = PathBuf::from(&active);
        let from_dir = from_dir.parent().unwrap_or(Path::new(""));
        relative_path_from(from_dir, &dest)
    } else {
        format!("assets/{dest_name}")
    };

    Ok(rel)
}

// ──────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceState {
            tree_root: Mutex::new(None),
            workspace_root: Mutex::new(None),
            frontmatter_cache: Mutex::new(HashMap::new()),
            search_cache: Mutex::new(HashMap::new()),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ── Ovid (app menu) ───────────────────────────────────────────────
            let ovid_menu = SubmenuBuilder::new(app, "Ovid")
                .items(&[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ])
                .build()?;

            // ── File ──────────────────────────────────────────────────────────
            let new_submenu = SubmenuBuilder::new(app, "New")
                .items(&[
                    &MenuItemBuilder::with_id("new-post", "New Post")
                        .accelerator("CmdOrCtrl+N")
                        .build(app)?,
                    &MenuItemBuilder::with_id("new-flow", "New Flow").build(app)?,
                    &MenuItemBuilder::with_id("new-note", "New Note").build(app)?,
                    &MenuItemBuilder::with_id("new-series", "New Series").build(app)?,
                    &MenuItemBuilder::with_id("new-book", "New Book").build(app)?,
                    &MenuItemBuilder::with_id("new-page", "New Page").build(app)?,
                ])
                .build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .items(&[
                    &new_submenu,
                    &MenuItemBuilder::with_id("today-flow", "Today's Flow")
                        .accelerator("CmdOrCtrl+Shift+T")
                        .build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("open-workspace", "Open Workspace…")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?,
                    &MenuItemBuilder::with_id("switch-workspace", "Switch Workspace…")
                        .accelerator("CmdOrCtrl+Shift+O")
                        .build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("save", "Save")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                    &MenuItemBuilder::with_id("close-file", "Close File")
                        .accelerator("CmdOrCtrl+W")
                        .build(app)?,
                ])
                .build()?;

            // ── Git ───────────────────────────────────────────────────────────
            let git_menu = SubmenuBuilder::new(app, "Git")
                .items(&[
                    &MenuItemBuilder::with_id("git-commit", "Commit Changes…")
                        .accelerator("CmdOrCtrl+Shift+G")
                        .build(app)?,
                    &MenuItemBuilder::with_id("git-switch-branch", "Switch Branch…").build(app)?,
                    &MenuItemBuilder::with_id("git-new-branch", "New Branch…").build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("git-open-remote", "Open Remote").build(app)?,
                    &MenuItemBuilder::with_id("git-copy-remote-url", "Copy Remote URL")
                        .build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("git-push", "Push").build(app)?,
                    &MenuItemBuilder::with_id("git-pull", "Pull").build(app)?,
                    &MenuItemBuilder::with_id("git-fetch", "Fetch").build(app)?,
                ])
                .build()?;

            // ── Edit ──────────────────────────────────────────────────────────
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .items(&[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("toggle-search", "Find in Workspace…")
                        .accelerator("CmdOrCtrl+Shift+F")
                        .build(app)?,
                    &MenuItemBuilder::with_id("file-switcher", "Open Quickly…")
                        .accelerator("CmdOrCtrl+P")
                        .build(app)?,
                ])
                .build()?;

            // ── Insert ────────────────────────────────────────────────────────
            let insert_menu = SubmenuBuilder::new(app, "Insert")
                .items(&[
                    &MenuItemBuilder::with_id("insert-link", "Link…")
                        .accelerator("CmdOrCtrl+K")
                        .build(app)?,
                    &MenuItemBuilder::with_id("insert-image", "Image…")
                        .accelerator("CmdOrCtrl+Shift+I")
                        .build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("insert-code-block", "Code Block").build(app)?,
                    &MenuItemBuilder::with_id("insert-table", "Table").build(app)?,
                    &MenuItemBuilder::with_id("insert-hr", "Horizontal Rule").build(app)?,
                ])
                .build()?;

            // ── Format ────────────────────────────────────────────────────────
            let format_menu = SubmenuBuilder::new(app, "Format")
                .items(&[
                    &MenuItemBuilder::with_id("format-bold", "Bold")
                        .accelerator("CmdOrCtrl+B")
                        .build(app)?,
                    &MenuItemBuilder::with_id("format-italic", "Italic")
                        .accelerator("CmdOrCtrl+I")
                        .build(app)?,
                    &MenuItemBuilder::with_id("format-strike", "Strikethrough").build(app)?,
                    &MenuItemBuilder::with_id("format-code", "Inline Code")
                        .accelerator("CmdOrCtrl+E")
                        .build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("format-heading-1", "Heading 1").build(app)?,
                    &MenuItemBuilder::with_id("format-heading-2", "Heading 2").build(app)?,
                    &MenuItemBuilder::with_id("format-heading-3", "Heading 3").build(app)?,
                    &MenuItemBuilder::with_id("format-heading-4", "Heading 4").build(app)?,
                    &MenuItemBuilder::with_id("format-heading-5", "Heading 5").build(app)?,
                    &MenuItemBuilder::with_id("format-heading-6", "Heading 6").build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("format-blockquote", "Blockquote").build(app)?,
                    &MenuItemBuilder::with_id("format-bullet-list", "Bullet List").build(app)?,
                    &MenuItemBuilder::with_id("format-ordered-list", "Numbered List").build(app)?,
                    &MenuItemBuilder::with_id("format-task-list", "Task List").build(app)?,
                ])
                .build()?;

            // ── View ──────────────────────────────────────────────────────────
            let view_menu = SubmenuBuilder::new(app, "View")
                .items(&[
                    &MenuItemBuilder::with_id("toggle-sidebar", "Toggle Sidebar")
                        .accelerator("CmdOrCtrl+\\")
                        .build(app)?,
                    &MenuItemBuilder::with_id("toggle-properties", "Toggle Properties Panel")
                        .accelerator("CmdOrCtrl+Shift+P")
                        .build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("zen-mode", "Zen Mode")
                        .accelerator("Ctrl+Cmd+Z")
                        .build(app)?,
                    &MenuItemBuilder::with_id("typewriter-mode", "Typewriter Mode").build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("toggle-spell-check", "Toggle Spell Check")
                        .build(app)?,
                ])
                .build()?;

            // ── Window ────────────────────────────────────────────────────────
            let window_menu = SubmenuBuilder::new(app, "Window")
                .items(&[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                ])
                .build()?;

            // ── Help ──────────────────────────────────────────────────────────
            let help_menu = SubmenuBuilder::new(app, "Help")
                .items(&[
                    &MenuItemBuilder::with_id("help-docs", "Ovid Documentation").build(app)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItemBuilder::with_id("help-issues", "Report an Issue…").build(app)?,
                ])
                .build()?;

            let menu = tauri::menu::Menu::with_items(
                app,
                &[
                    &ovid_menu,
                    &file_menu,
                    &edit_menu,
                    &insert_menu,
                    &format_menu,
                    &view_menu,
                    &git_menu,
                    &window_menu,
                    &help_menu,
                ],
            )?;
            app.set_menu(menu)?;

            // Help links are resolved in Rust; everything else is forwarded to
            // the frontend as a "menu-action" event.
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| match event.id().as_ref() {
                "help-docs" => {
                    let _ = handle
                        .opener()
                        .open_url("https://github.com/hutusi/ovid", None::<&str>);
                }
                "help-issues" => {
                    let _ = handle
                        .opener()
                        .open_url("https://github.com/hutusi/ovid/issues", None::<&str>);
                }
                id => {
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.emit("menu-action", id);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            open_workspace_at_path,
            list_workspace,
            read_file,
            write_file,
            create_file,
            rename_file,
            trash_file,
            create_dir,
            ensure_dir,
            search_workspace,
            get_content_types,
            get_git_status,
            get_git_commit_changes,
            get_git_branch,
            get_git_branches,
            get_git_remote_branches,
            get_git_remote_info,
            git_commit,
            git_push,
            git_pull,
            git_fetch,
            git_switch_branch,
            git_create_branch,
            git_rename_branch,
            git_delete_branch,
            git_checkout_remote_branch,
            open_git_remote,
            save_asset,
            pick_image_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

// ── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Instant;
    use tempfile::TempDir;

    // ── normalize_path ───────────────────────────────────────────────────────

    #[test]
    fn normalize_path_resolves_parent_components() {
        assert_eq!(
            normalize_path(Path::new("/a/b/../c")),
            PathBuf::from("/a/c")
        );
    }

    #[test]
    fn normalize_path_removes_current_dir_components() {
        assert_eq!(
            normalize_path(Path::new("/a/./b/./c")),
            PathBuf::from("/a/b/c")
        );
    }

    #[test]
    fn normalize_path_handles_multiple_parent_jumps() {
        assert_eq!(
            normalize_path(Path::new("/a/b/c/../../d")),
            PathBuf::from("/a/d")
        );
    }

    #[test]
    fn normalize_path_plain_path_unchanged() {
        assert_eq!(normalize_path(Path::new("/a/b/c")), PathBuf::from("/a/b/c"));
    }

    #[test]
    fn normalize_path_parent_cannot_escape_root() {
        // Popping past the root stays at root on all platforms
        assert_eq!(
            normalize_path(Path::new("/a/../../etc/passwd")),
            PathBuf::from("/etc/passwd")
        );
    }

    // ── extract_quoted_string ────────────────────────────────────────────────

    #[test]
    fn extract_quoted_string_double_quotes() {
        assert_eq!(
            extract_quoted_string(r#" "https://cdn.example.com" "#),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn extract_quoted_string_single_quotes() {
        assert_eq!(
            extract_quoted_string(" 'https://cdn.example.com' "),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn extract_quoted_string_backtick() {
        assert_eq!(
            extract_quoted_string("`https://cdn.example.com`"),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn extract_quoted_string_no_quote_returns_none() {
        assert_eq!(extract_quoted_string("https://cdn.example.com"), None);
    }

    #[test]
    fn extract_quoted_string_empty_returns_none() {
        assert_eq!(extract_quoted_string(""), None);
    }

    #[test]
    fn git_create_branch_args_use_switch_create_without_ref_separator() {
        assert_eq!(
            git_create_branch_args("test"),
            vec!["switch".to_string(), "-c".to_string(), "test".to_string()]
        );
    }

    #[test]
    fn git_rename_branch_args_use_branch_move() {
        assert_eq!(
            git_rename_branch_args("main", "renamed-main"),
            vec![
                "branch".to_string(),
                "-m".to_string(),
                "main".to_string(),
                "renamed-main".to_string()
            ]
        );
    }

    #[test]
    fn git_delete_branch_args_use_safe_delete() {
        assert_eq!(
            git_delete_branch_args("feature/test"),
            vec![
                "branch".to_string(),
                "-d".to_string(),
                "feature/test".to_string()
            ]
        );
    }

    #[test]
    fn git_checkout_remote_branch_args_track_remote_ref() {
        assert_eq!(
            git_checkout_remote_branch_args("origin/feature/test").unwrap(),
            vec![
                "switch".to_string(),
                "-c".to_string(),
                "feature/test".to_string(),
                "--track".to_string(),
                "origin/feature/test".to_string()
            ]
        );
    }

    #[test]
    fn validate_git_branch_rename_rejects_unchanged_name() {
        assert_eq!(
            validate_git_branch_rename("main", "main"),
            Err("branch name is unchanged".to_string())
        );
    }

    #[test]
    fn validate_git_branch_delete_rejects_current_branch() {
        let branches = vec![
            GitBranch {
                name: "main".to_string(),
                upstream: Some("origin/main".to_string()),
                ahead_behind: None,
                is_current: true,
            },
            GitBranch {
                name: "feature/test".to_string(),
                upstream: Some("origin/feature/test".to_string()),
                ahead_behind: None,
                is_current: false,
            },
        ];

        assert_eq!(
            validate_git_branch_delete(&branches, "main"),
            Err("cannot delete the current branch".to_string())
        );
        assert_eq!(
            validate_git_branch_delete(&branches, "feature/test"),
            Ok("feature/test".to_string())
        );
    }

    // ── strip_quote_pair ─────────────────────────────────────────────────────

    #[test]
    fn strip_quote_pair_matches_double_quote() {
        assert_eq!(strip_quote_pair(r#""cdnBase":"#, "cdnBase", '"'), Some(":"));
    }

    #[test]
    fn strip_quote_pair_matches_single_quote() {
        assert_eq!(strip_quote_pair("'cdnBase':", "cdnBase", '\''), Some(":"));
    }

    #[test]
    fn strip_quote_pair_wrong_quote_returns_none() {
        assert_eq!(strip_quote_pair("\"cdnBase\":", "cdnBase", '\''), None);
    }

    #[test]
    fn strip_quote_pair_no_closing_quote_returns_none() {
        assert_eq!(strip_quote_pair("\"cdnBase:", "cdnBase", '"'), None);
    }

    // ── parse_cdn_base ───────────────────────────────────────────────────────

    fn write_config(dir: &TempDir, content: &str) -> PathBuf {
        let path = dir.path().join("site.config.ts");
        fs::write(&path, content).unwrap();
        path
    }

    fn write_markdown_file(path: &Path, title: &str, body: &str) {
        let content = format!("---\ntitle: \"{title}\"\ntype: note\n---\n\n{body}\n");
        fs::write(path, content).unwrap();
    }

    fn create_large_workspace_fixture(
        dir_count: usize,
        files_per_dir: usize,
        match_every: usize,
    ) -> TempDir {
        let dir = TempDir::new().unwrap();
        let content_root = dir.path().join("content");
        fs::create_dir_all(&content_root).unwrap();

        for dir_index in 0..dir_count {
            let section_dir = content_root.join(format!("section-{dir_index:03}"));
            fs::create_dir_all(&section_dir).unwrap();

            for file_index in 0..files_per_dir {
                let path = section_dir.join(format!("entry-{file_index:03}.md"));
                let title = format!("Entry {dir_index}-{file_index}");
                let body = if (dir_index * files_per_dir + file_index) % match_every == 0 {
                    "alpha needle beta gamma"
                } else {
                    "ordinary workspace content"
                };
                write_markdown_file(&path, &title, body);
            }
        }

        dir
    }

    #[test]
    fn parse_cdn_base_bare_key_single_quotes() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnBase: 'https://cdn.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_bare_key_double_quotes() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnBase: \"https://cdn.example.com\",\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_double_quoted_key() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  \"cdnBase\": \"https://cdn.example.com\",\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_single_quoted_key() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  'cdnBase': 'https://cdn.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://cdn.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_cdn_url_variant() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "export const config = {\n  cdnUrl: 'https://assets.example.com',\n};\n",
        );
        assert_eq!(
            parse_cdn_base(&path),
            Some("https://assets.example.com".to_string())
        );
    }

    #[test]
    fn parse_cdn_base_skips_line_comments() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "// cdnBase: 'https://cdn.example.com'\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    fn parse_cdn_base_skips_block_comment_lines() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "/**\n * cdnBase: 'https://cdn.example.com'\n */\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    fn parse_cdn_base_non_http_value_returns_none() {
        let dir = TempDir::new().unwrap();
        let path = write_config(&dir, "export const config = { cdnBase: 'relative/path' };");
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    fn parse_cdn_base_missing_file_returns_none() {
        assert_eq!(
            parse_cdn_base(Path::new("/nonexistent/site.config.ts")),
            None
        );
    }

    // ── derive_workspace_meta ────────────────────────────────────────────────

    #[test]
    fn derive_workspace_meta_uses_public_dir_when_present() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("public")).unwrap();
        let (asset_root, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(asset_root, dir.path().join("public"));
        assert_eq!(cdn_base, None);
    }

    #[test]
    fn derive_workspace_meta_falls_back_to_workspace_root() {
        let dir = TempDir::new().unwrap();
        let (asset_root, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(asset_root, dir.path().to_path_buf());
        assert_eq!(cdn_base, None);
    }

    #[test]
    fn derive_workspace_meta_extracts_cdn_base_when_config_present() {
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("site.config.ts"),
            "export const config = {\n  cdnBase: 'https://cdn.example.com',\n};\n",
        )
        .unwrap();
        let (_, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(cdn_base, Some("https://cdn.example.com".to_string()));
    }

    #[test]
    fn derive_workspace_meta_no_cdn_without_config() {
        let dir = TempDir::new().unwrap();
        // No site.config.ts — cdn_base must be None regardless of workspace type
        let (_, cdn_base) = derive_workspace_meta(dir.path());
        assert_eq!(cdn_base, None);
    }

    #[test]
    fn parse_cdn_base_skips_multi_line_block_comments() {
        let dir = TempDir::new().unwrap();
        let path = write_config(
            &dir,
            "/* This config has no CDN\n  cdnBase: 'https://cdn.example.com'\n*/\nexport const config = {};\n",
        );
        assert_eq!(parse_cdn_base(&path), None);
    }

    #[test]
    #[ignore = "profiling helper for large synthetic workspaces"]
    fn perf_walk_dir_large_workspace_fixture() {
        let dir = create_large_workspace_fixture(40, 80, 7);
        let mut cache = HashMap::new();

        let first_started = Instant::now();
        let first_tree = walk_dir(&dir.path().join("content"), &mut cache);
        let first_elapsed = first_started.elapsed();

        let second_started = Instant::now();
        let second_tree = walk_dir(&dir.path().join("content"), &mut cache);
        let second_elapsed = second_started.elapsed();

        let top_level_dirs = first_tree.iter().filter(|node| node.is_directory).count();
        assert_eq!(top_level_dirs, 40);
        assert_eq!(second_tree.len(), first_tree.len());
        eprintln!(
            "[perf-test] walk_dir fixture dirs=40 files_per_dir=80 top_level={} first={}ms second={}ms",
            top_level_dirs,
            first_elapsed.as_millis(),
            second_elapsed.as_millis()
        );
    }

    #[test]
    #[ignore = "profiling helper for large synthetic workspaces"]
    fn perf_search_dir_large_workspace_fixture() {
        let dir = create_large_workspace_fixture(40, 80, 5);
        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();

        let first_started = Instant::now();
        let first_results = search_dir(
            &dir.path().join("content"),
            "needle",
            &mut cache,
            &frontmatter_cache,
        );
        let first_elapsed = first_started.elapsed();

        let second_started = Instant::now();
        let second_results = search_dir(
            &dir.path().join("content"),
            "needle",
            &mut cache,
            &frontmatter_cache,
        );
        let second_elapsed = second_started.elapsed();

        let file_count = first_results.len();
        let match_count = first_results
            .iter()
            .map(|result| result.matches.len())
            .sum::<usize>();
        assert_eq!(file_count, 640);
        assert_eq!(match_count, 640);
        assert_eq!(second_results.len(), first_results.len());
        eprintln!(
            "[perf-test] search_dir fixture dirs=40 files_per_dir=80 matched_files={} matched_lines={} first={}ms second={}ms",
            file_count,
            match_count,
            first_elapsed.as_millis(),
            second_elapsed.as_millis()
        );
    }

    #[test]
    fn read_frontmatter_meta_cached_refreshes_when_file_changes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("entry.md");
        let mut cache = HashMap::new();

        write_markdown_file(&path, "First", "short body");
        let initial = read_frontmatter_meta_cached(&path, &mut cache);
        assert_eq!(initial.0.as_deref(), Some("First"));

        write_markdown_file(
            &path,
            "Second title",
            "body with more bytes to change the file size",
        );
        let updated = read_frontmatter_meta_cached(&path, &mut cache);
        assert_eq!(updated.0.as_deref(), Some("Second title"));
    }

    #[test]
    fn load_search_file_cached_refreshes_when_file_changes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("entry.md");
        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();

        write_markdown_file(&path, "First", "alpha needle");
        let initial = load_search_file_cached(&path, &mut cache, &frontmatter_cache).unwrap();
        assert_eq!(initial.title.as_deref(), Some("First"));
        assert!(initial.lines.iter().any(|line| line.contains("needle")));

        write_markdown_file(&path, "Second", "completely different body with more bytes");
        let updated = load_search_file_cached(&path, &mut cache, &frontmatter_cache).unwrap();
        assert_eq!(updated.title.as_deref(), Some("Second"));
        assert!(!updated.lines.iter().any(|line| line.contains("needle")));
    }

    #[test]
    fn search_dir_caps_returned_matches_per_file_but_keeps_total_count() {
        let dir = TempDir::new().unwrap();
        let content_root = dir.path().join("content");
        fs::create_dir_all(&content_root).unwrap();
        let path = content_root.join("entry.md");
        let body = (0..12)
            .map(|index| format!("needle line {index}"))
            .collect::<Vec<_>>()
            .join("\n");
        write_markdown_file(&path, "Needle", &body);

        let mut cache = HashMap::new();
        let frontmatter_cache = HashMap::new();
        let results = search_dir(&content_root, "needle", &mut cache, &frontmatter_cache);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].matches.len(), MAX_SEARCH_MATCHES_PER_FILE);
        assert_eq!(results[0].total_matches, 13);
        assert!(results[0].has_more_matches);
    }

    fn make_search_result(path: &str, title: Option<&str>, total_matches: usize) -> SearchResult {
        SearchResult {
            path: path.to_string(),
            title: title.map(str::to_string),
            matches: Vec::new(),
            total_matches,
            has_more_matches: false,
        }
    }

    #[test]
    fn score_search_result_prefers_exact_title_matches() {
        let root = PathBuf::from("/workspace");
        let exact = make_search_result("/workspace/notes/rust.md", Some("Rust"), 1);
        let prefix = make_search_result("/workspace/notes/rust-book.md", Some("Rust Book"), 1);

        assert!(score_search_result(&exact, "rust", &root) > score_search_result(&prefix, "rust", &root));
    }

    #[test]
    fn score_search_result_prefers_exact_path_parts_over_substrings() {
        let root = PathBuf::from("/workspace");
        let exact_part = make_search_result("/workspace/posts/hello/index.md", None, 1);
        let substring = make_search_result("/workspace/posts/say-hello/index.md", None, 1);

        assert!(
            score_search_result(&exact_part, "hello", &root)
                > score_search_result(&substring, "hello", &root)
        );
    }

    #[test]
    fn search_workspace_sort_prefers_relevance_then_match_count() {
        let root = PathBuf::from("/workspace");
        let mut results = vec![
            make_search_result("/workspace/archive/rust-notes.md", Some("Notes"), 5),
            make_search_result("/workspace/notes/rust.md", Some("Rust"), 1),
            make_search_result("/workspace/notes/rust-book.md", Some("Rust Book"), 2),
        ];

        results.sort_by(|a, b| {
            score_search_result(b, "rust", &root)
                .cmp(&score_search_result(a, "rust", &root))
                .then_with(|| a.path.cmp(&b.path))
        });

        assert_eq!(results[0].path, "/workspace/notes/rust.md");
        assert_eq!(results[1].path, "/workspace/notes/rust-book.md");
        assert_eq!(results[2].path, "/workspace/archive/rust-notes.md");
    }

    // ── git helpers ─────────────────────────────────────────────────────────

    #[test]
    fn parse_git_branch_lines_marks_current_branch_and_sorts_it_first() {
        let branches = parse_git_branch_lines(
            "feature/test\torigin/feature/test\t>\t \nmain\torigin/main\t<>\t*\n",
        );

        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "main");
        assert!(branches[0].is_current);
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
        assert_eq!(branches[0].ahead_behind.as_deref(), Some("<>"));
        assert_eq!(branches[1].name, "feature/test");
        assert!(!branches[1].is_current);
    }

    #[test]
    fn parse_git_remote_branch_lines_skips_head_and_sorts_by_name() {
        let branches = parse_git_remote_branch_lines(
            "origin/HEAD\norigin/main\nupstream/feature/test\norigin/feature/a\n",
        );

        assert_eq!(branches.len(), 3);
        assert_eq!(branches[0].remote_ref, "origin/feature/a");
        assert_eq!(branches[1].remote_ref, "upstream/feature/test");
        assert_eq!(branches[2].remote_ref, "origin/main");
    }

    #[test]
    fn parse_remote_name_extracts_remote_prefix() {
        assert_eq!(
            parse_remote_name("origin/feature/test"),
            Some("origin".to_string())
        );
    }

    #[test]
    fn normalize_remote_url_handles_https_and_ssh_forms() {
        assert_eq!(
            normalize_remote_url("https://github.com/hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
        assert_eq!(
            normalize_remote_url("https://user:token@github.com/hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
        assert_eq!(
            normalize_remote_url("git@github.com:hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
        assert_eq!(
            normalize_remote_url("ssh://git@github.com/hutusi/ovid-codex.git"),
            Some("https://github.com/hutusi/ovid-codex".to_string())
        );
    }

    #[test]
    fn parse_git_status_output_uses_destination_path_for_renames() {
        let git_root = "/repo";
        let changes = parse_git_status_output(git_root, "R  notes/old.md\0notes/new.md\0");

        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].display_path, "notes/new.md");
        assert_eq!(changes[0].status, "renamed");
        assert_eq!(
            changes[0].path,
            PathBuf::from(git_root)
                .join("notes/new.md")
                .to_string_lossy()
                .into_owned()
        );
    }

    #[test]
    fn parse_git_status_output_preserves_arrow_in_normal_filenames() {
        let git_root = "/repo";
        let changes = parse_git_status_output(git_root, " M notes/A -> B.md\0");

        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].display_path, "notes/A -> B.md");
        assert_eq!(changes[0].status, "modified");
    }

    #[test]
    fn get_preferred_remote_name_prefers_current_branch_upstream() {
        let branch = GitBranch {
            name: "main".to_string(),
            upstream: Some("origin/main".to_string()),
            ahead_behind: None,
            is_current: true,
        };
        let remotes = vec![
            GitRemote {
                name: "origin".to_string(),
                url: None,
            },
            GitRemote {
                name: "publish".to_string(),
                url: None,
            },
        ];

        assert_eq!(
            get_preferred_remote_name("/definitely/not/a/repo", &branch, &remotes),
            Some("origin".to_string())
        );
    }

    #[test]
    fn validate_git_commit_path_allows_existing_relative_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("notes").join("draft.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "# draft").unwrap();

        assert_eq!(
            validate_git_commit_path(dir.path(), "notes/draft.md").unwrap(),
            "notes/draft.md"
        );
    }

    #[test]
    fn validate_git_commit_path_allows_deleted_relative_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("notes").join("deleted.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();

        assert_eq!(
            validate_git_commit_path(dir.path(), "notes/deleted.md").unwrap(),
            "notes/deleted.md"
        );
    }

    #[test]
    fn validate_git_commit_path_rejects_absolute_paths() {
        let dir = TempDir::new().unwrap();
        let absolute = dir.path().join("notes").join("draft.md");

        assert_eq!(
            validate_git_commit_path(dir.path(), &absolute.to_string_lossy()),
            Err("commit path must be relative to the opened workspace".to_string())
        );
    }

    #[test]
    fn validate_git_commit_path_rejects_parent_escape() {
        let dir = TempDir::new().unwrap();

        assert_eq!(
            validate_git_commit_path(dir.path(), "../outside.md"),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[test]
    fn validate_git_commit_selection_rejects_paths_outside_nested_workspace() {
        let dir = TempDir::new().unwrap();
        let git_root = dir.path();
        let workspace_root = git_root.join("apps").join("blog");
        let outside_file = git_root.join("apps").join("admin").join("draft.md");

        fs::create_dir_all(workspace_root.join("posts")).unwrap();
        fs::create_dir_all(outside_file.parent().unwrap()).unwrap();
        fs::write(workspace_root.join("posts").join("entry.md"), "# blog").unwrap();
        fs::write(&outside_file, "# admin").unwrap();

        assert_eq!(
            validate_git_commit_selection(git_root, &workspace_root, "apps/admin/draft.md"),
            Err("path is outside the opened workspace".to_string())
        );
    }

    #[test]
    fn git_push_args_uses_plain_push_when_upstream_exists() {
        let remote = GitRemoteInfo {
            remotes: vec![GitRemote {
                name: "origin".to_string(),
                url: Some("https://github.com/hutusi/ovid-codex".to_string()),
            }],
            remote_name: Some("origin".to_string()),
            remote_url: Some("https://github.com/hutusi/ovid-codex.git".to_string()),
            upstream: Some("origin/main".to_string()),
            ahead_behind: None,
        };

        assert_eq!(git_push_args(&remote, "main", None).unwrap(), vec!["push"]);
    }

    #[test]
    fn classify_git_push_error_detects_non_fast_forward() {
        let stderr =
            "! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs";
        assert_eq!(
            classify_git_push_error(stderr),
            "Push rejected. Remote has new commits. Pull or fetch first."
        );
    }

    #[test]
    fn classify_git_push_error_detects_transport_failure() {
        let stderr = "fatal: Authentication failed for 'https://github.com/hutusi/ovid.git/'";
        assert_eq!(
            classify_git_push_error(stderr),
            "Push failed because the remote could not be reached or authorized."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_fast_forward_stop() {
        let stderr = "fatal: Not possible to fast-forward, aborting.";
        assert_eq!(
            classify_git_pull_error(stderr),
            "Pull stopped because the branch cannot be fast-forwarded. Resolve it in Git, then refresh."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_local_changes_blocking_pull() {
        let stderr =
            "error: Your local changes to the following files would be overwritten by merge:";
        assert_eq!(
            classify_git_pull_error(stderr),
            "Pull blocked by local changes. Commit, stash, or discard changes first."
        );
    }

    #[test]
    fn classify_git_pull_error_detects_conflicts() {
        let stderr = "CONFLICT (content): Merge conflict in notes/draft.md";
        assert_eq!(
            classify_git_pull_error(stderr),
            "Pull stopped because of conflicts. Resolve them in Git, then refresh."
        );
    }

    #[test]
    fn classify_git_branch_delete_error_detects_unmerged_branch() {
        let stderr = "error: The branch 'feature/test' is not fully merged.";
        assert_eq!(
            classify_git_branch_delete_error(stderr),
            "Delete stopped because the branch has unmerged commits. Merge it first or use Git CLI to force delete."
        );
    }

    #[test]
    fn git_push_args_sets_upstream_for_new_branch() {
        let remote = GitRemoteInfo {
            remotes: vec![GitRemote {
                name: "origin".to_string(),
                url: Some("https://github.com/hutusi/ovid-codex".to_string()),
            }],
            remote_name: Some("origin".to_string()),
            remote_url: Some("https://github.com/hutusi/ovid-codex.git".to_string()),
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", None).unwrap(),
            vec!["push", "-u", "origin", "feature/test"]
        );
    }

    #[test]
    fn git_push_args_errors_when_no_remote_exists() {
        let remote = GitRemoteInfo {
            remotes: Vec::new(),
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", None),
            Err("no remote configured".to_string())
        );
    }

    #[test]
    fn git_push_args_requires_explicit_remote_when_multiple_remotes_exist_without_upstream() {
        let remote = GitRemoteInfo {
            remotes: vec![
                GitRemote {
                    name: "origin".to_string(),
                    url: Some("https://github.com/hutusi/ovid-codex".to_string()),
                },
                GitRemote {
                    name: "publish".to_string(),
                    url: Some("https://github.com/example/ovid-codex".to_string()),
                },
            ],
            remote_name: None,
            remote_url: None,
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", None),
            Err("multiple remotes configured; choose one to set upstream".to_string())
        );
        assert_eq!(
            git_push_args(&remote, "feature/test", Some("publish")).unwrap(),
            vec!["push", "-u", "publish", "feature/test"]
        );
    }

    #[test]
    fn git_push_args_errors_when_selected_remote_is_missing() {
        let remote = GitRemoteInfo {
            remotes: vec![GitRemote {
                name: "origin".to_string(),
                url: Some("https://github.com/hutusi/ovid-codex".to_string()),
            }],
            remote_name: Some("origin".to_string()),
            remote_url: Some("https://github.com/hutusi/ovid-codex.git".to_string()),
            upstream: None,
            ahead_behind: None,
        };

        assert_eq!(
            git_push_args(&remote, "feature/test", Some("publish")),
            Err("selected remote is no longer configured".to_string())
        );
    }
}
