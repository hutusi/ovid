# Roadmap

## Completed

1. ✅ **Workspace open** — Tauri folder picker dialog; walks file tree, detects Amytis `content/` subdir
2. ✅ **File read/write** — load `.md` into editor on select; debounced atomic save (750ms); frontmatter preserved on disk
3. ✅ **Frontmatter parsing** — YAML parsed with `js-yaml`; stripped from editor view; shown in collapsible properties bar above editor
4. ✅ **Dark mode** — follows system preference (`prefers-color-scheme`); manual toggle in status bar; preference persisted in `localStorage`; flash-of-wrong-theme prevention via inline script
5. ✅ **Properties panel** — inline bar above editor showing title, date, tags, draft badge, and other fields; collapsible

## Planned

6. **Editable properties** — allow editing frontmatter fields directly in the properties panel; write changes back to disk
7. **Sidebar collapse** — toggle sidebar visibility to maximise writing space
8. **Keyboard shortcuts** — `Cmd+P` file switcher, `Cmd+Shift+P` toggle properties, `Cmd+\` toggle sidebar
9. **New file / rename / delete** — file management operations from the sidebar
10. **Git integration** — commit, push, pull via Rust backend; show dirty/staged status in sidebar
11. **Search** — full-text search across workspace files
12. **Image handling** — drag-and-drop images into editor; copy to workspace asset folder; relative path insertion
