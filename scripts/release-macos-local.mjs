#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_NOTES_PREFIX = "Automated updater metadata for Ovid";

function usage() {
  console.log(
    [
      "Usage:",
      "  bun run release:macos-local -- --version 0.9.6 [--notes '...'] [--pub-date 2026-04-20T02:00:00Z] [--clobber]",
      "  bun run release:macos-local -- 0.9.6",
      "",
      "This command assumes:",
      "- the matching tag and GitHub release already exist",
      "- the Windows MSI and MSI signature are already attached to that release",
      "- gh is authenticated locally",
    ].join("\n"),
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`command failed: ${command} ${args.join(" ")}`);
  }

  return options.capture ? result.stdout.trim() : "";
}

function parseArgs(argv) {
  const options = {
    clobber: false,
    notes: "",
    pubDate: "",
    version: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--clobber") {
      options.clobber = true;
      continue;
    }
    if (arg === "--version") {
      options.version = argv[++i] ?? "";
      continue;
    }
    if (arg === "--notes") {
      options.notes = argv[++i] ?? "";
      continue;
    }
    if (arg === "--pub-date") {
      options.pubDate = argv[++i] ?? "";
      continue;
    }
    if (arg.startsWith("--")) {
      fail(`unknown argument: ${arg}`);
    }
    if (!options.version) {
      options.version = arg;
      continue;
    }
    fail(`unexpected argument: ${arg}`);
  }

  if (!options.version) {
    fail("missing required version");
  }

  if (!/^\d+\.\d+\.\d+$/.test(options.version)) {
    fail(`invalid version: ${options.version}`);
  }

  if (!options.pubDate) {
    options.pubDate = new Date().toISOString();
  }

  if (!options.notes) {
    options.notes = `${DEFAULT_NOTES_PREFIX} ${options.version}.`;
  }

  return options;
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
}

function readJson(command, args) {
  const stdout = run(command, args, { capture: true });
  try {
    return JSON.parse(stdout);
  } catch {
    fail(`failed to parse JSON output from: ${command} ${args.join(" ")}`);
  }
}

function findAssetUrl(assets, name) {
  const asset = assets.find((item) => item.name === name);
  if (!asset?.url) {
    fail(`missing release asset: ${name}`);
  }
  return asset.url;
}

function readSignature(filePath) {
  const value = fs.readFileSync(filePath, "utf8").trim();
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) {
    fail(`invalid signature content in ${filePath}`);
  }
  return value;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const tag = `v${options.version}`;
  const macosDmg = path.join(
    "src-tauri",
    "target",
    "release",
    "bundle",
    "dmg",
    `Ovid_${options.version}_aarch64.dmg`,
  );
  const macosTarball = path.join(
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    "Ovid.app.tar.gz",
  );
  const macosSignature = path.join(
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    "Ovid.app.tar.gz.sig",
  );

  // Fail fast before the local macOS build if the matching Windows release assets are missing.
  console.log(`Verifying release ${tag} and Windows assets...`);
  const initialRelease = readJson("gh", ["release", "view", tag, "--json", "assets"]);
  const initialAssets = initialRelease.assets ?? [];
  const windowsUrl = findAssetUrl(initialAssets, `Ovid_${options.version}_x64_en-US.msi`);
  const windowsSignatureUrl = findAssetUrl(
    initialAssets,
    `Ovid_${options.version}_x64_en-US.msi.sig`,
  );

  console.log("Building local macOS release artifacts...");
  run("bun", ["run", "tauri:build:macos-release"]);

  ensureFile(macosDmg);
  ensureFile(macosTarball);
  ensureFile(macosSignature);

  const uploadArgs = ["release", "upload", tag, macosDmg, macosTarball, macosSignature];
  if (options.clobber) {
    uploadArgs.push("--clobber");
  }

  console.log("Uploading macOS assets to the GitHub release...");
  run("gh", uploadArgs);

  // Re-read the release after upload so the macOS updater URL comes from the attached asset.
  console.log("Resolving final release asset URLs and signatures...");
  const finalRelease = readJson("gh", ["release", "view", tag, "--json", "assets"]);
  const finalAssets = finalRelease.assets ?? [];
  const darwinUrl = findAssetUrl(finalAssets, "Ovid.app.tar.gz");
  findAssetUrl(finalAssets, "Ovid.app.tar.gz.sig");

  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "ovid-release-metadata-"));
  const windowsSigPath = path.join(downloadDir, `Ovid_${options.version}_x64_en-US.msi.sig`);
  let windowsSignature = "";
  let darwinSignature = "";
  try {
    run("gh", [
      "release",
      "download",
      tag,
      "--pattern",
      `Ovid_${options.version}_x64_en-US.msi.sig`,
      "--dir",
      downloadDir,
    ]);

    windowsSignature = readSignature(windowsSigPath);
    darwinSignature = readSignature(macosSignature);
  } finally {
    fs.rmSync(downloadDir, { force: true, recursive: true });
  }

  console.log("Triggering updater metadata workflow...");
  run("gh", [
    "workflow",
    "run",
    "updater-metadata.yml",
    "-f",
    `version=${options.version}`,
    "-f",
    `pub_date=${options.pubDate}`,
    "-f",
    `notes=${options.notes}`,
    "-f",
    `windows_url=${windowsUrl}`,
    "-f",
    `windows_signature=${windowsSignature}`,
    "-f",
    `darwin_aarch64_url=${darwinUrl}`,
    "-f",
    `darwin_aarch64_signature=${darwinSignature}`,
  ]);

  console.log("");
  console.log("Release automation complete.");
  console.log(`Windows signature asset: ${windowsSignatureUrl}`);
  console.log(`macOS updater asset: ${darwinUrl}`);
  console.log("Check the workflow run with:");
  console.log("  gh run list --workflow updater-metadata.yml --limit 1");
  console.log("Then verify:");
  console.log("  curl https://hutusi.github.io/ovid/latest.json");
}

main();
