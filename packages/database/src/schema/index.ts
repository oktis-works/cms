// @oktis-works/database - Schema Export

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

let _schema: string | null = null;

export function getSchema(): string {
  if (_schema) return _schema;

  // __dirname já é o diretório schema/; o arquivo fica ao lado deste módulo.
  const schemaPath = join(__dirname, 'schema.sql');
  _schema = readFileSync(schemaPath, 'utf-8');
  return _schema;
}

// For backward compatibility
export const schema = getSchema();
