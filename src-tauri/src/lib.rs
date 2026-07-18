use std::collections::HashMap;
use std::sync::Mutex;

mod app;
mod assets;
mod content_types;
mod creds_store;
mod files;
mod git;
mod menu;
mod paths;
mod perf;
mod search;
mod state;
mod wechat;
mod workspace;

use app::restart_app;
use assets::{pick_image_file, save_asset, save_asset_from_bytes};
use files::{
    create_dir, create_file, duplicate_entry, ensure_dir, get_file_mtime, read_file,
    read_file_versioned, read_files_bulk, rename_file, trash_file, write_file,
};
use git::commands::{
    get_git_branch, get_git_branches, get_git_commit_changes, get_git_remote_branches,
    get_git_remote_info, get_git_status, git_checkout_remote_branch, git_commit, git_create_branch,
    git_delete_branch, git_fetch, git_fetch_with_credentials, git_forget_credentials,
    git_has_credentials_for_host, git_pull, git_pull_with_credentials, git_push,
    git_push_with_credentials, git_rename_branch, git_switch_branch, open_git_remote,
};
use menu::{
    AboutState, ViewToggleState, build_app_menu, initial_menu_labels, set_menu_checked,
    set_menu_language,
};
use search::search_workspace;
use state::{WechatState, WorkspaceState};
use wechat::creds::{
    clear_wechat_credentials, get_wechat_credentials_status, set_wechat_credentials,
};
use wechat::publish::wechat_publish_draft;
use workspace::commands::{
    clone_workspace, create_amytis_workspace, get_workspace_revision, list_workspace_tree,
    open_workspace, open_workspace_at_path,
};

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
        .manage(AboutState {
            title: Mutex::new("About Ovid".to_string()),
            body_template: Mutex::new(
                "A minimalist desktop Markdown editor\nfor Amytis workspaces.".to_string(),
            ),
        })
        .manage(WechatState {
            token_cache: Mutex::new(None),
        })
        .manage(ViewToggleState {
            sidebar_visible: Mutex::new(true),
            properties_open: Mutex::new(true),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let menu = build_app_menu(app, &initial_menu_labels(), true, true)?;
            app.set_menu(menu)?;
            menu::register_menu_event_handler(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            open_workspace_at_path,
            create_amytis_workspace,
            clone_workspace,
            list_workspace_tree,
            get_workspace_revision,
            read_file,
            read_file_versioned,
            read_files_bulk,
            get_file_mtime,
            write_file,
            create_file,
            rename_file,
            duplicate_entry,
            trash_file,
            create_dir,
            ensure_dir,
            search_workspace,
            get_git_status,
            get_git_commit_changes,
            get_git_branch,
            get_git_branches,
            get_git_remote_branches,
            get_git_remote_info,
            git_commit,
            git_push,
            git_push_with_credentials,
            git_pull,
            git_pull_with_credentials,
            git_fetch,
            git_fetch_with_credentials,
            git_forget_credentials,
            git_has_credentials_for_host,
            git_switch_branch,
            git_create_branch,
            git_rename_branch,
            git_delete_branch,
            git_checkout_remote_branch,
            open_git_remote,
            save_asset,
            save_asset_from_bytes,
            pick_image_file,
            restart_app,
            set_menu_language,
            set_menu_checked,
            get_wechat_credentials_status,
            set_wechat_credentials,
            clear_wechat_credentials,
            wechat_publish_draft,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
