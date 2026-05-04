# Roadmap

Ovid is a writing and knowledge tool for people who take their words seriously. It serves three overlapping audiences: **writers and bloggers** who want a calm, focused environment for long-form work; **knowledge workers** who think and organize in interconnected notes; and **Amytis publishers** who want to manage their site content without leaving the editor. Deep Amytis integration is first-class, but Ovid is equally at home for anyone who writes in Markdown.

This roadmap is organized into deliberate phases — each phase must feel complete and polished before the next begins. Features are tagged by primary audience: 🖊 Writer · 🧠 Knowledge · 📢 Publisher.

> Release status: `0.9.0` shipped on 2026-04-15 as the first public preview release.

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
13. ✅ **Rename file** (`F2` or right-click → Rename in sidebar) — inline rename; validates no duplicate names; updates open editor tab if renaming current file
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
27. ✅ **Commit & push** (`Cmd+Shift+G`) — selective commit dialog with changed-file review, auto-filled message (`Update: <title>`), branch name shown, push toggle; runs via Rust `git` subprocess
28. ✅ **Draft → publish flow** — one-click to toggle `draft: true/false` in properties panel with a clear "Publish" affordance; auto-commits if git integration is active
29. ✅ **Dedicated Git menu** — native `Git` menu for commit, switch branch, new branch, push, pull, fetch, open remote, and copy remote URL
30. ✅ **Branch workflows** — searchable local branch switcher, in-app branch creation, status-bar branch pill, workspace reload after successful branch changes
31. ✅ **Remote awareness** — detect current upstream/remote, show ahead/behind state in branch UI and status-bar tooltip, open remote in browser, copy remote URL
32. ✅ **Upstream setup on first push** — in-app push falls back to `git push -u <remote> <branch>` when the current branch has no upstream; branch switcher surfaces a `Push + Track` action

---

## ✅ Phase 6 — Rich Editing
> Goal: the editor should feel as capable as it is calm.

29. ✅ **Image handling** — drag-and-drop image into editor: copy to the active file's sibling `images/` directory, insert relative markdown path; show inline preview
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

A. ✅ **Native app menu** — full native menu bar (File / Edit / Insert / Format / View / Git / Window / Help); menu actions route to the editor and app-level handlers; Edit uses OS-native Undo/Redo/Cut/Copy/Paste

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

---

## Phase 9 — Git Workflow Completion
> Goal: make the current Git features feel like one coherent daily workflow without turning Ovid into a full Git client. 🖊 📢

48. ✅ **Multi-remote support** — model Git around explicit remotes and tracking targets, with remote-aware push/open/copy flows instead of assuming the current upstream or first remote is always correct
49. ✅ **Unified Git status surface** — split Git into clearer surfaces: branch switching stays on the branch control, local changes open the commit flow, and sync state opens its own focused status window instead of routing everything through one generic Git popup
50. ✅ **More visible sync state** — surface branch sync state directly in the status bar with ahead/behind/diverged labels and a dedicated sync dialog, plus automatic refresh on window focus so remote changes show up without a manual fetch
51. ✅ **Git rejection/conflict UX** — classify the most common push/pull failures into clearer app-level messages, keep commit-succeeded/push-failed states distinct, and avoid surfacing raw Git stderr for routine rejections
52. ✅ **Remote branch checkout** — allow switching to or creating local tracking branches from remote refs directly in the branch switcher, while filtering out refs already covered by existing local tracking branches
53. ✅ **Branch maintenance** — add local branch rename/delete flows with current-branch and unmerged-work guardrails, then tuck those actions behind a quieter overflow control so switching stays primary
54. ⏸️ **Deferred host-specific integrations** — keep GitHub/GitLab auth, PR workflows, and conflict editors out of scope unless the core Git workflow proves insufficient

---

## Phase 10 — Performance & Scale
> Goal: keep Ovid calm and responsive as workspaces, documents, and daily usage get larger. 🖊 🧠

55. 🔄 **Faster workspace open** — avoid fully re-walking or eagerly hydrating everything on open; prioritize the visible tree and active workspace metadata so large projects feel immediate
56. 🔄 **Large-workspace navigation resilience** — keep sidebar expansion, quick switcher, and full-text search responsive in workspaces with thousands of files; reduce avoidable React churn and repeated derived-state work
57. 🔄 **Large-document editor stability** — smooth out typing, folding, and cursor movement in very long Markdown files; identify expensive editor updates and defer or isolate non-critical work
58. 🔄 **Background refresh discipline** — make auto-save, Git refresh, and workspace reload behavior feel invisible; avoid UI stalls, redundant refreshes, and accidental focus-jumps during background tasks
59. 🔄 **Search and switcher ranking polish** — improve result quality for repeated daily use: better title/path balancing, stronger recent-file weighting, and less noisy fuzzy matches in large trees
60. 🔄 **Cold-start and release profiling** — measure startup, workspace open, search, branch switch, and commit-flow timings; use those numbers to drive follow-up optimizations instead of guessing

Progress landed so far:
- workspace/search caching and instrumentation improved repeated open and search paths
- sidebar derived-state work was reduced for large trees
- large-document editing now defers markdown serialization and avoids blocking file switches on huge save flushes
- git status refreshes are coalesced and stale workspace refresh results are discarded
- file switcher and workspace search now use stronger relevance ordering instead of mostly traversal order
- startup bundle work now defers overlays and the editor, with the editor stack split into smaller deferred chunks

---

## Phase 11 — Workflow Coherence & Path-Based Navigation
> Goal: make Ovid feel like one continuous writing flow instead of a set of strong but separate features. 🖊 🧠 📢

61. ✅ **Independent file index for switcher/search** — decouple `Cmd+P`, path-open flows, and other file discovery from the currently loaded sidebar tree so lazy tree loading never makes discovery incomplete
62. ✅ **Canonical open-by-path flow** — unify how the app opens a file by path from search, switcher, recents, auto-reopen, and future commands; ensure the same code path can hydrate missing directory segments and reveal the file in the sidebar
63. ✅ **Reveal selected file in a lazy tree** — when a deep file is opened outside the currently loaded tree, progressively load and expand ancestor directories so the sidebar reflects the actual current selection
64. **Workspace/session restore polish** — restore not just the last workspace, but the last useful working context with fewer surprises: recent file, visible editor state, and a calmer handoff after restart or workspace switch
65. **Publishing flow tightening** — make the draft → edit → publish → commit/push sequence feel more deliberate, with better defaults and fewer small interruptions around metadata, commit message generation, and follow-up Git actions
66. ✅ **Cross-surface consistency pass** — align sidebar, switcher, recents, search, and open-by-path behavior so ranking, reveal rules, and path handling feel like one coherent system rather than feature-by-feature exceptions

---

## Post-0.9.0 Stabilization
> Goal: protect the first release quality before taking on broader feature work. 🖊 🧠 📢

67. **Installer and first-run triage** — fix release issues found in macOS/Windows install, launch, permissions, and first-workspace-open flows
68. **Core workflow regressions first** — prioritize bugs in open, save, search, switcher, sidebar, editor, and Git flows ahead of new roadmap breadth
69. **Release feedback capture** — turn confirmed post-release user feedback into scoped issues or follow-up roadmap items instead of reacting ad hoc

---

## Phase 12 — Application Updates
> Goal: let users move to newer Ovid releases with confidence, first manually and then with optional automation. 🖊 📢

70. **Updater release pipeline** — make release assets, metadata, and signing/notarization predictable enough for updater consumption across supported platforms
71. **Manual update check** — add a `Check for Updates` action that shows current version, latest version, and release notes, with a clear no-update state
72. **Manual update install flow** — support user-initiated download and install/update flows from within Ovid, with platform-appropriate prompts and failure handling
73. **Automatic update check** — add a preference-controlled background check on launch or at a calm interval; notify users when an update is available without forcing immediate install
74. **Update preferences and visibility** — expose updater settings, last-checked state, and release-channel/version messaging clearly enough that users trust what the app is doing
75. **Updater resilience** — handle offline mode, partial downloads, invalid metadata, and platform-specific update failures without leaving the app in a confusing state

---

## Phase 13 — Editor Surface
> Goal: make the writing surface itself feel as capable as the surrounding workflow. Each addition must justify the chrome it introduces and stay invisible in zen mode. 🖊 🧠

76. ✅ **Open-file tab bar** — single-line tab strip above the editor showing currently open files (cap 8); click to switch, middle-click or `Cmd+W` to close and fall back to the neighbor tab, drag to reorder; persists across launches per workspace; only renders once 2+ files have been opened; hidden in zen mode; typography-only chrome
77. ✅ **Image paste & drag-drop** — paste from clipboard or drag from Finder/browser into the editor; auto-save to the active file's sibling `images/` directory via `save_asset` / `save_asset_from_bytes` Tauri commands; insert a relative-path Markdown image at the cursor; surface failures via the toast system
78. **Slash command menu** — type `/` at the start of a line (or after whitespace) to open a Notion-style block picker: heading, list, quote, code, table, image, math, divider; keyboard-navigable like the file switcher; coexists with the existing markdown auto-conversions (`# `, `> `, etc.) without double-firing
79. **Document outline / TOC** — collapsible right-side panel listing the document's heading structure with click-to-jump; reuses the `TextFolding` extension's heading scan; toggle with a keyboard shortcut; hidden in zen mode; respects the editor's max-width by overlaying rather than pushing content
