#!/usr/bin/env node
// scripts/check-changelog-and-changeset.mjs
//
// Enforces that every package change is accompanied by BOTH items,
// working together — never one or the other:
//
//   1. A changeset in .changeset/*.md declaring which package changes,
//      the bump type (patch/minor/major), and a description in English.
//   2. An entry in the package's own CHANGELOG.md documenting what
//      changed, in which version, and why.
//
// Why both are mandatory and complementary:
//
//   The changeset is the source of truth for release automation:
//   changeset version consumes the .md files, calculates new version
//   numbers (lockstep with internal dependencies via the "fixed" group),
//   writes the CHANGELOGs, and prepares manifests for publish.
//   Without a changeset, the package is not bumped nor published.
//
//   The CHANGELOG.md is documentation for the consumer: it is what
//   someone installing the package reads to understand what changed
//   between versions. It is maintained by hand and reviewed in PR.
//   changeset version only inserts the "Updated dependencies" block;
//   the descriptive text must be reviewed and confirmed in the CHANGELOG.
//
//   One without the other is incomplete: changeset without CHANGELOG
//   leaves the consumer without knowing what changed; CHANGELOG without
//   changeset makes the package not be bumped or published, leaving the
//   CHANGELOG orphaned from a version.
//
// Usage:
//   node scripts/check-changelog-and-changeset.mjs
//   # exit 0 if everything is OK, exit 1 with details if something is missing

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
const CHANGESET_DIR = join(ROOT, '.changeset');
const PACKAGES_DIR = join(ROOT, 'packages');

const errors = [];

function currentVersion(pkgJsonPath) {
  try {
    return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------------------
// 1. Discover changed packages (diff vs main)
// ---------------------------------------------------------------------------
let changedPackages = [];

try {
  const diffOutput = execSync('git diff --name-only main...HEAD', {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();

  if (diffOutput) {
    const changedFiles = diffOutput.split('\n').filter(Boolean);
    const packageSet = new Set();

    for (const file of changedFiles) {
      // packages/<nome>/anything -> package = <nome>
      const match = file.match(/^packages\/([^\/]+)\//);
      if (match) {
        packageSet.add(match[1]);
      }
    }
    changedPackages = [...packageSet];
  }
} catch {
  // If main does not exist or diff fails, consider all packages with
  // package.json as candidates (conservative mode).
  console.warn('Could not diff with main — checking all packages.');
}

// ---------------------------------------------------------------------------
// 2. Read pending changesets
// ---------------------------------------------------------------------------
const changesetFiles = existsSync(CHANGESET_DIR)
  ? readdirSync(CHANGESET_DIR).filter(
      (f) => f.endsWith('.md') && f !== 'config.json' && f !== 'README.md'
    )
  : [];

const changesetContent = changesetFiles
  .map((f) => readFileSync(join(CHANGESET_DIR, f), 'utf8'))
  .join('\n');

// Extract package names mentioned in changesets (format:
//   '@oktis-works/name': patch)
const packagesInChangesets = new Set();
const changesetPackageRegex = /'@oktis-works\/([^']+)'\s*:/g;
let m;
while ((m = changesetPackageRegex.exec(changesetContent)) !== null) {
  packagesInChangesets.add(m[1]);
}

function currentVersionOf(pkgJsonPath) {
  try {
    return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------------------
// 3. For each changed package, verify changeset AND CHANGELOG
// ---------------------------------------------------------------------------
for (const pkgName of changedPackages) {
  const pkgDir = join(PACKAGES_DIR, pkgName);
  const pkgJsonPath = join(pkgDir, 'package.json');
  const changelogPath = join(pkgDir, 'CHANGELOG.md');

  if (!existsSync(pkgJsonPath)) continue;

  let pkgNameFromJson;
  try {
    pkgNameFromJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name;
  } catch {
    continue;
  }

  const shortName = pkgNameFromJson
    ? pkgNameFromJson.replace('@oktis-works/', '')
    : pkgName;

  // --- Verification 1: changeset exists for this package ---
  if (!packagesInChangesets.has(shortName)) {
    errors.push({
      package: shortName,
      rule: 'missing-changeset',
      message: `Package "${shortName}" was changed but no changeset in .changeset/*.md declares it.
Create a changeset: bun run changeset → select "${shortName}" → type (patch/minor/major) → description in English.
Without a changeset, the package is not bumped nor published.`,
    });
  }

  // --- Verification 2: CHANGELOG.md exists and has entry for current version ---
  if (!existsSync(changelogPath)) {
    errors.push({
      package: shortName,
      rule: 'missing-changelog',
      message: `Package "${shortName}" has no CHANGELOG.md.
Create packages/${pkgName}/CHANGELOG.md with an entry for the current version (e.g. \`## ${currentVersion(pkgJsonPath)}\` + description of the change).
The CHANGELOG is documentation for the consumer — it is not generated automatically by the changeset.`,
    });
  } else {
    const changelogContent = readFileSync(changelogPath, 'utf8');
    const pkgVersion = currentVersion(pkgJsonPath);

    if (!changelogContent.includes(`## ${pkgVersion}`)) {
      errors.push({
        package: shortName,
        rule: 'changelog-missing-version-entry',
        message: `Package "${shortName}" has CHANGELOG.md but no entry for the current version "${pkgVersion}".
Add a block \`## ${pkgVersion}\` with \`### Patch Changes\` (or Minor/Major) and describe what changed.
The changeset alone does not write the descriptive text — it must be reviewed and confirmed in the CHANGELOG.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(
    `\nCHANGELOG + Changeset enforcement: ${errors.length} error(s) found\n`
  );
  console.error(
    'Rule: every package change requires a changeset (.changeset/*.md) AND an entry in the package CHANGELOG.md.'
  );
  console.error(
    'The two are mandatory and complementary — never one or the other.\n'
  );

  for (const e of errors) {
    console.error(`  ${e.package} [${e.rule}]`);
    console.error(`     ${e.message}\n`);
  }

  console.error('How to fix:');
  console.error(
    '  1. bun run changeset          → create a changeset for each changed package'
  );
  console.error(
    '  2. Edit the CHANGELOG.md of each changed package, adding an entry for the current version'
  );
  console.error(
    '  3. Commit both before opening/merging the PR'
  );
  process.exit(1);
}

console.log(
  `CHANGELOG + Changeset enforcement approved: ${changedPackages.length} package(s) changed, all with changeset and CHANGELOG.md updated.`
);
