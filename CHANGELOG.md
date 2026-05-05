# Changelog

All notable changes to Ovid will be documented in this file.

The format is based on Keep a Changelog, adapted to match the project's
release cadence and Conventional Commit history.

## 0.13.0 - 2026-05-05

### Added
- **Dual-mode sidebar**: toggle between Content view (markdown files only, with content-type
  sorting) and Files view (full project tree including non-markdown files and dotfiles). Mode
  is persisted per workspace. The toggle is a segmented two-button control in the sidebar header.
- **File previewer**: selecting a non-markdown file in Files mode opens a read-only preview panel.
  Images are rendered inline; text files (source code, config, etc.) are shown in a scrollable
  code block. Supports a wide range of extensions.
- **Folder-backed post collapsing**: a directory containing only `index.md` or `index.mdx` is
  presented as a single post item in Content mode (with a small badge indicator), removing the
  visual noise of the redundant nested file. The actual file path is used in the status bar and
  rename dialog.
- **WeChat copy**: `File → Copy for WeChat` converts the active Markdown document to
  WeChat-compatible inline-styled HTML and copies it to the clipboard. Math blocks (LaTeX) are
  stripped with a warning toast since WeChat cannot render them.
- **WeChat publish**: `File → Save Draft to WeChat…` opens a dialog to save the active document
  as a draft to a WeChat Official Account. Credentials (AppID/AppSecret) are stored securely in
  the app config directory. Body images are uploaded to the WeChat CDN and the cover image is
  uploaded as a permanent material. Access tokens are cached in-memory with automatic refresh.
- **WeChat draft update**: when a document has a `wechatMediaId` in frontmatter, the publish
  dialog enters update mode and updates the existing WeChat draft instead of creating a new one;
  on success the media_id is written back so subsequent edits keep updating the same draft.
- **WeChat publish UX**: pre-publish warnings for math blocks, local image counter, missing-cover
  warning, image upload progress indicator, and a 54-char digest counter; author and digest
  pre-fill from frontmatter or `site.config.ts`. Optional `content_source_url`, allow-comments,
  and appreciation toggles surface in the dialog.
- **Cover image editor**: properties panel cover-image field now supports drag-and-drop, clipboard
  paste, and a file picker, with a thumbnail preview and broken-image fallback. Picking a file that
  already lives inside the workspace's static asset root references it directly as a root-relative
  path instead of duplicating it into the active file's `images/` directory.
- **Draft status in search**: full-text search results show a draft badge so the indicator is
  consistent across sidebar, file switcher, and search surfaces.
- **Auto-refresh on external file changes**: the workspace tree refreshes automatically when files
  are added, modified, or removed by other tools, with a localized toast summarizing the change.

### Changed
- Files mode tree is rooted at the actual project root (`workspace_root`), not the Amytis
  `content/` subtree, so `site.config.ts`, `src/`, and other top-level project files are visible.
- `read_file` now validates against `workspace_root` instead of `tree_root`, allowing non-markdown
  files outside `content/` to be read and previewed.
- Well-known build/tooling directories (`node_modules`, `dist`, `target`, `.next`, etc.) are
  filtered from Files mode to reduce noise.
- File switcher (`Cmd+P`) and `openFileByPath` now use an independent flat file index that is
  always complete, even when sidebar branches are lazy-loaded.
- Selecting a file in the switcher or search reveals it in the sidebar by force-expanding ancestor
  folders, even when those branches have not yet been loaded.
- WeChat credentials now persist to a file in the app config directory (chmod 600) instead of the
  OS Keychain, eliminating repeating macOS Keychain authorization prompts.
- WeChat `<pre><code>` blocks now preserve newlines via `<br>` tags since WeChat strips
  `white-space` from inline styles.
- Properties panel `draft` field can now be added via the metadata pill list and removed
  symmetrically with `featured` and `pinned`.

### Fixed
- Editor: `Tab` inserts spaces inside fenced code blocks instead of moving focus out.
- Editor: autocorrect, autocapitalize, and autocomplete disabled so filenames and code are not
  rewritten by macOS or browser heuristics.
- Editor: skip reload after own auto-save to preserve trailing whitespace and suppress false
  "workspace changed" warnings.
- WeChat: strip non-absolute `href` values and disallowed attributes (`data-*`, `aria-*`, `id`,
  `<input type="checkbox">`, `<label>`) from generated HTML to avoid WeChat error 45166.
- WeChat: resolve root-relative cover and body image paths against `assetRoot`; non-local image
  URLs (`asset:`, `data:`, `blob:`) are skipped non-fatally.
- Sidebar: localize the right-click context menu; "New from existing" no longer fails on Windows.

## 0.12.0 - 2026-04-30

### Added
- Internationalization (i18n): full English and Simplified Chinese (简体中文) support across all
  UI surfaces — editor, sidebar, dialogs, properties panel, status bar, Git flows, and the native
  menu. Language preference persists in `localStorage` and the native menu is seeded from the OS
  system locale on first launch.
- Image paste from clipboard: paste an image directly into the editor; it is saved to the active
  file's sibling `images/` directory and inserted as a relative-path Markdown image at the cursor.
- Image drag-and-drop into the editor from Finder or a browser; same save and insert behavior
  as clipboard paste. Failures surface via the toast system.

### Changed
- Image assets (drag-and-drop and file-picker) now save to the active file's sibling `images/`
  directory instead of a workspace-root `assets/` directory; falls back to
  `<workspace_root>/images/` when no file is active.

## 0.11.0 - 2026-04-28

### Added
- Open-file tab bar above the editor with drag-to-reorder, middle-click or close-button to close,
  per-workspace persistence, and active tab scroll-into-view; hidden in zen mode and only shown
  with two or more open tabs.
- Properties panel now appears for files with no frontmatter, showing an empty state with
  add-field prompts so frontmatter can be created from scratch.
- Schema-aware metadata insertion and typed custom metadata dialog for Amytis content types.
- New-from-existing post workflow: create a post pre-populated from an existing file's content,
  with dates and draft status reset.
- Post duplication from the sidebar context menu ("Make a Copy").
- Status bar path rename flow for quick in-place file renaming.

### Changed
- Sidebar filter replaced with an integrated pill-style search field: Search icon prefix, subtle
  tinted background, accent focus ring on `:focus-within`, and an X clear button.
  Autocorrect, autocapitalize, and spellcheck disabled so filenames are not rewritten by macOS.
- Folder-backed posts (a directory containing `index.md`) are now shown as a single content item
  in the sidebar rather than as a raw directory.
- Sidebar rename is now routed through the path rename dialog for consistency with the status bar
  flow.
- Sidebar folder headers no longer use uppercase styling.
- Selected file is now revealed in the sidebar by force-expanding all ancestor folders when
  navigating between files.
- Expanded folder state is lazy-loaded on restore so unloaded directories are fetched on demand.
- Metadata panel improvements: boolean fields rendered as checkboxes, removal controls added,
  frontmatter keys canonicalized, custom field values preserve their original type semantics.
- Draft control moved into the publishing metadata section of the properties panel.
- Close-file menu item respects the tab bar the same way Cmd+W does.
- Status bar file controls aligned with git action layout.

### Fixed
- File deletion confirmation now uses Tauri's native async dialog so the delete no longer runs
  before the user acknowledges the prompt (the browser `window.confirm` is non-blocking in
  Tauri's WKWebView).
- `handleDelete` reads the active path from `selectedPathRef` after the async confirm returns
  rather than using a potentially stale closure snapshot.
- Duplicate of folder-backed index posts now uses the correct entry filename.
- Windows path separators normalized to forward slashes in paths emitted to the frontend.
- Windows git actions no longer flash console windows in front of the app.
- Amytis `cdnBaseUrl` images now resolve correctly in the editor.

## 0.10.0 - 2026-04-21

### Added
- Keyboard-first workspace and file navigation with workspace switcher, file switcher, and
  full-text search.
- Markdown editing with frontmatter-aware properties, Typora-style rich editing, code blocks,
  tables, images, links, footnotes, and structural editing behavior.
- Amytis-oriented content workflows including content types, draft/publish handling, and
  writing-focused workspace behavior.
- Built-in Git workflow support for status, commit, branch switching, fetch, pull, push, and
  remote actions.
- In-app manual update checks and updater infrastructure for signed release bundles, stable
  `latest.json` publishing, and end-to-end Windows plus local macOS release operations.

### Changed
- Improved release and packaging workflows with Windows CI publishing, local macOS automation,
  bundled app branding, and clearer release operator documentation.
- Refined the desktop app presentation with the first Ovid app logo and regenerated packaged
  icon set.
- Continued stabilization and performance work across workspace opening, sidebar loading, search,
  editing, and save flows.

### Known Limits
- macOS public distribution is still limited by the missing Apple signing and notarization work.
- Some release and updater steps are still optimized for careful operator-driven publishing rather
  than fully automated public distribution.

## 0.10.0 - 2026-04-21

### Added
- Keyboard-first workspace and file navigation with workspace switcher, file switcher, and
  full-text search.
- Markdown editing with frontmatter-aware properties, Typora-style rich editing, code blocks,
  tables, images, links, footnotes, and structural editing behavior.
- Amytis-oriented content workflows including content types, draft/publish handling, and
  writing-focused workspace behavior.
- Built-in Git workflow support for status, commit, branch switching, fetch, pull, push, and
  remote actions.
- In-app manual update checks and updater infrastructure for signed release bundles, stable
  `latest.json` publishing, and end-to-end Windows plus local macOS release operations.

### Changed
- Improved release and packaging workflows with Windows CI publishing, local macOS automation,
  bundled app branding, and clearer release operator documentation.
- Refined the desktop app presentation with the first Ovid app logo and regenerated packaged
  icon set.
- Continued stabilization and performance work across workspace opening, sidebar loading, search,
  editing, and save flows.

### Known Limits
- macOS public distribution is still limited by the missing Apple signing and notarization work.
- Some release and updater steps are still optimized for careful operator-driven publishing rather
  than fully automated public distribution.

## 0.9.0 - 2026-04-13

### Added
- Keyboard-first workspace and file navigation with workspace switcher, file switcher, and
  full-text search.
- Markdown editing with frontmatter-aware properties, Typora-style rich editing, code blocks,
  tables, images, links, footnotes, and structural editing behavior.
- Amytis-oriented content workflows including content types, draft/publish handling, and
  writing-focused workspace behavior.
- Built-in Git workflow support for status, commit, branch switching, fetch, pull, push, and
  remote actions.

### Notes
- `0.9.0` established the first public preview scope for Ovid.
