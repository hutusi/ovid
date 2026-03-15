# Roadmap

Ovid App is purpose-built for content creators working in Amytis workspaces. This roadmap is organized into deliberate phases — each phase must feel complete and polished before the next begins.

---

## Completed

1. ✅ **Workspace open** — Tauri folder picker; walks file tree, auto-detects Amytis `content/` subdir
2. ✅ **File read/write** — load `.md` into editor on select; debounced atomic save (750ms); frontmatter preserved verbatim
3. ✅ **Frontmatter parsing** — YAML parsed with `js-yaml`; stripped from editor view; shown in collapsible properties panel
4. ✅ **Dark mode** — follows system preference; manual toggle in status bar; persisted in `localStorage`; no flash-of-wrong-theme
5. ✅ **Properties panel** — inline bar above editor showing title, date, tags, draft badge; collapsible

---

## ✅ Phase 1 — Core UX Polish
> Goal: make what exists feel complete and intentional. No new features until these feel right.

6. ✅ **Sidebar collapse** (`Cmd+\`) — toggle sidebar visibility to maximize writing space; animate width; remember state across sessions
7. ✅ **Directory expand/collapse** — sidebar directories currently show all children always; add click-to-toggle with chevron; persist expanded state per workspace
8. ✅ **Keyboard shortcuts** — register global shortcuts:
   - `Cmd+\` — toggle sidebar
   - `Cmd+Shift+P` — toggle properties panel
   - `Cmd+S` — force-save immediately (bypass debounce)
   - `Cmd+W` — close current file (return to blank state)
9. ✅ **Save status indicator** — subtle dot in status bar: grey = saved, amber = unsaved; never intrusive
10. ✅ **Error notifications** — replace `console.error` with a brief toast (2s, bottom-center); never block writing
11. ✅ **Empty state** — when no workspace is open or no file selected, show a calm, intentional empty state (not a blank white box)

---

## ✅ Phase 2 — File Management
> Goal: a content creator should never need to leave the app to manage files.

12. ✅ **New file** (`Cmd+N`) — create a new `.md` file; prompt for filename; auto-insert Amytis frontmatter template (`title`, `date`, `draft: true`); open immediately in editor
13. ✅ **Rename file** (`F2` or double-click filename in sidebar) — inline rename; validates no duplicate names; updates open editor tab if renaming current file
14. ✅ **Delete file** — right-click context menu or keyboard shortcut; confirmation dialog; moves to system Trash (not permanent delete)
15. ✅ **Editable properties panel** — click any field to edit inline; writes changes back to frontmatter on disk verbatim; tab between fields; `Esc` to cancel; support adding new fields
16. ✅ **New folder** — create subdirectory from sidebar; useful for organizing Amytis content collections

---

## ✅ Phase 3 — Navigation & Discovery
> Goal: moving between files should be instant and effortless.

17. ✅ **Quick file switcher** (`Cmd+P`) — fuzzy search by filename and frontmatter `title`; keyboard-navigable; shows path for disambiguation; searches across entire workspace tree
18. ✅ **Recent files** — track last 10 opened files per workspace; show in empty state and at top of switcher; persisted in `localStorage`
19. ✅ **Sidebar title display** — show frontmatter `title` instead of filename in sidebar when available; fall back to filename; reduces visual noise of slugs
20. ✅ **Sidebar draft indicator** — dim files with `draft: true`; helps distinguish published vs in-progress content at a glance

---

## ✅ Phase 4 — Search
> Goal: find anything across the workspace instantly.

21. ✅ **Full-text search** (`Cmd+Shift+F`) — search panel replaces sidebar; queries run in Rust; results show filename, matched line with context; match highlighted in result
22. ✅ **Search result navigation** — click result or matched line to open file; match highlighted in result row
23. ✅ **Frontmatter search** — full file content searched (including frontmatter); finds by tag, draft status, date, or any field value

---

## ✅ Phase 5 — Amytis Integration
> Goal: seamlessly support the full Amytis publish workflow without leaving the app.

24. ✅ **Workspace validation** — on open, detect `site.config.ts`; parse content type schema if available; warn if workspace doesn't look like an Amytis project
25. ✅ **Content type templates** — if `site.config.ts` defines content types (e.g. `post`, `page`, `note`), offer type selection when creating new files; pre-fill frontmatter fields accordingly
26. ✅ **Git status indicators** — show per-file dirty/staged/untracked markers in sidebar; requires `git` on PATH; gracefully no-ops if not a git repo
27. ✅ **Commit & push** (`Cmd+Shift+G`) — simple commit dialog: auto-filled message (`Update: <title>`), branch name shown; push toggle; runs via Rust `git` subprocess
28. ✅ **Draft → publish flow** — one-click to toggle `draft: true/false` in properties panel with a clear "Publish" affordance; auto-commits if git integration is active

---

## ✅ Phase 6 — Rich Editing
> Goal: the editor should feel as capable as it is calm.

29. ✅ **Image handling** — drag-and-drop image into editor: copy to workspace `assets/` (or configured asset dir), insert relative markdown path; show inline preview
30. ✅ **Code block syntax highlighting** — syntax-highlighted code blocks in the editor (read-only highlight; doesn't affect saved markdown)
31. ✅ **Focus / Zen mode** (`Cmd+Shift+Z`) — hide sidebar, properties panel, status bar; center editor with generous margins; `Esc` to exit
32. ✅ **Typewriter mode** — keep the active line vertically centered as you type; reduces eye movement during long writing sessions
33. ✅ **Writing session stats** — track words written in current session (not total); show +N words added in status bar

---

## ✅ Phase 7 — Polish & Power
> Goal: the details that separate a good app from one people love.

34. ✅ **Workspace persistence** — remember last opened workspace; re-open automatically on launch (with user opt-out)
35. ✅ **Multiple workspaces** — switch between recently opened workspaces without going through the folder picker every time
36. ✅ **Customizable fonts** — let users choose editor font (serif / sans / mono) and size; persisted preference
37. ✅ **Spell check** — native OS spell check via Tauri webview; highlight misspellings without disrupting writing flow
38. ✅ **Word count goal** — set a session word count target; subtle progress indicator; no gamification, just awareness
39. ✅ **Link preview** — hover over a URL to see a preview tooltip after a short delay

---

## Phase 8 — Editing Power
> Goal: close the gap between Ovid and a professional writing tool for in-document editing.

40. **Find & replace** (`Cmd+H`) — search within the current file with optional replace; highlight all matches; navigate with `Enter` / `Shift+Enter`; plain text and regex modes
41. **Tables** — insert and edit Markdown tables inline; keyboard-navigable cells (`Tab` to advance); Tiptap table extension
42. **Footnotes** — inline footnote syntax (`[^1]`); rendered inline in the editor; exported as standard Markdown footnotes
43. **Paragraph focus mode** — dim all paragraphs except the one containing the cursor; toggle from status bar or shortcut; pairs with zen mode

---

## Phase 9 — Knowledge Graph
> Goal: turn Ovid from a file editor into a tool writers actually think in.

44. **Wikilinks** (`[[filename]]`) — type `[[` to open an autocomplete picker; resolves to the matching file in the workspace; renders as a styled inline link
45. **Backlinks panel** — collapsible panel below the editor listing all files that link to the current file; click to navigate
46. **Tags browser** — sidebar view listing all frontmatter `tags` values across the workspace; click a tag to filter the file list
47. **Calendar view** — browse files by frontmatter `date` in a month grid; click a date to open the file; useful for blog-style content

---

## Phase 10 — Publishing Pipeline
> Goal: complete the Amytis workflow without ever leaving the app.

48. **In-app preview** (`Cmd+Shift+V`) — render the current file as it would appear on the published Amytis site; uses the site's CSS if available
49. **Build & deploy** — trigger `amytis build` and `amytis deploy` from a command; stream output to a log panel; show success / error status
50. **Git history per file** — browse the commit history for the current file; view a past version; one-click restore
51. **Branch management** — create, switch, and delete branches from within the app; branch name shown in the status bar

---

## Phase 11 — Multi-file & Reliability
> Goal: the app should handle real workspaces at scale without friction.

52. **File watcher** — detect when the open file is modified externally; prompt to reload or keep the in-memory version
53. **Tabs** — open multiple files simultaneously in a tab bar above the editor; `Cmd+T` new tab, `Cmd+W` closes tab
54. **Drag to reorder** — drag files and folders in the sidebar to reorganize; writes the change to disk
55. **User-defined templates** — create and save custom frontmatter templates beyond Amytis content types; available in the new file dialog

---

## Phase 12 — Customization
> Goal: let power users make Ovid feel like their own.

56. **Export** — export the current file as HTML or PDF; copy as rich text for sharing drafts outside the workspace
57. **Custom keyboard shortcuts** — remap any shortcut from a settings panel; persisted in a local config file
58. **Custom themes** — choose from built-in color schemes beyond light/dark; support importing a theme file

