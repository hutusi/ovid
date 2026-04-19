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

- `bun run tauri build` successfully produces the `.app` bundle on macOS.
- Public release DMGs must be code-signed and notarized, or Gatekeeper can mark the downloaded
  app as broken when users open it.
- CI macOS release builds expect these secrets:
  - `APPLE_CERTIFICATE`
  - `APPLE_CERTIFICATE_PASSWORD`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
  - `APPLE_API_KEY_CONTENT`
  - `KEYCHAIN_PASSWORD`
- Verify the mounted DMG shows `Ovid.app` and an `Applications` shortcut before publishing.

### Windows

- Build the installer on a Windows machine with Bun and Rust installed.
- Run `bun run tauri build` and confirm the `.msi` appears under the Tauri bundle output.
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
