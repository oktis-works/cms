// @oktis-works/database - Schema Export

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const schemas = new Map<string, string>();

export function getSchema(): string {
  const cached = schemas.get('postgres');
  if (cached) return cached;

  const schemaPath = join(__dirname, 'schema.sql');
  const loaded = readFileSync(schemaPath, 'utf-8');
  schemas.set('postgres', loaded);
  return loaded;
}

// For backward compatibility
export const schema = getSchema();
