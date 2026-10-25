#!/usr/bin/env node
import { existsSync } from 'node:fs';

const legacyFiles = [
  'apps/api/src/index.js',
  'apps/api/src/routes/plugins/index.js',
];

const stale = legacyFiles.filter((file) => existsSync(file));
if (stale.length > 0) {
  console.error(`Legacy API plugin sources must be removed; TypeScript is canonical:\n${stale.join('\n')}`);
  process.exit(1);
}

console.log('API plugin source drift check passed.');
