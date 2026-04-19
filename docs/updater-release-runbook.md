# Updater Release Runbook

This runbook describes how to publish an updater-compatible Ovid release with the current
repository setup.

It assumes:

- GitHub Releases hosts the versioned release artifacts
- GitHub Pages hosts the stable updater metadata file at `latest.json`
- macOS and Windows are the only updater targets in scope for now
- Windows release assets come from GitHub Actions
- macOS release assets are currently built locally on a Mac and uploaded manually

## One-Time Setup

### 1. Generate the updater signing keypair

Generate one persistent Tauri updater signing keypair outside the repository.

Keep:

- the public key for app configuration
- the private key for CI signing only

Do not rotate this key casually. Existing installs rely on the same public key to verify
future releases.

### 2. Store the private key in GitHub Actions secrets

Add these repository or environment secrets in GitHub:

- `TAURI_UPDATER_PRIVATE_KEY`
- `TAURI_UPDATER_PRIVATE_KEY_PASSWORD`

Do not commit the private key into the repo and do not upload it as a workflow artifact.

### 3. Commit the public key in Tauri config

The updater public key and endpoint live in
[src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json).

Before the first updater-capable release, verify:

- `plugins.updater.endpoints` points at `https://hutusi.github.io/ovid/latest.json`
- `plugins.updater.pubkey` matches the public key generated from your persistent keypair
- `plugins.updater.pubkey` stores the base64-encoded content of the `.pub` file, not the raw
  multi-line minisign text

### 4. Enable GitHub Pages

The metadata workflow publishes `latest.json` to GitHub Pages.

Verify the repository Pages configuration allows GitHub Actions to deploy Pages content, and
confirm the expected final URL:

- `https://hutusi.github.io/ovid/latest.json`

## Per-Release Steps

### 1. Prepare the release version

Before tagging the release:

- update the version in `package.json`
- update the version in `src-tauri/Cargo.toml`
- update the version in `src-tauri/tauri.conf.json`
- update `CHANGELOG.md`

Run the normal release validation:

```bash
bun run validate
```

### 2. Create and push the version tag

Create the release tag in the `vX.Y.Z` format expected by
[.github/workflows/release-bundles.yml](../.github/workflows/release-bundles.yml).

Example:

```bash
git tag v0.9.3
git push origin v0.9.3
```

That workflow will:

- build the Windows MSI bundle
- enable updater artifact generation if `TAURI_UPDATER_PRIVATE_KEY` is present
- attach the generated Windows release bundles to the GitHub release

### 3. Upload and verify the release artifacts

After the workflow completes, verify the GitHub release for the new version contains the Windows
artifacts you need for updater metadata:

- `Ovid_<version>_x64_en-US.msi`
- `Ovid_<version>_x64_en-US.msi.sig`

Then build macOS artifacts locally on your Mac:

```bash
bun run tauri:build:macos-release
```

Upload these files to the existing GitHub release:

- `src-tauri/target/release/bundle/dmg/Ovid_<version>_aarch64.dmg`
- `src-tauri/target/release/bundle/macos/Ovid.app.tar.gz`
- `src-tauri/target/release/bundle/macos/Ovid.app.tar.gz.sig`

After both platforms are present on the GitHub release, identify:

- the updater-compatible artifact URL
- the corresponding signature content

You will need:

- a Windows URL and signature
- a macOS arm64 URL and signature

Do not guess these values. Copy them from the real release outputs.

### 4. Publish `latest.json`

Run the manual
[.github/workflows/updater-metadata.yml](../.github/workflows/updater-metadata.yml)
workflow in GitHub Actions.

Provide these inputs:

- `version`
- `pub_date`
- `notes`
- `windows_url`
- `windows_signature`
- `darwin_aarch64_url`
- `darwin_aarch64_signature`

Input mapping:

- `version` -> `latest.json.version`
- `pub_date` -> `latest.json.pub_date`
- `notes` -> `latest.json.notes`
- `windows_url` -> `latest.json.platforms["windows-x86_64"].url`
- `windows_signature` -> `latest.json.platforms["windows-x86_64"].signature`
- `darwin_aarch64_url` -> `latest.json.platforms["darwin-aarch64"].url`
- `darwin_aarch64_signature` -> `latest.json.platforms["darwin-aarch64"].signature`

Recommended operator sequence:

1. let the tag-triggered Windows CI release complete
2. upload the macOS DMG, tarball, and tarball signature manually
3. run the metadata workflow with the final Windows and macOS asset URLs/signatures

### 5. Verify the published metadata

After metadata publishing completes, whether from the release workflow or the manual fallback, verify:

- `https://hutusi.github.io/ovid/latest.json` is reachable
- the JSON version matches the release version
- the platform URLs point to the correct GitHub release assets
- the platform signatures are populated

### 6. Smoke-test update behavior

Before treating the release as updater-ready, test on real installs:

- macOS install on a version older than the new release
- Windows install on a version older than the new release

Check:

- the app can fetch update metadata
- the offered version matches the release
- the update flow points to the correct platform artifact
- signature verification does not fail

## Failure Cases

### Release workflow builds bundles but no updater artifacts

Likely cause:

- `TAURI_UPDATER_PRIVATE_KEY` or `TAURI_UPDATER_PRIVATE_KEY_PASSWORD` is missing in GitHub
  Actions secrets

### Windows assets are published but macOS assets are missing

Likely causes:

- the macOS build has not been run locally yet
- the local macOS build artifacts were not uploaded to the GitHub release
- the local build did not include `createUpdaterArtifacts`, so `Ovid.app.tar.gz.sig` was not
  generated

### `latest.json` publishes but updates do not work

Likely causes:

- the public key in `src-tauri/tauri.conf.json` does not match the signing private key used in
  CI
- the public key was committed in raw minisign text form instead of the base64-encoded `.pub`
  content that Tauri expects
- the metadata points at the wrong asset URL
- the metadata contains the wrong signature for one platform

### GitHub Pages deploy succeeds but the URL is stale or missing

Likely causes:

- Pages is not configured to use GitHub Actions as the source
- the Pages deployment is still propagating

## Related Docs

- [docs/updater-plan.md](./updater-plan.md)
- [docs/release-checklist.md](./release-checklist.md)
