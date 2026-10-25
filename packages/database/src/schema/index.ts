// @oktis-works/database - Schema Export

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const schemas = new Map<string, string>();

export function getSchema(provider: 'postgres' | 'mysql' | 'mariadb' = 'postgres'): string {
  const cached = schemas.get(provider);
  if (cached) return cached;

  const filename = provider === 'postgres' ? 'schema.sql' : `schema.${provider}.sql`;
  const schemaPath = join(__dirname, filename);
  const loaded = readFileSync(schemaPath, 'utf-8');
  schemas.set(provider, loaded);
  return loaded;
}

// For backward compatibility
export const schema = getSchema();
