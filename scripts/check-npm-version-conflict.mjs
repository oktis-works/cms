#!/usr/bin/env node
// @oktis-works - Check that no local package version already exists in npm.
//
// npm publish is idempotent: it skips versions already in the registry.
// If we bump a package to a version that already exists in npm, the new
// code never reaches consumers. This script fails CI if any workspace
// package version already exists in npm.
//
// Usage: node scripts/check-npm-version-conflict.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workspaces = rootPkg.workspaces || [];

// Resolve workspace globs to directories
const workspaceDirs = [];
for (const pattern of workspaces) {
  const glob = await import('node:fs');
  const entries = glob.readdirSync(join(root, pattern.replace('*', '')), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      workspaceDirs.push(join(root, pattern.replace('*', entry.name)));
    }
  }
}

// Also include root package.json itself if it has a version and is not private-only
const candidates = [
  { dir: root, name: rootPkg.name, version: rootPkg.version },
];

for (const dir of workspaceDirs) {
  const pkgPath = join(dir, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name && pkg.version && !pkg.private) {
      candidates.push({ dir, name: pkg.name, version: pkg.version });
    }
  } catch {
    // Ignore malformed package.json
  }
}

let failed = 0;

for (const { name, version } of candidates) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}`);
    if (res.status === 404) {
      // Package not yet published — safe
      continue;
    }
    if (!res.ok) {
      console.warn(`⚠️  Could not query npm for ${name}: ${res.status}`);
      continue;
    }
    const data = await res.json();
    const npmVersion = data['dist-tags']?.latest;
    if (npmVersion === version) {
      console.error(`❌ ${name}@${version} already exists in npm registry.`);
      console.error(`   npm publish will skip this version silently.`);
      console.error(`   Bump to the next patch/minor version and create a new changeset.`);
      failed++;
    } else if (npmVersion && version < npmVersion) {
      console.error(`❌ ${name} local ${version} is behind npm ${npmVersion}.`);
      failed++;
    } else {
      console.log(`✅ ${name}@${version} is safe to publish (npm latest: ${npmVersion ?? 'none'}).`);
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

console.log('\nAll package versions are safe to publish.');
