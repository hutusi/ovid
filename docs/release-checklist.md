# Release Checklist

This checklist is for cutting the first public Ovid installer release and for reusing on
later pre-1.0 releases.

## Release Scope

The first release should stay narrow:

- Position Ovid as a local-first desktop Markdown editor for Amytis workspaces.
- Ship the mature writing, workspace, search, sidebar, properties, and Git workflows that
  already exist.
- Exclude unfinished roadmap work from release messaging, especially Phase 11 workflow
  coherence items.

## Pre-Release Gates

- Confirm the version is correct in `package.json`, `src-tauri/Cargo.toml`, and
  `src-tauri/tauri.conf.json`.
- Run `bun run validate` on the release branch.
- Run `bun run tauri build` on the target release machine.
- Smoke-test the packaged app with a real Amytis workspace and a large Markdown workspace.
- Verify the following critical flows manually:
  - open workspace and reopen last workspace
  - switch files, filter sidebar, and search workspace
  - edit and save normal and large Markdown files
  - rename, create, and delete files
  - frontmatter editing and draft/publish toggling
  - Git status, commit, branch switch, fetch, pull, and push
- Check app icons, product name, and bundle metadata on the built artifact.
- Confirm there are no blocker regressions from the latest merged PRs.

## Release Assets

- Update `CHANGELOG.md` with the final shipped scope.
- Draft GitHub release notes from the changelog and README feature summary.
- Attach platform artifacts produced by `bun run tauri build`.
- Include at least one screenshot or short recording showing the editor, sidebar, and
  properties panel.

## Platform Packaging Notes

### macOS

- Build the release on your local Mac for now.
- Run:
  `bun run tauri:build:macos-release`
- Upload these files manually to the GitHub release after the Windows CI run completes:
  - `src-tauri/target/release/bundle/dmg/Ovid_<version>_aarch64.dmg`
  - `src-tauri/target/release/bundle/macos/Ovid.app.tar.gz`
  - `src-tauri/target/release/bundle/macos/Ovid.app.tar.gz.sig`
- If Tauri's DMG wrapper fails locally, a plain DMG built from the generated `.app` is an
  acceptable fallback for limited private distribution.
- Verify the mounted DMG shows `Ovid.app` and an `Applications` shortcut before publishing.

### Windows

- The GitHub Actions workflow at `.github/workflows/release-bundles.yml` is the canonical
  Windows release path.
- Confirm the CI release run publishes:
  - `Ovid_<version>_x64_en-US.msi`
  - `Ovid_<version>_x64_en-US.msi.sig`
- Smoke-test installer flows:
  - install
  - first launch
  - upgrade over an existing install
  - uninstall
- Verify app icon, product name, version, and install location behavior in the installer UI.

## Documentation

- Ensure `README.md` describes the shipped scope and supported workflows accurately.
- Link `docs/git-workflow.md` from the release notes for users who want Git details.
- Use `docs/updater-plan.md` when preparing updater-compatible releases after `0.9.0`.
- Use `docs/updater-release-runbook.md` for the step-by-step updater release procedure.
- Add a short "Known limits" section to the release notes instead of overpromising roadmap work.
- For now, call out that macOS artifacts are built locally and uploaded manually.

## First Release Notes Outline

- What Ovid is.
- Who it is for.
- Core workflows shipped in `0.9.0`.
- Known limits and rough edges.
- Validation status and supported platforms tested.

## Post-Release Follow-Up

- Triage the first round of user feedback before resuming broad roadmap work.
- Promote confirmed feedback into roadmap items or bugfix PRs.
- Use measured release and startup timings to guide the next performance pass.
