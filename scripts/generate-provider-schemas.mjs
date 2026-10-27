import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const source = await readFile(join(root, 'packages/database/src/schema/schema.sql'), 'utf8');

function convert(provider) {
  let sql = source
    .replace(/CREATE\s+EXTENSION[\s\S]*?;\s*/gi, '')
    .replace(/CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS[^;]+;\s*/gi, '')
    .replace(/GRANT\s+USAGE\s+ON\s+SCHEMA[^;]+;\s*/gi, '')
    .replace(/ALTER\s+TABLE\s+[^;]+\s+(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY\s*;\s*/gi, '')
    .replace(/DO\s*\$\$[\s\S]*?\$\$\s*;\s*/gi, '')
    .replace(/\bJSONB\b/gi, 'JSON')
    .replace(/\bUUID\b(?!\s*\()/gi, 'CHAR(36)')
    .replace(/\bgen_random_uuid\(\)/gi, '(UUID())')
    .replace(/\bTIMESTAMP\s+WITH\s+TIME\s+ZONE\b/gi, 'TIMESTAMP')
    .replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP')
    .replace(/\bBYTEA\b/gi, 'LONGBLOB')
    .replace(/\bDOUBLE\s+PRECISION\b/gi, 'DOUBLE')
    .replace(/"group"/gi, '`group`')
    .replace(/::(?:jsonb|json|uuid|text|integer|int|boolean|bigint|timestamptz|char(?:\(36\))?)/gi, '')
    .replace(/CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql\s*;\s*/gi, '')
    .replace(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_field_values_updated[^;]*;\s*CREATE\s+TRIGGER\s+trg_field_values_updated[\s\S]*?EXECUTE\s+FUNCTION\s+update_field_values_timestamp\(\)\s*;/gi,
      'DROP TRIGGER IF EXISTS trg_field_values_updated;\nCREATE TRIGGER trg_field_values_updated BEFORE UPDATE ON field_values FOR EACH ROW SET NEW.updated_at = NOW();')
    .replace(/jsonb_build_object\(/gi, 'JSON_OBJECT(')
    .replace(/(JSON\s+(?:NOT\s+NULL\s+)?DEFAULT)\s+'([^']*)'/gi, "$1 ('$2')")
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/gi, 'CREATE $1INDEX')
    .replace(/\bDEFAULT\s+NOW\(\)/gi, 'DEFAULT CURRENT_TIMESTAMP')
    .replace(/(CREATE\s+(?:UNIQUE\s+)?INDEX[^;]+)\s+WHERE\s+[^;]+(?=;)/gi, '$1');

  const createdColumns = new Map();
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/gi)) {
    createdColumns.set(match[1].toLowerCase(), match[2]);
  }
  sql = sql.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)[\s\S]*?;\s*/gi,
    (statement, table, column) => {
      const body = createdColumns.get(table.toLowerCase());
      return body && new RegExp(`\\b${column}\\b`, 'i').test(body)
        ? ''
        : statement.replace(/\s+IF\s+NOT\s+EXISTS/i, '');
    });

  sql = sql.replace(/CREATE UNIQUE INDEX idx_themes_single_active[\s\S]*?;\n/i,
    "ALTER TABLE themes ADD COLUMN active_scope CHAR(36);\nCREATE UNIQUE INDEX idx_themes_single_active ON themes(active_scope);\nCREATE TRIGGER themes_active_scope_insert BEFORE INSERT ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);\nCREATE TRIGGER themes_active_scope_update BEFORE UPDATE ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);\n");
  sql = sql.replaceAll("DEFAULT 'postgres'", `DEFAULT '${provider}'`);
  // MySQL: prefix length for index on VARCHAR(2048) to stay under 3072 byte limit (utf8mb4 = 4 bytes/char)
  // tenant_id CHAR(36) = 144 bytes, so prefix ≤ (3072-144)/4 = 732. Use 255 for safety.
  sql = sql.replace(
    /CREATE INDEX idx_url_redirects_tenant_source ON url_redirects\(tenant_id, source_path\);/,
    "CREATE INDEX idx_url_redirects_tenant_source ON url_redirects(tenant_id, source_path(255));"
  );
  sql = sql.replace(/\bkey\b/g, '`key`').replace(/\bschema\b/g, '`schema`');
  return `-- Generated from schema.sql for ${provider}. Do not edit by hand.\n${sql}`;
}

for (const provider of ['mysql', 'mariadb']) {
  await writeFile(join(root, `packages/database/src/schema/schema.${provider}.sql`), convert(provider));
}
