use std::collections::HashMap;
use std::sync::Mutex;

use tauri::menu::{
    CheckMenuItemBuilder, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::State;

// Holds translated strings for the About dialog (non-macOS only).
pub(crate) struct AboutState {
    pub(crate) title: Mutex<String>,
    pub(crate) body_template: Mutex<String>,
}

// Tracks the visibility state of the two checkable View menu items
// (left sidebar / right sidebar) so the menu can be rebuilt with the
// correct check state on language change. Frontend keeps this in sync
// via `set_menu_checked`.
pub(crate) struct ViewToggleState {
    pub(crate) sidebar_visible: Mutex<bool>,
    pub(crate) properties_open: Mutex<bool>,
}

// ──────────────────────────────────────────────────────────────────────────
// Menu building
// ──────────────────────────────────────────────────────────────────────────

pub(crate) fn build_app_menu<R: tauri::Runtime>(
    app: &impl tauri::Manager<R>,
    l: &HashMap<String, String>,
    sidebar_checked: bool,
    properties_checked: bool,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let get = |key: &str| -> String { l.get(key).cloned().unwrap_or_else(|| key.to_string()) };

    #[cfg(target_os = "macos")]
    let about_item = PredefinedMenuItem::about(app, None, None)?;
    #[cfg(not(target_os = "macos"))]
    let about_item = MenuItemBuilder::with_id("about", get("about_item")).build(app)?;

    // Settings… — native home is the app menu on macOS; kept in the same
    // submenu elsewhere. The accelerator matches the Cmd+, global shortcut.
    let preferences_item = MenuItemBuilder::with_id("open-preferences", get("file_preferences"))
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    #[cfg(target_os = "macos")]
    let ovid_menu = SubmenuBuilder::new(app, "Ovid")
        .items(&[
            &about_item,
            &PredefinedMenuItem::separator(app)?,
            &preferences_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ])
        .build()?;
    #[cfg(not(target_os = "macos"))]
    let ovid_menu = SubmenuBuilder::new(app, "Ovid")
        .items(&[
            &about_item,
            &PredefinedMenuItem::separator(app)?,
            &preferences_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ])
        .build()?;

    let new_submenu = SubmenuBuilder::new(app, get("menu_new"))
        .items(&[
            &MenuItemBuilder::with_id("new-post", get("file_new_post"))
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
            &MenuItemBuilder::with_id("new-flow", get("file_new_flow")).build(app)?,
            &MenuItemBuilder::with_id("new-note", get("file_new_note")).build(app)?,
            &MenuItemBuilder::with_id("new-series", get("file_new_series")).build(app)?,
            &MenuItemBuilder::with_id("new-book", get("file_new_book")).build(app)?,
            &MenuItemBuilder::with_id("new-page", get("file_new_page")).build(app)?,
        ])
        .build()?;

    let file_menu = SubmenuBuilder::new(app, get("menu_file"))
        .items(&[
            &new_submenu,
            // Cmd+Shift+T to match the global useKeyboardShortcuts binding.
            // The previous Cmd+T disagreed with the global shortcut, so the
            // two surfaces fought.
            &MenuItemBuilder::with_id("today-flow", get("file_today_flow"))
                .accelerator("CmdOrCtrl+Shift+T")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("open-workspace", get("file_open_workspace"))
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
            &MenuItemBuilder::with_id("switch-workspace", get("file_switch_workspace"))
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("save", get("file_save"))
                .accelerator("CmdOrCtrl+S")
                .build(app)?,
            &MenuItemBuilder::with_id("close-file", get("file_close_file"))
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("wechat-copy", get("file_wechat_copy")).build(app)?,
            &MenuItemBuilder::with_id("wechat-publish", get("file_wechat_publish")).build(app)?,
        ])
        .build()?;

    let git_menu = SubmenuBuilder::new(app, get("menu_git"))
        .items(&[
            &MenuItemBuilder::with_id("git-commit", get("git_commit"))
                .accelerator("CmdOrCtrl+Shift+G")
                .build(app)?,
            &MenuItemBuilder::with_id("git-switch-branch", get("git_switch_branch")).build(app)?,
            &MenuItemBuilder::with_id("git-new-branch", get("git_new_branch")).build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("git-open-remote", get("git_open_remote")).build(app)?,
            &MenuItemBuilder::with_id("git-copy-remote-url", get("git_copy_remote_url"))
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("git-push", get("git_push")).build(app)?,
            &MenuItemBuilder::with_id("git-pull", get("git_pull")).build(app)?,
            &MenuItemBuilder::with_id("git-fetch", get("git_fetch")).build(app)?,
        ])
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, get("menu_edit"))
        .items(&[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("toggle-search", get("edit_find_in_workspace"))
                .accelerator("CmdOrCtrl+Shift+F")
                .build(app)?,
            // In-document find/replace — distinct from the workspace-wide
            // search above. These payloads are editor commands routed via
            // useEditorCommands (not useMenuActions).
            &MenuItemBuilder::with_id("find", get("edit_find"))
                .accelerator("CmdOrCtrl+F")
                .build(app)?,
            &MenuItemBuilder::with_id("find-replace", get("edit_find_replace"))
                .accelerator("CmdOrCtrl+H")
                .build(app)?,
            &MenuItemBuilder::with_id("file-switcher", get("edit_open_quickly"))
                .accelerator("CmdOrCtrl+P")
                .build(app)?,
        ])
        .build()?;

    let insert_menu = SubmenuBuilder::new(app, get("menu_insert"))
        .items(&[
            &MenuItemBuilder::with_id("insert-link", get("insert_link"))
                .accelerator("CmdOrCtrl+K")
                .build(app)?,
            // No keyboard accelerator: Cmd+Shift+I collides with Tiptap
            // italic (shift-letter normalization) and Cmd+Alt+I is the
            // universal browser DevTools shortcut. Menu click + drag-drop
            // + clipboard paste cover the use case.
            &MenuItemBuilder::with_id("insert-image", get("insert_image")).build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("insert-code-block", get("insert_code_block")).build(app)?,
            &MenuItemBuilder::with_id("insert-table", get("insert_table")).build(app)?,
            &MenuItemBuilder::with_id("insert-hr", get("insert_hr")).build(app)?,
        ])
        .build()?;

    let format_menu = SubmenuBuilder::new(app, get("menu_format"))
        .items(&[
            &MenuItemBuilder::with_id("format-bold", get("format_bold"))
                .accelerator("CmdOrCtrl+B")
                .build(app)?,
            &MenuItemBuilder::with_id("format-italic", get("format_italic"))
                .accelerator("CmdOrCtrl+I")
                .build(app)?,
            // Tiptap's Strike extension binds Mod+Shift+S natively; declare
            // the accelerator on the menu item so the macOS menu bar shows it.
            &MenuItemBuilder::with_id("format-strike", get("format_strikethrough"))
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?,
            &MenuItemBuilder::with_id("format-code", get("format_inline_code"))
                .accelerator("CmdOrCtrl+E")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            // Tiptap's Heading extension binds Mod+Alt+1..6 natively; declare
            // the accelerators so they appear in the macOS menu bar.
            &MenuItemBuilder::with_id("format-heading-1", get("format_heading_1"))
                .accelerator("CmdOrCtrl+Alt+1")
                .build(app)?,
            &MenuItemBuilder::with_id("format-heading-2", get("format_heading_2"))
                .accelerator("CmdOrCtrl+Alt+2")
                .build(app)?,
            &MenuItemBuilder::with_id("format-heading-3", get("format_heading_3"))
                .accelerator("CmdOrCtrl+Alt+3")
                .build(app)?,
            &MenuItemBuilder::with_id("format-heading-4", get("format_heading_4"))
                .accelerator("CmdOrCtrl+Alt+4")
                .build(app)?,
            &MenuItemBuilder::with_id("format-heading-5", get("format_heading_5"))
                .accelerator("CmdOrCtrl+Alt+5")
                .build(app)?,
            &MenuItemBuilder::with_id("format-heading-6", get("format_heading_6"))
                .accelerator("CmdOrCtrl+Alt+6")
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("format-blockquote", get("format_blockquote")).build(app)?,
            &MenuItemBuilder::with_id("format-bullet-list", get("format_bullet_list"))
                .build(app)?,
            &MenuItemBuilder::with_id("format-ordered-list", get("format_ordered_list"))
                .build(app)?,
            &MenuItemBuilder::with_id("format-task-list", get("format_task_list")).build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("format-markdown", get("format_markdown")).build(app)?,
        ])
        .build()?;

    let view_menu = SubmenuBuilder::new(app, get("menu_view"))
        .items(&[
            &CheckMenuItemBuilder::with_id("toggle-sidebar", get("view_toggle_sidebar"))
                .accelerator("CmdOrCtrl+Shift+L")
                .checked(sidebar_checked)
                .build(app)?,
            &CheckMenuItemBuilder::with_id("toggle-properties", get("view_toggle_properties"))
                .accelerator("CmdOrCtrl+Shift+P")
                .checked(properties_checked)
                .build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("zen-mode", get("view_zen_mode"))
                .accelerator("Ctrl+Cmd+Z")
                .build(app)?,
            &MenuItemBuilder::with_id("typewriter-mode", get("view_typewriter_mode")).build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("toggle-spell-check", get("view_toggle_spell_check"))
                .build(app)?,
        ])
        .build()?;

    let window_menu = SubmenuBuilder::new(app, get("menu_window"))
        .items(&[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ])
        .build()?;

    let help_menu = SubmenuBuilder::new(app, get("menu_help"))
        .items(&[
            &MenuItemBuilder::with_id("check-updates", get("help_check_updates")).build(app)?,
            &PredefinedMenuItem::separator(app)?,
            // No accelerator here: the `?` global keyboard handler in
            // useKeyboardShortcuts already opens the same overlay and
            // guards against input-focus, which a menu accelerator wouldn't.
            &MenuItemBuilder::with_id("help-shortcuts", get("help_shortcuts")).build(app)?,
            &MenuItemBuilder::with_id("help-docs", get("help_docs")).build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItemBuilder::with_id("help-issues", get("help_issues")).build(app)?,
        ])
        .build()?;

    tauri::menu::Menu::with_items(
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
    )
}

pub(crate) fn initial_menu_labels() -> HashMap<String, String> {
    const EN: &str = include_str!("../../src/locales/en.json");
    const ZH_CN: &str = include_str!("../../src/locales/zh-CN.json");

    let locale = sys_locale::get_locale().unwrap_or_default();
    let json_str = if locale.starts_with("zh") { ZH_CN } else { EN };

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) else {
        return default_menu_labels();
    };
    let Some(menu) = parsed.get("menu").and_then(|m| m.as_object()) else {
        return default_menu_labels();
    };
    menu.iter()
        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
        .collect()
}

pub(crate) fn default_menu_labels() -> HashMap<String, String> {
    [
        ("menu_file", "File"),
        ("menu_new", "New"),
        ("menu_edit", "Edit"),
        ("menu_insert", "Insert"),
        ("menu_format", "Format"),
        ("menu_view", "View"),
        ("menu_git", "Git"),
        ("menu_window", "Window"),
        ("menu_help", "Help"),
        ("about_item", "About Ovid"),
        ("about_title", "About Ovid"),
        ("about_body", "A minimalist desktop Markdown editor\nfor Amytis workspaces."),
        ("file_preferences", "Settings\u{2026}"),
        ("file_new_post", "New Post"),
        ("file_new_flow", "New Flow"),
        ("file_new_note", "New Note"),
        ("file_new_series", "New Series"),
        ("file_new_book", "New Book"),
        ("file_new_page", "New Page"),
        ("file_today_flow", "Today's Flow"),
        ("file_open_workspace", "Open Workspace\u{2026}"),
        ("file_switch_workspace", "Switch Workspace\u{2026}"),
        ("file_save", "Save"),
        ("file_close_file", "Close File"),
        ("file_wechat_copy", "Copy for WeChat"),
        ("file_wechat_publish", "Publish to WeChat\u{2026}"),
        ("edit_find_in_workspace", "Find in Workspace\u{2026}"),
        ("edit_find", "Find\u{2026}"),
        ("edit_find_replace", "Find & Replace\u{2026}"),
        ("edit_open_quickly", "Open Quickly\u{2026}"),
        ("insert_link", "Link\u{2026}"),
        ("insert_image", "Image\u{2026}"),
        ("insert_code_block", "Code Block"),
        ("insert_table", "Table"),
        ("insert_hr", "Horizontal Rule"),
        ("format_bold", "Bold"),
        ("format_italic", "Italic"),
        ("format_strikethrough", "Strikethrough"),
        ("format_inline_code", "Inline Code"),
        ("format_heading_1", "Heading 1"),
        ("format_heading_2", "Heading 2"),
        ("format_heading_3", "Heading 3"),
        ("format_heading_4", "Heading 4"),
        ("format_heading_5", "Heading 5"),
        ("format_heading_6", "Heading 6"),
        ("format_blockquote", "Blockquote"),
        ("format_bullet_list", "Bullet List"),
        ("format_ordered_list", "Numbered List"),
        ("format_task_list", "Task List"),
        ("format_markdown", "Format Markdown"),
        ("view_toggle_sidebar", "Toggle Sidebar"),
        ("view_toggle_properties", "Toggle Properties Panel"),
        ("view_zen_mode", "Zen Mode"),
        ("view_typewriter_mode", "Typewriter Mode"),
        ("view_toggle_spell_check", "Toggle Spell Check"),
        ("git_commit", "Commit Changes\u{2026}"),
        ("git_switch_branch", "Switch Branch\u{2026}"),
        ("git_new_branch", "New Branch\u{2026}"),
        ("git_open_remote", "Open Remote"),
        ("git_copy_remote_url", "Copy Remote URL"),
        ("git_push", "Push"),
        ("git_pull", "Pull"),
        ("git_fetch", "Fetch"),
        ("git_pull_success", "Pulled latest changes"),
        ("git_fetch_success", "Fetched remote updates"),
        ("file_wechat_copy_success", "Copied for WeChat"),
        ("file_wechat_copy_no_content", "No content to copy"),
        (
            "file_wechat_copy_math_warning",
            "Copied for WeChat (math blocks removed \u{2014} WeChat cannot render LaTeX)",
        ),
        ("file_wechat_copy_failed", "Failed to copy for WeChat: {{message}}"),
        ("help_check_updates", "Check for Updates\u{2026}"),
        ("help_shortcuts", "Keyboard Shortcuts"),
        ("help_docs", "Ovid Documentation"),
        ("help_issues", "Report an Issue\u{2026}"),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect()
}

#[tauri::command]
pub(crate) fn set_menu_language(
    app: tauri::AppHandle,
    labels: HashMap<String, String>,
    about_state: State<'_, AboutState>,
    view_state: State<'_, ViewToggleState>,
) -> Result<(), String> {
    // Update stored about dialog strings for the non-macOS handler.
    if let Some(title) = labels.get("about_title") {
        *about_state.title.lock().map_err(|e| e.to_string())? = title.clone();
    }
    if let Some(body) = labels.get("about_body") {
        *about_state.body_template.lock().map_err(|e| e.to_string())? = body.clone();
    }

    let sidebar_checked = *view_state.sidebar_visible.lock().map_err(|e| e.to_string())?;
    let properties_checked = *view_state.properties_open.lock().map_err(|e| e.to_string())?;
    let menu =
        build_app_menu(&app, &labels, sidebar_checked, properties_checked).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

// Updates the check state of one of the View menu's checkable items
// (toggle-sidebar / toggle-properties) and remembers the new value so
// language-change menu rebuilds preserve it.
#[tauri::command]
pub(crate) fn set_menu_checked(
    app: tauri::AppHandle,
    id: String,
    checked: bool,
    view_state: State<'_, ViewToggleState>,
) -> Result<(), String> {
    match id.as_str() {
        "toggle-sidebar" => {
            *view_state.sidebar_visible.lock().map_err(|e| e.to_string())? = checked;
        }
        "toggle-properties" => {
            *view_state.properties_open.lock().map_err(|e| e.to_string())? = checked;
        }
        _ => return Err(format!("unknown checkable menu id: {id}")),
    }
    if let Some(menu) = app.menu() {
        if let Some(MenuItemKind::Check(item)) = menu.get(&id) {
            item.set_checked(checked).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::default_menu_labels;
    use std::collections::HashSet;

    /// Rust side of the cross-language menu contract: every key the locale
    /// JSON declares under `menu.*` must have a Rust fallback in
    /// `default_menu_labels()`. The TS side (`MENU_KEYS` ↔ locale) is
    /// guarded by `src/lib/i18n.test.ts`; together the two tests stop a
    /// menu key from being added in only one language at a time.
    #[test]
    fn default_menu_labels_covers_every_locale_menu_key() {
        const EN: &str = include_str!("../../src/locales/en.json");
        let en: serde_json::Value = serde_json::from_str(EN).expect("en.json is valid JSON");
        let locale_menu = en
            .get("menu")
            .and_then(|m| m.as_object())
            .expect("en.json must contain a `menu` object");

        let locale_keys: HashSet<&str> = locale_menu.keys().map(String::as_str).collect();
        let default_keys: HashSet<String> = default_menu_labels().keys().cloned().collect();

        let missing: Vec<&str> = locale_keys
            .iter()
            .copied()
            .filter(|k| !default_keys.contains(*k))
            .collect();
        assert!(
            missing.is_empty(),
            "default_menu_labels() is missing fallback for locale menu key(s): {missing:?}"
        );
    }
}
