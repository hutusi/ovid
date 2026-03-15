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
> Goal: fix real gaps discovered during use before adding new features.

A. ✅ **Native app menu** — full native menu bar (File / Edit / Insert / Format / View / Window / Help); menu actions route to the editor and app-level handlers; Edit uses OS-native Undo/Redo/Cut/Copy/Paste

B. ✅ **Keyboard shortcut conflicts** — zen mode remapped to `Ctrl+Cmd+Z`; Redo (`Cmd+Shift+Z`) now works correctly inside the editor

C. ✅ **Link management** — `Cmd+K` opens a link dialog; pre-fills URL when cursor is on an existing link

D. ✅ **Inline code and code block language** — `Cmd+E` works correctly in the WebView; code blocks show a language picker

E. ✅ **Sidebar content type icons** — sidebar shows a content-type icon per file based on frontmatter `type:` field; falls back to a generic file icon

F. ✅ **Drop Radix UI** — Radix portal-based components broke in Tauri's WebView due to CSS variable scoping; replaced all modals and panels with plain CSS components using direct token references; removed unused Radix and shadcn packages

G. ✅ **Tailwind-first design tokens** — all color and font tokens moved into Tailwind `@theme` as the single source of truth; tokens renamed semantically; shadcn bridge layer removed

H. ✅ **Dialog accessibility** — shared `useFocusTrap` hook across all modals; focus trapped within dialog, restored on close; `aria-label` on all form inputs in the properties panel

---

## ✅ Phase 8 — Editing Power
> Goal: close the gap on the editing features writers actually miss. 🖊 🧠 📢

40. ✅ **Find & replace** (`Cmd+H`) — search within the current file; highlight all matches; navigate with `Enter` / `Shift+Enter`; replace one or all; `Esc` to close
41. ✅ **Tables** — insert and edit Markdown tables inline; `Tab` / `Shift+Tab` to move between cells; add/remove rows and columns; serialized as GFM syntax
42. ✅ **Text folding** — collapse / expand sections by heading level; chevron widget on each heading; essential for navigating long documents
43. ✅ **Math / LaTeX** — inline (`$...$`) and block (`$$...$$`) rendered via KaTeX; raw LaTeX preserved in the Markdown; syntax-error indicator on invalid expressions
44. ✅ **Bubble / formatting menu** — floating toolbar above any text selection; Bold, Italic, Strikethrough, Inline code, Link; disappears on click-away or `Esc`; does not replace keyboard shortcuts — complements them
45. ✅ **Typora-style inline editing** — when cursor enters a link, the raw Markdown syntax (`[text](url)`) is revealed in-place for editing; click `](url)` hint or `Cmd+K` to edit URL
46. ✅ **Smart URL paste** — when a URL is pasted with text selected, wrap it as `[selected text](url)` instead of replacing the selection
47. ✅ **Paste as plain text** (`Cmd+Shift+V`) — strip rich formatting on paste; prevents stale spans from external sources bleeding into the document
