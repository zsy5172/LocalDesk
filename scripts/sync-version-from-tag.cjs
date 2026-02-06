#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = new Set(process.argv.slice(2));
const strictMode = args.has("--strict") || args.has("--ci");

const repoRoot = path.resolve(__dirname, "..");

function runGit(command) {
  try {
    return execSync(command, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function isSemverLike(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
}

function normalizeLegacyTag(tag) {
  const trimmed = String(tag || "").trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  if (isSemverLike(withoutPrefix)) return withoutPrefix;

  const match = withoutPrefix.match(
    /^(\d+\.\d+\.\d+)([A-Za-z][0-9A-Za-z.-]*)$/
  );
  if (!match) return null;

  return `${match[1]}-${match[2]}`;
}

function resolveVersionFromTag() {
  if (process.env.VALEDESK_VERSION) {
    const envVersion = normalizeLegacyTag(process.env.VALEDESK_VERSION);
    if (envVersion) return envVersion;
  }

  const tags = runGit("git tag --points-at HEAD")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const tag of tags) {
    const normalized = normalizeLegacyTag(tag);
    if (normalized) return normalized;
  }

  return null;
}

function replaceFirst(content, regex, replacer) {
  const match = content.match(regex);
  if (!match) {
    return { changed: false, content };
  }
  return {
    changed: true,
    content: content.replace(regex, replacer),
  };
}

function updateTextFile(filePath, updater) {
  const absolutePath = path.resolve(repoRoot, filePath);
  const before = fs.readFileSync(absolutePath, "utf-8");
  const after = updater(before);
  if (after !== before) {
    fs.writeFileSync(absolutePath, after);
    return true;
  }
  return false;
}

function main() {
  const version = resolveVersionFromTag();

  if (!version) {
    const message =
      "[version-sync] No semantic version tag found on HEAD (expected tags like v1.2.3).";
    if (strictMode) {
      console.error(message);
      process.exit(1);
    }
    console.log(`${message} Skipping version sync.`);
    return;
  }

  const changedFiles = [];

  if (
    updateTextFile("package.json", (content) => {
      const result = replaceFirst(
        content,
        /"version"\s*:\s*"[^"]+"/,
        `"version": "${version}"`
      );
      return result.content;
    })
  ) {
    changedFiles.push("package.json");
  }

  if (
    updateTextFile("package-lock.json", (content) => {
      let next = content;
      const topLevel = replaceFirst(
        next,
        /(\{\s*\n\s*"name"\s*:\s*"[^"]+",\s*\n\s*"version"\s*:\s*")[^"]+(")/,
        `$1${version}$2`
      );
      next = topLevel.content;

      const rootPackage = replaceFirst(
        next,
        /("packages"\s*:\s*\{\s*\n\s*""\s*:\s*\{\s*\n\s*"name"\s*:\s*"[^"]+",\s*\n\s*"version"\s*:\s*")[^"]+(")/,
        `$1${version}$2`
      );
      next = rootPackage.content;

      return next;
    })
  ) {
    changedFiles.push("package-lock.json");
  }

  if (
    updateTextFile("src-tauri/tauri.conf.json", (content) => {
      const result = replaceFirst(
        content,
        /"version"\s*:\s*"[^"]+"/,
        `"version": "${version}"`
      );
      return result.content;
    })
  ) {
    changedFiles.push("src-tauri/tauri.conf.json");
  }

  if (
    updateTextFile("src-tauri/Cargo.toml", (content) => {
      const result = replaceFirst(
        content,
        /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
        `$1${version}$2`
      );
      return result.content;
    })
  ) {
    changedFiles.push("src-tauri/Cargo.toml");
  }

  if (fs.existsSync(path.resolve(repoRoot, "src/electron/build-info.json"))) {
    if (
      updateTextFile("src/electron/build-info.json", (content) => {
        const result = replaceFirst(
          content,
          /"version"\s*:\s*"[^"]+"/,
          `"version": "${version}"`
        );
        return result.content;
      })
    ) {
      changedFiles.push("src/electron/build-info.json");
    }
  }

  if (changedFiles.length === 0) {
    console.log(`[version-sync] Version already up to date: ${version}`);
    return;
  }

  console.log(`[version-sync] Synced version ${version} in:`);
  for (const file of changedFiles) {
    console.log(`- ${file}`);
  }
}

main();
