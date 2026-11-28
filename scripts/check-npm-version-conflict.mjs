#!/usr/bin/env node
// @oktis-works - Check that packages WITH CODE CHANGES don't have a version
// that already exists in npm.
//
// npm publish is idempotent: it skips versions already in the registry.
// If we change code in a package and bump to a version that already exists
// in npm, the new code never reaches consumers.
//
// This script only checks packages that actually had files changed in the
// current PR (compared to main). Packages without code changes are skipped
// because their version difference is expected (they were bumped due to
// internal dependency changes, not code changes).
//
// Usage: node scripts/check-npm-version-conflict.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

// Get list of packages with changed files in this PR (compared to main)
function getChangedPackageNames(): Set<string> {
  let diffOutput: string;
  try {
    diffOutput = execSync('git diff --name-only main...HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).toString();
  } catch {
    // If main...HEAD fails (e.g. no main branch), try main..HEAD
    diffOutput = execSync('git diff --name-only main..HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).toString();
  }

  const changedFiles = diffOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const changedPackages = new Set<string>();

  for (const file of changedFiles) {
    // Check if the file is inside a package directory (packages/* or apps/*)
    const match = file.match(/^(packages|apps)\/([^\/]+)\//);
    if (match) {
      const pkgDir = match[1]; // 'packages' or 'apps'
      const pkgName = match[2]; // e.g. 'database', 'auth', 'cli', 'api', etc.

      // Read package.json to get the actual npm package name
      try {
        const pkgJson = JSON.parse(
          readFileSync(join(root, file.split('/').slice(0, 3).join('/'), 'package.json'), 'utf8')
        );
        if (pkgJson.name && !pkgJson.private) {
          changedPackages.add(pkgJson.name);
        }
      } catch {
        // Ignore unreadable package.json
      }
    }
  }

  return changedPackages;
}

const changedPackages = getChangedPackageNames();

if (changedPackages.size === 0) {
  console.log('ℹ️  No packages with code changes detected. Skipping npm version conflict check.');
  process.exit(0);
}

console.log(`📦 Packages with code changes: ${[...changedPackages].join(', ')}`);

let failed = 0;

for (const name of changedPackages) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}`);
    if (res.status === 404) {
      // Package not yet published — safe
      console.log(`✅ ${name} not yet published — safe`);
      continue;
    }
    if (!res.ok) {
      console.warn(`⚠️  Could not query npm for ${name}: ${res.status}`);
      continue;
    }
    const data = await res.json();
    const npmVersion = data['dist-tags']?.latest;

    // Read local version
    let localVersion: string | null = null;
    // Find the package directory
    for (const dir of ['packages', 'apps']) {
      try {
        const entries = await import('node:fs').then((fs) =>
          fs.readdirSync(join(root, dir), { withFileTypes: true })
        );
        for (const entry of entries) {
          if (entry.isDirectory()) {
            try {
              const pkg = JSON.parse(
                readFileSync(join(root, dir, entry.name, 'package.json'), 'utf8')
              );
              if (pkg.name === name) {
                localVersion = pkg.version;
                break;
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore
      }
      if (localVersion) break;
    }

    if (!localVersion) {
      console.warn(`⚠️  Could not find local version for ${name}`);
      continue;
    }

    if (npmVersion === localVersion) {
      console.error(`❌ ${name}@${localVersion} already exists in npm registry.`);
      console.error(`   npm publish will skip this version silently.`);
      console.error(`   Code changes in this package will NOT reach consumers.`);
      console.error(`   Bump to the next patch/minor version and create a new changeset.`);
      failed++;
    } else if (npmVersion && localVersion < npmVersion) {
      console.error(`❌ ${name} local ${localVersion} is behind npm ${npmVersion}.`);
      failed++;
    } else {
      console.log(`✅ ${name}@${localVersion} is safe to publish (npm latest: ${npmVersion ?? 'none'}).`);
    }
  } catch (error) {
    console.warn(`⚠️  Network error checking ${name}: ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) have version conflicts with npm registry.`);
  console.error('Fix by bumping to a version not yet published and creating a new changeset.');
  process.exit(1);
}

console.log('\nAll changed packages are safe to publish.');
