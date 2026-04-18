# Changelog

All notable changes to Ovid will be documented in this file.

The format is based on Keep a Changelog, adapted to match the project's
release cadence and Conventional Commit history.

## Unreleased

### Post-release
- `0.9.0` shipped as the first public preview release on 2026-04-15.
- Follow-up work is now focused on stabilization, installer feedback, and core workflow regressions before broader Phase 11 implementation resumes.

## 0.9.5 - 2026-04-18

### Fixed
- Bumped the shipped app version metadata to match the release tag so updater artifacts and
  `latest.json` stay consistent across macOS and Windows.

## 0.9.3 - 2026-04-18

### Fixed
- Published updater artifacts and signatures to GitHub Releases so the Tauri updater can fetch
  signed macOS and Windows update payloads from release assets.
- Corrected the updater public key configuration format so updater-compatible release builds use
  the base64-encoded minisign public key expected by Tauri.

### Added
- Updater release infrastructure for signed release bundles, stable `latest.json` publishing,
  and release-operator documentation.
- An initial in-app manual update flow under `Help -> Check for Updates…`, including update
  status, download/install progress, and restart-to-finish behavior.

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
- Session and performance improvements from recent optimization passes across startup,
  workspace opening, sidebar loading, search, and editing flows.

### Notes
- `0.9.0` is the first public preview release scope for Ovid.
- This release is aimed at early users who want a local-first desktop Markdown editor with
  strong Amytis workflow support.
