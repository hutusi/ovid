use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

mod app;
mod assets;
mod content_types;
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
use content_types::get_content_types;
use files::{
    create_dir, create_file, duplicate_entry, ensure_dir, read_file, rename_file, trash_file,
    write_file,
};
use git::commands::{
    get_git_branch, get_git_branches, get_git_commit_changes, get_git_remote_branches,
    get_git_remote_info, get_git_status, git_checkout_remote_branch, git_commit, git_create_branch,
    git_delete_branch, git_fetch, git_pull, git_push, git_rename_branch, git_switch_branch,
    open_git_remote,
};
use menu::{AboutState, build_app_menu, initial_menu_labels, set_menu_language};
use search::search_workspace;
use state::{WechatState, WorkspaceState};
use wechat::creds::{
    clear_wechat_credentials, get_wechat_credentials_status, set_wechat_credentials,
};
use wechat::publish::wechat_publish_draft;
use workspace::commands::{
    get_workspace_revision, list_workspace, list_workspace_children, open_workspace,
    open_workspace_at_path,
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let menu = build_app_menu(app, &initial_menu_labels())?;
            app.set_menu(menu)?;

            // Help links are resolved in Rust; everything else is forwarded to
            // the frontend as a "menu-action" event.
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| match event.id().as_ref() {
                "about" => {
                    let about: tauri::State<'_, AboutState> = handle.state();
                    let (Ok(title), Ok(body_template)) = (
                        about.title.lock().map(|g| g.clone()),
                        about.body_template.lock().map(|g| g.clone()),
                    ) else {
                        return;
                    };
                    let version = handle.package_info().version.to_string();
                    let _ = handle
                        .dialog()
                        .message(format!("Ovid {version}\n\n{body_template}"))
                        .title(title)
                        .blocking_show();
                }
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
            list_workspace_children,
            get_workspace_revision,
            read_file,
            write_file,
            create_file,
            rename_file,
            duplicate_entry,
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
            save_asset_from_bytes,
            pick_image_file,
            restart_app,
            set_menu_language,
            get_wechat_credentials_status,
            set_wechat_credentials,
            clear_wechat_credentials,
            wechat_publish_draft,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
