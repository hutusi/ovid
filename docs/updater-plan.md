# Updater Plan

This document defines the first implementation slice for Ovid application updates after
`0.9.0`.

The goal is to make updates trustworthy before they become automatic.

## Current State

As of `0.9.0`, Ovid has:

- native packaged artifacts for macOS (`.dmg`) and Windows (`.msi`)
- a GitHub-based release flow
- a GitHub Actions workflow for building the Windows MSI

Ovid does **not** yet have:

- the Tauri updater plugin configured
- updater signing keys in place
- updater metadata generation or hosting
- an in-app update check or install flow

## Ovid Repo Audit

Verified in the current repo:

- [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) has no updater plugin configuration
- [package.json](../package.json) has no `@tauri-apps/plugin-updater` dependency
- [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) has no `tauri-plugin-updater` dependency
- [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) currently initializes `opener` and `dialog` plugins only
- [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json) has no updater-related permission entry
- [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) already has a native `Help` menu, which is the right future home for `Check for Updates`
- [.github/workflows/release-bundles.yml](../.github/workflows/release-bundles.yml) builds predictable macOS and Windows release assets on tag pushes, which is the right base for later updater artifact generation

This means Ovid is not one config flag away from updater support. The release pipeline,
desktop permissions, Rust plugin setup, and frontend surface all still need explicit work.

## Product Decision

Updater work should ship in this order:

1. release pipeline readiness
2. manual update check
3. manual update install
4. automatic background check

Do not start with silent or background auto-installation.

## Why This Order

- The updater depends on release metadata and signature discipline, not just app UI.
- A visible manual flow is easier to test and debug on macOS and Windows.
- Early updater failures damage user trust more than most normal feature bugs.

## Ovid-Specific UX Plan

### Entry Points

- Add `Check for Updates` to the native `Help` menu.
- Later, expose updater settings in preferences once background checks exist.

### Manual Update Check

The first in-app updater UI should show:

- current app version
- latest available version
- release notes summary or release link
- explicit `Up to date` state
- explicit offline/error state

### Manual Install Flow

The app should:

- download only after explicit user intent
- show platform-appropriate status and failure messages
- avoid blocking the editor until installation is actually required

### Automatic Checks

After the manual flow is stable:

- check on launch or at a calm interval
- notify instead of forcing install
- allow the user to defer

## Release Pipeline Requirements

Before runtime updater code is added, the release pipeline must support:

- signed updater artifacts
- stable release metadata per platform
- a reliable endpoint for updater JSON
- consistent asset naming and publishing

For Ovid, that likely means:

- GitHub Releases remain the distribution source
- updater metadata is generated as part of release publishing
- macOS and Windows updater artifacts are published together for each version

## Tauri 2 Requirements

The current Tauri 2 updater model requires:

- updater plugin setup in both Rust and frontend
- updater endpoints in Tauri config
- updater public key (`pubkey`) in Tauri config
- updater artifacts enabled in bundling

Relevant official docs:

- https://v2.tauri.app/plugin/updater/

Important implications:

- signatures are required; updater verification is not optional
- release assets alone are not enough; metadata must also be published
- updater behavior is platform-sensitive and must be tested on macOS and Windows

## Implementation Phases

### Phase 12.70 — Updater Release Pipeline

Deliverables:

- choose metadata hosting approach
- generate persistent updater signing keys
- enable updater artifact generation
- document release publishing steps for updater-compatible releases

Concrete repo checklist:

- add updater dependencies to [package.json](../package.json) and [src-tauri/Cargo.toml](../src-tauri/Cargo.toml)
- add updater plugin initialization in [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)
- add updater config and `createUpdaterArtifacts` in [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)
- update [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json) with updater permissions once the plugin is installed
- define how updater metadata is published alongside GitHub releases
- define where the updater signing private key is stored in CI and who owns rotation

Exit criteria:

- a release can publish all updater inputs without manual guesswork

### Phase 12.71 — Manual Update Check

Deliverables:

- `Check for Updates` menu action
- update query wiring
- modal or dialog for update state

Exit criteria:

- users can reliably tell whether a newer version exists

### Phase 12.72 — Manual Update Install

Deliverables:

- user-initiated download/install flow
- clear progress and failure handling

Exit criteria:

- a user can upgrade from inside Ovid without visiting GitHub manually

### Phase 12.73+ — Automatic Update Behavior

Deliverables:

- background check timing
- update preferences
- resilience for offline and partial-failure cases

Exit criteria:

- background checks are helpful and non-disruptive

## Open Decisions

- Whether updater metadata should be committed to the repo, published by CI, or stored in a
  separate release bucket
- Whether the first updater-supported macOS release should use the existing DMG path or a
  different updater-compatible artifact path
- Whether Windows install mode should stay conservative (`passive`) for the first updater
  release
- Whether Ovid should use GitHub Releases directly as the updater metadata endpoint or publish
  a dedicated stable `latest.json` URL outside GitHub's release UI

## Recommendation

Start with Phase `12.70` only.

Do not add updater UI or plugin runtime code until the release pipeline, metadata strategy,
and signing key handling are all defined clearly enough to test end-to-end.

## Recommended Hosting Model

Use a split hosting model:

- **GitHub Releases** for versioned updater artifacts
- **GitHub Pages** for a stable updater metadata URL such as `latest.json`

### Why This Split

- GitHub Releases is already Ovid's distribution channel for signed versioned assets.
- The updater needs a stable metadata endpoint that does not change every release.
- A stable `latest.json` URL behaves like an API surface, which is a better fit for updater
  configuration than a versioned release asset URL.

### Recommended Ovid Shape

- release artifacts stay attached to each GitHub release
- CI publishes a stable metadata file such as:
  - `https://hutusi.github.io/ovid/latest.json`
- that metadata points to GitHub Release asset URLs for the current version
- the repo can generate this file with [scripts/generate-updater-json.mjs](../scripts/generate-updater-json.mjs)
  and publish it with [.github/workflows/updater-metadata.yml](../.github/workflows/updater-metadata.yml)

### Metadata Contract

The current scaffold expects a static JSON payload shaped like:

```json
{
  "version": "0.9.1",
  "notes": "Release notes text",
  "pub_date": "2026-04-15T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "WINDOWS_SIGNATURE",
      "url": "https://github.com/hutusi/ovid/releases/download/v0.9.1/..."
    },
    "darwin-aarch64": {
      "signature": "MAC_SIGNATURE",
      "url": "https://github.com/hutusi/ovid/releases/download/v0.9.1/..."
    }
  }
}
```

For Ovid, that means the release pipeline must eventually produce, for each supported
platform:

- an updater-compatible downloadable artifact URL
- the corresponding signature content
- a version string
- a publish timestamp
- a short notes payload

### Workflow Contract

The current metadata publishing workflow is intentionally manual first. It expects:

- `version`
- `pub_date`
- `notes`
- `windows_url`
- `windows_signature`
- `darwin_aarch64_url`
- `darwin_aarch64_signature`

That contract is deliberate:

- today, Ovid does not yet generate updater artifacts automatically
- later, the release workflow can supply these values directly once updater bundling is enabled
- until then, the metadata workflow remains a safe standalone building block instead of pretending
  the full updater pipeline already exists

### Avoid

- manually editing and committing `latest.json` for every release
- treating the GitHub release page structure as the updater API
- storing updater private signing keys in the repository
