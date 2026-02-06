import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function normalizeTagToVersion(tag) {
  const trimmed = String(tag || '').trim();
  if (!trimmed) return null;

  const noPrefix = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(noPrefix)) {
    return noPrefix;
  }

  const legacyMatch = noPrefix.match(/^(\d+\.\d+\.\d+)([A-Za-z][0-9A-Za-z.-]*)$/);
  if (legacyMatch) {
    return `${legacyMatch[1]}-${legacyMatch[2]}`;
  }

  return null;
}

function getBuildInfo() {
  let commit = 'unknown';
  let commitShort = 'unknown';
  let versionFromTag = null;

  try {
    commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    commitShort = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn('Warning: Could not get git commit info:', error.message);
  }

  try {
    const tags = execSync('git tag --points-at HEAD', { encoding: 'utf-8' })
      .split(/\r?\n/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const normalized = tags.map(normalizeTagToVersion).find(Boolean);
    if (normalized) {
      versionFromTag = normalized;
    }
  } catch {
    // ignore; package.json version fallback is used
  }

  // Read version from package.json (cross-platform)
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

  return {
    version: versionFromTag || packageJson.version,
    commit,
    commitShort,
    buildTime: new Date().toISOString()
  };
}

const buildInfo = getBuildInfo();
const outputPath = join(__dirname, '..', 'src', 'electron', 'build-info.json');

writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
console.log('Build info generated:', buildInfo);
