#!/usr/bin/env node
/**
 * Build packages in dependency order to avoid "Cannot find module" errors.
 * 
 * Dependency graph:
 * 1. validation (no internal deps)
 * 2. types (depends on validation)
 * 3. config (depends on types)
 * 4. database (depends on types, config)
 * 5. auth (depends on types, config, database)
 * 6. plugin-sdk (depends on types)
 * 7. plugin-runtime (depends on types, validation, plugin-sdk)
 * 8. core (depends on types, config, database, auth, validation, plugin-runtime)
 * 9. theme-sdk (depends on types)
 * 10. theme-runtime (depends on types, theme-sdk)
 * 11. api-client (depends on types)
 * 12. ui (depends on types, validation)
 * 13. cli (depends on types, config, validation, core)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packages = [
  // Level 0: No internal deps
  'validation',
  // Level 1: Depends on validation
  'types',
  // Level 2: Depends on types
  'config',
  // Level 3: Depends on types, config
  'database',
  // Level 4: Depends on types, config, database
  'auth',
  // Level 5: Depends on types
  'plugin-sdk',
  // Level 6: Depends on types, validation, plugin-sdk
  'plugin-runtime',
  // Level 7: Depends on types, config, database, auth, validation, plugin-runtime
  'core',
  // Level 3/4: Depends on types
  'theme-sdk',
  'api-client',
  'ui',
  // Level 4/5: Depends on multiple
  'theme-runtime',
  // Level 5: Depends on theme-runtime
  'cli',
];

async function buildPackage(pkg) {
  const pkgPath = path.join(__dirname, '..', 'packages', pkg);
  if (!fs.existsSync(path.join(pkgPath, 'package.json'))) {
    console.log(`⚠️  Skipping ${pkg} - package.json not found`);
    return;
  }
  
  console.log(`\n📦 Building ${pkg}...`);
  try {
    execSync('bun run build', { cwd: pkgPath, stdio: 'inherit' });
    console.log(`✅ ${pkg} built successfully`);
  } catch {
    console.error(`❌ Failed to build ${pkg}`);
    process.exit(1);
  }
}

async function main() {
  console.log('🏗️  Building packages in dependency order...\n');
  
  for (const pkg of packages) {
    await buildPackage(pkg);
  }
  
  console.log('\n🎉 All packages built successfully!');
}

main().catch(console.error);