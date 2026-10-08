#!/usr/bin/env node
// Build packages in dependency order

import { spawnSync } from 'child_process';

const levels = [
  // Level 0: No internal dependencies
  ['@oktis-works/validation', '@oktis-works/config', '@oktis-works/theme-sdk', '@oktis-works/plugin-sdk'],
  
  // Level 1: Depend on level 0
  ['@oktis-works/types', '@oktis-works/database'],
  
  // Level 2: Depend on level 0 + 1
  ['@oktis-works/plugin-runtime', '@oktis-works/theme-runtime'],
  
  // Level 3: Depend on level 0 + 1 + 2
  ['@oktis-works/core', '@oktis-works/auth', '@oktis-works/api-client'],
  
  // Level 4: Depend on level 0 + 1 + 2 + 3
  ['@oktis-works/ui'],
  
  // Level 5: Apps and cli
  ['@oktis-works/api', '@oktis-works/web', '@oktis-works/worker', '@oktis-works/cms'],
  
  // Level 5: Admin
  ['@oktis-works/admin'],
];

async function main() {
  for (const level of levels) {
    console.log(`\n=== Building level: ${level.join(', ')} ===`);
    for (const pkg of level) {
      console.log(`→ Building ${pkg}...`);
      const result = spawnSync('bun', ['run', '--filter', pkg, 'build'], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      if (result.status !== 0) {
        console.error(`\n✗ Failed to build ${pkg}`);
        process.exit(1);
      }
    }
  }
  console.log('\n✓ All packages built successfully');
}

main();
