# Roadmap

Ovid is a writing and knowledge tool for people who take their words seriously. It serves three overlapping audiences: **writers and bloggers** who want a calm, focused environment for long-form work; **knowledge workers** who think and organize in interconnected notes; and **Amytis publishers** who want to manage their site content without leaving the editor. Deep Amytis integration is first-class, but Ovid is equally at home for anyone who writes in Markdown.

This roadmap is organized into deliberate phases — each phase must feel complete and polished before the next begins. Features are tagged by primary audience: 🖊 Writer · 🧠 Knowledge · 📢 Publisher.

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
31. ✅ **Focus / Zen mode** (`Ctrl+Cmd+Z`) — hide sidebar, properties panel, status bar; center editor with generous margins; `Esc` to exit
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

## ✅ Remediation — Known Issues from Testing
> Goal: fix real gaps discovered during use before adding new features. These are not new capabilities — they are corrections to the existing experience that make the app feel complete and trustworthy.

A. ✅ **Native app menu** — full native menu bar (Ovid / File / Edit / Insert / Format / View / Window / Help) built via Tauri `tauri::menu`; Insert and Format items emit `menu-action` events routed to the editor; app-level actions (File, View) routed to App.tsx handlers; Edit uses OS-native predefined Undo/Redo/Cut/Copy/Paste items; Help links opened in Rust without emitting to the frontend

B. ✅ **Keyboard shortcut conflicts** — zen mode remapped from `Cmd+Shift+Z` to `Ctrl+Cmd+Z`; Redo (`Cmd+Shift+Z`) is now fully functional inside the editor; all other shortcuts audited

C. ✅ **Link management** — `Cmd+K` opens a link dialog (URL input + Apply / Remove); pre-fills the URL when the cursor is on an existing link; uses the already-loaded Link extension

D. ✅ **Inline code and code block language** — `Cmd+E` intercepted at window level to prevent WKWebView consuming it; code block NodeView shows a language label in the top-right, clicking opens a dropdown of common languages

E. ✅ **Sidebar content type differentiation** — Rust reads the `type:` frontmatter field alongside `title` and `draft`; sidebar shows a content-type icon per file (post, flow, series, book, page, note); gracefully absent (generic file icon) when the field is not set

---

## Phase 8 — Editing Power
> Goal: close the gap between Ovid and a professional writing tool for in-document editing. Serves all audiences — every serious writer needs these. 🖊 🧠 📢

40. **Find & replace** (`Cmd+H`) — search within the current file; highlight all matches simultaneously; navigate with `Enter` / `Shift+Enter`; replace one or all; optional regex mode; closes with `Esc`
41. **Tables** — insert and edit Markdown tables inline via Tiptap table extension; `Tab` to advance cells, `Shift+Tab` to go back; add/remove rows and columns via context menu; serialized as GFM table syntax
42. **Footnotes** — `[^1]` inline syntax rendered as superscript number; footnote definitions collected at bottom of editor view; exported as standard Markdown; click footnote to jump to definition
43. **Paragraph focus mode** — dim all paragraphs except the one under the cursor; adjustable dim level; pairs naturally with zen mode and typewriter mode; toggle from status bar
44. **Text folding** — collapse / expand sections by heading level; click chevron next to any heading; folded state persisted per file; useful for long documents and notes with many sections
45. **Math / LaTeX** — inline (`$...$`) and block (`$$...$$`) expressions rendered via KaTeX; display-only (raw LaTeX preserved in the markdown); syntax-error indicator on invalid expressions
46. **Bubble / formatting menu** — floating toolbar that appears above any text selection (via Tiptap BubbleMenu extension); buttons for Bold, Italic, Strikethrough, Inline code, Link (`Cmd+K`), and heading level; eliminates the need to memorize formatting shortcuts; similar to Notion's selection menu; disappears on click-away or `Esc`
47. **Table of contents** — auto-generate a TOC from H1/H2/H3 headings; insert at cursor as a markdown list, or show as a floating panel; updates live; configurable depth
48. **Private annotations** — inline editorial comments stored in `.ovid/annotations/` alongside the file; never written into the markdown; visible only in Ovid; useful for revision notes, TODOs, and self-review

---

## Phase 9 — Daily Writing & Habits
> Goal: support the routines and rituals that make writing a sustainable, daily practice. 🖊 🧠

49. **Daily notes** (`Cmd+Shift+D`) — create or open today's note in a configurable folder (e.g. `journal/`); auto-named by date (e.g. `2026-03-15.md`); uses a user-defined template; quick-capture without switching context
50. **Focus timer** — configurable writing timer visible in the status bar; Pomodoro-style (default 25 min) or freeform; gentle visual indicator when time is up; logs completed sessions; pairs with word count goal
51. **Writing streak** — track consecutive days with at least N words written (user-configurable threshold); subtle streak indicator in the status bar; no gamification — just awareness of momentum
52. **Ambient sounds** — optional background audio (rain, café, white noise, birdsong); volume slider; choice persisted across sessions; for writers who need an acoustic focus environment
53. **Starred files** — star any file from the sidebar or via shortcut; starred files appear in a pinned section at the top of the sidebar and the empty state; persisted per workspace; quick access to most-used notes and posts
54. **Reading mode** (`Cmd+Shift+R`) — distraction-free read-only view of the current file; no cursor, no editing affordances; clean typography with generous margins; useful for proofreading; `Esc` to return to editing
55. **Quick capture** (menu bar) — system tray icon opens a minimal floating input for a quick note or thought; saved to a configurable inbox file or today's daily note; available even when the main window is closed

---

## Phase 10 — Document Intelligence
> Goal: give writers and bloggers meaningful insight into their own writing and long-term output. 🖊 📢

56. **Reading time** — estimated reading time shown in the status bar alongside word count; calculated at ~200 wpm; updates live; useful for bloggers calibrating post length
57. **Writing stats panel** — sentence count, average sentence length, paragraph count, Flesch–Kincaid reading ease score; shown in a toggleable panel; never intrusive; helps writers identify dense or over-long prose
58. **Grammar & style check** — integration with LanguageTool (local binary or self-hosted API); underlines grammar and style issues separately from spell check; click to see suggestion and accept or dismiss; never blocks writing
59. **Local snapshots** — automatic version history saved to `.ovid/snapshots/` every 5 minutes and on each manual save; independent of git; browse past versions in a timeline panel; one-click restore; soft safety net for every file
60. **Long-term writing analytics** — words per day/week/month chart; most productive hours heatmap; file growth over time; all stored locally in `.ovid/analytics/`; no external service; helps writers understand their own patterns
61. **Workspace-wide find & replace** — Rust-powered search and replace across all files; preview every match in context before committing; confirm per-file or all at once; regex support; essential for renaming terms or fixing repeated errors across a large workspace

---

## Phase 11 — Knowledge Graph
> Goal: turn a collection of files into a living, connected body of knowledge. Core to the knowledge management use case. 🧠 🖊

62. **Wikilinks** (`[[filename]]`) — type `[[` to open an inline autocomplete picker; resolves by filename or frontmatter `title`; renders as a styled clickable link; `Cmd+Click` to navigate; serialized as a standard Markdown link on disk so files remain portable
63. **Transclusion** (`![[filename]]`) — embed the full content of one file inside another, rendered inline in the editor; the source file on disk is unchanged; useful for reusable content blocks, shared reference notes, and blog series intros; updates live when the source changes
64. **Backlinks panel** — collapsible panel below the editor listing every file that links to the current file; shows the linking sentence for context; click to navigate; updates on save; the foundation of a personal knowledge graph
65. **Outline view** — H1/H2/H3 heading tree in a sidebar panel; click any heading to jump to it; indented to reflect nesting; updates live as you type; equally useful for long essays and deeply nested notes
66. **Tags browser** — sidebar panel listing all unique frontmatter `tags` across the workspace with file counts; click a tag to filter the file list; Shift+click for multi-tag filtering; search within tags; useful for knowledge workers with hundreds of tagged notes
67. **Task / checklist view** — aggregate all Markdown checkboxes (` - [ ] `) across the workspace into a unified task panel; filter by file, tag, or completion status; check off a task and the change is saved back to the source file
68. **Graph view** — visual canvas of file connections via wikilinks and Markdown links; nodes are files, edges are links; zoom and pan; node size reflects link count; click a node to open the file; filter by tag or content type; graceful no-op when no links exist
69. **Calendar view** — month grid showing files by frontmatter `date`; click a date to open the file; dots indicate multiple files on the same date; navigate months with arrow keys; useful for bloggers planning posts and knowledge workers reviewing notes by time

---

## Phase 12 — Discovery & Organization
> Goal: find anything and keep everything organized at scale, no matter how large the workspace grows. 🧠 📢

70. **Advanced search operators** — filter syntax in the search panel: `tag:writing`, `is:draft`, `is:published`, `date:>2024-01-01`, `type:post`, `words:>500`; operators autocomplete as you type; stack multiple filters; powered by Rust; essential for knowledge workers with large note collections
71. **Content series & collections** — group related files into a named series via frontmatter (`series: "Getting Started"`); sidebar shows series grouping with progress (e.g. 3/5 published); series panel shows reading order and publication status; useful for bloggers and course creators
72. **Pinned searches** — save frequently-used search queries as named bookmarks; shown at the top of the search panel; reorderable; persisted per workspace; e.g. "All unfinished drafts" or "Notes tagged #research"
73. **File labels** — assign color labels to files from the sidebar context menu; visible as a colored dot next to the filename; filter sidebar by label; stored in `.ovid/labels.json` — never bleeds into frontmatter; purely organizational
74. **Duplicate & move** — right-click any file to duplicate it (copy with a new name) or move it to a different folder without drag-and-drop; Wikilinks and Markdown links to the moved file optionally updated automatically across the workspace
75. **Sitemap view** — read-only panel showing all workspace content organized by content type, with word counts, draft/published status, and last-modified date; useful for auditing coverage, finding orphaned notes, and planning what to write next

---

## Phase 13 — Publishing Pipeline
> Goal: the full publish workflow — from first draft to live site — without leaving the app. Primarily for Amytis publishers and bloggers. 📢

76. **In-app preview** (`Cmd+Shift+V`) — render the current file as it would appear on the published site; split-pane or overlay toggle; uses the site's CSS from the workspace if available; live-updates as you type; graceful fallback to plain HTML for non-Amytis workspaces
77. **Build & deploy** — trigger `amytis build` and `amytis deploy` from the command palette; stream stdout/stderr to a collapsible log panel; show success / error status with elapsed time; cancel in-progress builds; configurable build command for non-Amytis static site generators
78. **Git history per file** — browse the full commit history for the current file in a timeline panel; view file content at any past commit; diff view against current version; one-click restore to any version; gracefully hidden when not a git repo
79. **Branch management** — create, switch, and delete branches from within the app; current branch shown in the status bar; visual indicator when ahead/behind remote; fetch and pull without leaving the editor
80. **Draft scheduling** — set a future `date` in the properties panel and keep `draft: true`; Ovid shows a "scheduled" badge; optionally auto-toggles `draft: false` on the scheduled date and triggers a commit; integrates with the calendar view
81. **SEO panel** — dedicated collapsible panel for SEO frontmatter: `description`, `og:image`, `og:title`, `canonical`; character counter for `description` (optimal 120–160 chars); live preview of how the entry looks in a search result snippet
82. **Content calendar** — editorial planning view; month and week grid showing scheduled, published, and draft posts; drag a post to a new date to update its frontmatter `date`; color-coded by content type; the control center for a busy blogger

---

## Phase 14 — Multi-file & Workspace Power
> Goal: the app should handle large, complex workspaces — many files, many sessions, many collaborators. 🖊 🧠 📢

83. **File watcher** — detect when the open file is modified externally (by another editor, a script, or a sync service); prompt to reload or keep the in-memory version; uses the Rust `notify` crate with no polling; prevents silent data loss
84. **Tabs** — open multiple files simultaneously in a tab bar above the editor; `Cmd+T` new tab, `Cmd+W` closes the current tab; drag to reorder tabs; unsaved indicator per tab; restore the previous tab session on relaunch
85. **Split view** (`Cmd+Shift+\`) — divide the editor area into two independent panes, each with its own file, scroll position, and cursor; useful for referencing a note while writing a post; resizable divider; each pane supports all editor features
86. **Bulk file operations** — multi-select files in the sidebar with `Shift+Click` / `Cmd+Click`; batch delete (to Trash), move to folder, or add/remove frontmatter tags; confirmation dialog for destructive actions; progress indicator for large batches
87. **Asset manager** — dedicated sidebar panel for browsing `assets/`; thumbnail grid for images; click to insert at cursor; drag into editor; shows file name, dimensions, and size; delete unused assets; configurable asset directory per workspace in settings
88. **User-defined templates** — create and save a file as a template from the sidebar context menu; template variables (`{{date}}`, `{{title}}`, `{{slug}}`); available in the new file dialog alongside Amytis content types; stored in `.ovid/templates/`

---

## Phase 15 — Rich Content
> Goal: support the full range of content types that writers, bloggers, and technical authors create. 🖊 📢

89. **Mermaid diagrams** — fenced ` ```mermaid ` blocks rendered as live diagrams (flowchart, sequence, Gantt, ER, pie, etc.); edit source and preview updates inline; exported as raw Mermaid fences so the file remains valid Markdown
90. **Image optimization** — on drag-drop, offer to compress images before saving to `assets/`; show original vs compressed file size and dimensions; configurable quality slider (default 85%); skips SVG and already-small images
91. **Audio / video attachments** — drag audio or video files into the editor; copies to `assets/`; inserts an HTML5 `<audio>` or `<video>` tag; inline playback controls in the editor; useful for podcasters and video bloggers
92. **Embed previews** — paste a YouTube, Vimeo, or Twitter/X URL on its own line to get an inline preview card in the editor; stored as a plain Markdown link on disk — no external dependency in the saved file; display-only
93. **Scratchpad** — persistent side panel (`Cmd+Shift+S`) for quick notes not tied to any file; survives across sessions and workspace switches; supports basic Markdown; never saved into the workspace tree; a private thinking space alongside any file

---

## Phase 16 — Customization & Export
> Goal: let every user shape the tool to their own habits, aesthetic, and output format. 🖊 🧠 📢

94. **Export** — export the current file as HTML (with site CSS), PDF (via headless WebView print), or DOCX (via pandoc if available); batch export multiple files; export dialog with format, destination, and styling options; useful for sharing drafts with non-technical collaborators
95. **Custom keyboard shortcuts** — remap any named action from a settings panel; persisted in `.ovid/keybindings.json`; conflict detection with visual warning; reset individual or all shortcuts to defaults
96. **Custom themes** — built-in preset color schemes beyond light/dark (e.g. Solarized, Nord, Rosé Pine, Catppuccin); import a custom theme JSON; live preview before applying; export the current theme to share with others
97. **Custom editor CSS** — inject user-authored CSS scoped to the editor pane; persisted in `.ovid/editor.css`; changes applied live without restart; "reset to default" option; for writers who want precise typographic control beyond the font settings
98. **Snippets / text expansion** — define trigger words (e.g. `;date`, `;intro`) that expand to full text or frontmatter fragments; manage snippets from a settings panel; triggers fire on `Space` or `Tab`; supports template variables
99. **Command palette** (`Cmd+Shift+K`) — search and trigger any app action by name; keyboard-navigable with shortcut hints; accepts file names to open; extensible by plugins; the single entry point for power users who prefer keys over menus
100. **Settings UI** — persistent settings panel organized by section (editor, workspace, git, snippets, shortcuts, themes, plugins); import/export all settings as a single JSON file for portability across machines or sharing with a team

---

## Phase 17 — Extensibility & Platform
> Goal: open Ovid to the wider ecosystem and make it a platform, not just an app. 🧠 📢

101. **Plugin system** — JavaScript plugins loaded from `.ovid/plugins/`; plugins can register commands, add sidebar panels, and contribute Tiptap editor extensions; sandboxed with a documented public API; managed and toggled from the settings UI; enables community-built integrations
102. **Multiple OS windows** — open different workspaces in separate native OS windows simultaneously (`Cmd+Shift+N`); each window is fully independent with its own state; useful for referencing one workspace while writing in another
103. **Import from other tools** — one-time migration wizard for Obsidian vaults, Bear exports (`.bearbak`), Ulysses sheets, and Notion Markdown exports; maps internal link formats, tags, and metadata to standard Markdown frontmatter; preserves folder structure
104. **Local API / CLI** — expose a local HTTP API and CLI for scripting and automation: `ovid open <path>`, `ovid new <title>`, `ovid search <query>`, `ovid export <path>`; useful for integrating Ovid into custom workflows, Alfred/Raycast, or shell scripts
105. **Cloud backup** — optional automatic backup of the workspace to iCloud Drive, Dropbox, or any configured directory; configurable frequency (on save, hourly, daily); versioned backups; separate from git; restore from the settings UI; a safety net for users without git
