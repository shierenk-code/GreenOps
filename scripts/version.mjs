#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getPackageJsonPaths() {
  const paths = [path.join(rootDir, 'package.json')];

  const appsDir = path.join(rootDir, 'apps');
  if (fs.existsSync(appsDir)) {
    for (const app of fs.readdirSync(appsDir)) {
      const pkgPath = path.join(appsDir, app, 'package.json');
      if (fs.existsSync(pkgPath)) paths.push(pkgPath);
    }
  }

  const packagesDir = path.join(rootDir, 'packages');
  if (fs.existsSync(packagesDir)) {
    for (const pkg of fs.readdirSync(packagesDir)) {
      const pkgPath = path.join(packagesDir, pkg, 'package.json');
      if (fs.existsSync(pkgPath)) paths.push(pkgPath);
    }
  }

  return paths;
}

function getCurrentVersion() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  return rootPkg.version || '0.1.0';
}

function calculateNextVersion(currentVersion, bumpType) {
  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver version: ${currentVersion}`);
  }
  let [major, minor, patch] = parts;

  switch (bumpType) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
    default:
      if (/^\d+\.\d+\.\d+/.test(bumpType)) {
        return bumpType;
      }
      throw new Error(`Unknown bump type or invalid version: ${bumpType}`);
  }

  return `${major}.${minor}.${patch}`;
}

function detectBumpFromCommits() {
  try {
    const latestTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', {
      encoding: 'utf-8',
    }).trim();
    const logRange = latestTag ? `${latestTag}..HEAD` : 'HEAD';
    const commitLogs = execSync(`git log ${logRange} --pretty=format:"%s\n%b---END-COMMIT---"`, {
      encoding: 'utf-8',
    });

    if (!commitLogs.trim()) {
      return 'none';
    }

    const commits = commitLogs.split('---END-COMMIT---').map((c) => c.trim()).filter(Boolean);
    if (commits.length === 0) {
      return 'none';
    }

    let hasMajor = false;
    let hasMinor = false;
    let hasPatch = false;

    for (const commit of commits) {
      if (commit.includes('BREAKING CHANGE:') || /^[a-z]+(\([a-z0-9_-]+\))?!:/.test(commit)) {
        hasMajor = true;
        break;
      }
      if (/^feat(\([a-z0-9_-]+\))?:/.test(commit)) {
        hasMinor = true;
      } else if (/^(fix|perf|refactor|revert)(\([a-z0-9_-]+\))?:/.test(commit)) {
        hasPatch = true;
      }
    }

    if (hasMajor) return 'major';
    if (hasMinor) return 'minor';
    if (hasPatch) return 'patch';
    return 'none';
  } catch {
    return 'none';
  }
}

function updateVersions(newVersion) {
  const pkgPaths = getPackageJsonPaths();
  console.log(`\n🚀 Updating monorepo packages to version: v${newVersion}\n`);

  for (const pkgPath of pkgPaths) {
    try {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const json = JSON.parse(content);
      json.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
      console.log(`  ✓ Updated ${path.relative(rootDir, pkgPath)}`);
    } catch (e) {
      console.error(`  ✗ Failed to update ${pkgPath}:`, e.message);
    }
  }

  // Update apps/cli/src/cli.ts version string if present
  const cliTsPath = path.join(rootDir, 'apps', 'cli', 'src', 'cli.ts');
  if (fs.existsSync(cliTsPath)) {
    let cliContent = fs.readFileSync(cliTsPath, 'utf-8');
    cliContent = cliContent.replace(/\.version\(['"][^'"]+['"]/, `.version('${newVersion}'`);
    fs.writeFileSync(cliTsPath, cliContent, 'utf-8');
    console.log(`  ✓ Updated ${path.relative(rootDir, cliTsPath)}`);
  }

  console.log(`\n🎉 Successfully bumped version to ${newVersion} across all workspaces.\n`);
}

const arg = process.argv[2];

if (arg === 'check') {
  const current = getCurrentVersion();
  console.log(`Current monorepo version: ${current}`);
  const pkgPaths = getPackageJsonPaths();
  let misaligned = false;
  for (const p of pkgPaths) {
    const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (json.version && json.version !== current) {
      console.warn(`  ⚠ ${path.relative(rootDir, p)} has version ${json.version} (expected ${current})`);
      misaligned = true;
    }
  }
  if (!misaligned) {
    console.log('  ✓ All workspace package versions are aligned.');
  }
  process.exit(misaligned ? 1 : 0);
}

const bumpType = arg || detectBumpFromCommits();
const currentVersion = getCurrentVersion();

if (bumpType === 'none') {
  console.log(`\nℹ No releasable changes detected since last tag. Current version remains v${currentVersion}.\n`);
  process.exit(0);
}

const nextVersion = calculateNextVersion(currentVersion, bumpType);
updateVersions(nextVersion);

