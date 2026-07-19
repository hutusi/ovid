use std::collections::BTreeSet;
use std::path::{Component, Path};

use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{Emitter, State};
use ts_rs::TS;

use crate::paths::{is_markdown_path, should_skip_walk_entry, to_slash};
use crate::state::WorkspaceState;

pub(crate) const WORKSPACE_FS_CHANGE_EVENT: &str = "workspace-fs-change";

#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/commands/generated/")]
pub(crate) struct WorkspaceFsChange {
    pub(crate) workspace_root: String,
    pub(crate) paths: Vec<String>,
    pub(crate) needs_rescan: bool,
}

fn path_is_visible_to_revision(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    relative.components().all(|component| match component {
        Component::Normal(name) => {
            let name = name.to_string_lossy();
            !should_skip_walk_entry(&name, false, false)
        }
        Component::CurDir => true,
        Component::ParentDir | Component::RootDir | Component::Prefix(_) => false,
    })
}

fn event_can_change_markdown_tree(event: &Event, path: &Path) -> bool {
    match event.kind {
        EventKind::Access(_) => false,
        EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Metadata(_)) => is_markdown_path(path),
        EventKind::Modify(ModifyKind::Name(RenameMode::Any | RenameMode::Both)) => true,
        // Creating/removing a concrete *file* only affects the markdown tree
        // when that file is markdown — a non-markdown asset or an editor swap
        // file shouldn't force a full revision recompute. Directory and
        // ambiguous kinds (macOS often reports `Create(Any)`) stay unconditional
        // candidates so a new/removed folder still triggers a walk.
        EventKind::Create(notify::event::CreateKind::File)
        | EventKind::Remove(notify::event::RemoveKind::File) => is_markdown_path(path),
        EventKind::Modify(ModifyKind::Name(_))
        | EventKind::Modify(ModifyKind::Any | ModifyKind::Other)
        | EventKind::Create(_)
        | EventKind::Remove(_)
        | EventKind::Any
        | EventKind::Other => true,
    }
}

fn rebase_change_paths(change: &mut WorkspaceFsChange, canonical_root: &Path, opened_root: &Path) {
    change.paths = change
        .paths
        .iter()
        .map(|path| {
            Path::new(path)
                .strip_prefix(canonical_root)
                .map(|relative| to_slash(&opened_root.join(relative)))
                .unwrap_or_else(|_| path.clone())
        })
        .collect();
}

pub(crate) fn workspace_change_for_event(
    workspace_root: &Path,
    event: &Event,
) -> Option<WorkspaceFsChange> {
    let needs_rescan = event.need_rescan();
    let mut paths = BTreeSet::new();
    for path in &event.paths {
        if !path_is_visible_to_revision(workspace_root, path)
            || !event_can_change_markdown_tree(event, path)
        {
            continue;
        }
        paths.insert(to_slash(path));
    }
    if paths.is_empty() && !needs_rescan {
        return None;
    }
    Some(WorkspaceFsChange {
        workspace_root: to_slash(workspace_root),
        paths: paths.into_iter().collect(),
        needs_rescan,
    })
}

/// Replace the active native watcher. Failure is non-fatal because the
/// frontend retains a slow revision scan as a correctness fallback.
pub(crate) fn restart_workspace_watcher(
    workspace_root: &Path,
    app: &tauri::AppHandle,
    state: &State<'_, WorkspaceState>,
) -> Result<(), String> {
    let watched_root = std::fs::canonicalize(workspace_root).map_err(|error| error.to_string())?;
    let callback_root = watched_root.clone();
    let opened_root = workspace_root.to_path_buf();
    let payload_root = to_slash(&opened_root);
    let callback_app = app.clone();
    let mut watcher =
        notify::recommended_watcher(move |result: notify::Result<Event>| match result {
            Ok(event) => {
                if let Some(mut change) = workspace_change_for_event(&callback_root, &event) {
                    rebase_change_paths(&mut change, &callback_root, &opened_root);
                    change.workspace_root.clone_from(&payload_root);
                    if let Err(error) = callback_app.emit(WORKSPACE_FS_CHANGE_EVENT, change) {
                        eprintln!("Failed to emit workspace filesystem change: {error}");
                    }
                }
            }
            Err(error) => eprintln!("Workspace filesystem watcher error: {error}"),
        })
        .map_err(|error| error.to_string())?;
    watcher
        .watch(&watched_root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    *state
        .workspace_watcher
        .lock()
        .map_err(|error| error.to_string())? = Some(watcher);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, RemoveKind};
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn event(kind: EventKind, paths: Vec<PathBuf>) -> Event {
        let mut event = Event::new(kind);
        event.paths = paths;
        event
    }

    #[test]
    fn emits_for_markdown_data_changes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("notes").join("hello.md");
        let change = workspace_change_for_event(
            dir.path(),
            &event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                vec![path.clone()],
            ),
        )
        .unwrap();

        assert_eq!(change.paths, vec![to_slash(&path)]);
        assert_eq!(change.workspace_root, to_slash(dir.path()));
    }

    #[test]
    fn ignores_non_markdown_data_and_noise_paths() {
        let dir = TempDir::new().unwrap();
        let image = dir.path().join("image.png");
        let generated = dir.path().join("node_modules").join("README.md");
        let hidden = dir.path().join(".hidden").join("note.md");

        assert!(workspace_change_for_event(
            dir.path(),
            &event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                vec![image],
            ),
        )
        .is_none());
        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Create(CreateKind::Any), vec![generated, hidden]),
        )
        .is_none());
    }

    #[test]
    fn emits_for_directory_create_remove_and_rename_candidates() {
        let dir = TempDir::new().unwrap();
        let created = dir.path().join("notes");
        let removed = dir.path().join("archive");
        let renamed = dir.path().join("drafts");

        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Create(CreateKind::Folder), vec![created]),
        )
        .is_some());
        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Remove(RemoveKind::Folder), vec![removed]),
        )
        .is_some());
        assert!(workspace_change_for_event(
            dir.path(),
            &event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                vec![renamed],
            ),
        )
        .is_some());
    }

    #[test]
    fn ignores_non_markdown_file_create_remove_but_keeps_markdown() {
        let dir = TempDir::new().unwrap();
        let asset = dir.path().join("photo.png");
        let note = dir.path().join("notes").join("hello.md");

        // A concrete non-markdown file create/remove must not force a recompute.
        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Create(CreateKind::File), vec![asset.clone()]),
        )
        .is_none());
        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Remove(RemoveKind::File), vec![asset]),
        )
        .is_none());

        // A markdown file create still counts.
        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Create(CreateKind::File), vec![note]),
        )
        .is_some());
    }

    #[test]
    fn rejects_paths_outside_the_watched_workspace() {
        let dir = TempDir::new().unwrap();
        let outside = dir.path().parent().unwrap().join("outside.md");
        assert!(workspace_change_for_event(
            dir.path(),
            &event(EventKind::Create(CreateKind::File), vec![outside]),
        )
        .is_none());
    }

    #[test]
    fn rebases_canonical_event_paths_to_the_opened_workspace_path() {
        let canonical_root = Path::new("/canonical/workspace");
        let opened_root = Path::new("/opened/through-link");
        let mut change = WorkspaceFsChange {
            workspace_root: to_slash(canonical_root),
            paths: vec![to_slash(&canonical_root.join("notes").join("hello.md"))],
            needs_rescan: false,
        };

        rebase_change_paths(&mut change, canonical_root, opened_root);

        assert_eq!(
            change.paths,
            vec![to_slash(&opened_root.join("notes").join("hello.md"))]
        );
    }
}
