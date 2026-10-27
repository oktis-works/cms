import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sourceDir = join(root, 'migrations');

function convert(sql, provider) {
  let value = sql
    .replace(/provider=postgres/g, `provider=${provider}`)
    .replace(/CREATE\s+EXTENSION[\s\S]*?;\s*/gi, '')
    .replace(/CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS[^;]+;\s*/gi, '')
    .replace(/GRANT\s+USAGE\s+ON\s+SCHEMA[^;]+;\s*/gi, '')
    .replace(/ALTER\s+TABLE\s+[^;]+\s+(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY\s*;\s*/gi, '')
    .replace(/DO\s*\$\$[\s\S]*?\$\$\s*;\s*/gi, '')
    .replace(/CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$\s*LANGUAGE\s+['"]?plpgsql['"]?\s*;\s*/gi, '')
    .replace(/\bJSONB\b/gi, 'JSON')
    .replace(/\bUUID\b(?!\s*\()/gi, 'CHAR(36)')
    .replace(/\bgen_random_uuid\(\)/gi, '(UUID())')
    .replace(/\bTIMESTAMP\s+WITH\s+TIME\s+ZONE\b/gi, 'TIMESTAMP')
    .replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP')
    .replace(/"group"/gi, '`group`')
    .replace(/::(?:jsonb|json|uuid|text|integer|int|boolean|bigint|timestamptz)/gi, '')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/gi, 'CREATE $1INDEX')
    // MySQL/MariaDB don't support ADD COLUMN IF NOT EXISTS - remove it
    .replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+/gi, 'ALTER TABLE $1 ADD COLUMN ')
    .replace(/\bON\s+CONFLICT\s*\([^)]*\)\s+DO\s+NOTHING/gi, '')
    .replace(/\bEXCLUDED\.([a-zA-Z0-9_]+)/gi, 'VALUES($1)')
    .replace(/\bON\s+CONFLICT\s*\([^)]*\)\s+DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE')
    .replace(/\bcurrent_setting\([^)]*\)/gi, 'NULL')
    .replace(/\bDEFAULT\s+NOW\(\)/gi, 'DEFAULT CURRENT_TIMESTAMP')
    .replace(/(CREATE\s+(?:UNIQUE\s+)?INDEX[^;]+)\s+WHERE\s+[^;]+(?=;)/gi, '$1')
    .replace(/\bAT\s+TIME\s+ZONE\s+'[^']+'/gi, '')
    .replace(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+([a-zA-Z0-9_]+)\s+ON\s+[a-zA-Z0-9_]+/gi, 'DROP TRIGGER IF EXISTS $1')
    .replace(/DROP\s+POLICY[^;]+;\s*/gi, '')
    .replace(/ALTER\s+TABLE\s+[^;]+\s+(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY\s*;\s*/gi, '')
    .replace(/CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)[\s\S]*?BEFORE\s+UPDATE\s+ON\s+([a-zA-Z0-9_]+)[\s\S]*?EXECUTE\s+FUNCTION\s+([a-zA-Z0-9_]+)\(\)\s*;/gi,
      'CREATE TRIGGER $1 BEFORE UPDATE ON $2 FOR EACH ROW SET NEW.updated_at = CURRENT_TIMESTAMP;');
  return value.replace(/\bkey\b/g, '`key`').replace(/\bschema\b/g, '`schema`');
}

function providerMigration(file, provider, original) {
  const header = original.match(/^--\s*@okcms[^\n]*/m)?.[0]?.replace('provider=postgres', `provider=${provider}`) ?? `-- @okcms domain=core_schema provider=${provider}`;
  const version = file.slice(1, 4);
  const custom = {
    '004': `SELECT 1;`,
    '010': `ALTER TABLE themes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE themes ADD COLUMN IF NOT EXISTS active_scope CHAR(36);
CREATE UNIQUE INDEX idx_themes_name_unique ON themes(name);
CREATE UNIQUE INDEX idx_themes_single_active ON themes(active_scope);
CREATE TRIGGER themes_active_scope_insert BEFORE INSERT ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);
CREATE TRIGGER themes_active_scope_update BEFORE UPDATE ON themes FOR EACH ROW SET NEW.active_scope = IF(NEW.status = 'ACTIVE', IFNULL(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'), NULL);`,
    '019': `ALTER TABLE content ADD CONSTRAINT uq_content_tenant_type_slug UNIQUE (tenant_id, type, slug);`,
    '020': `ALTER TABLE menus ADD CONSTRAINT uq_menus_tenant_slug UNIQUE (tenant_id, slug);`,
    '021': `UPDATE content SET body = JSON_UNQUOTE(body) WHERE JSON_TYPE(body) = 'STRING';`,
    '022': `CREATE TABLE IF NOT EXISTS theme_config_versions (\n  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),\n  theme_id CHAR(36) NOT NULL REFERENCES themes(id) ON DELETE CASCADE,\n  config JSON NOT NULL, user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,\n  change_summary TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW()\n);`,
    '023': `SELECT 1;`,
    '024': `SELECT 1;`,
    '025': `CREATE TABLE IF NOT EXISTS content_value_migration_conflicts (\n  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),\n  content_id CHAR(36) NOT NULL REFERENCES content(id) ON DELETE CASCADE,\n  field_name VARCHAR(255) NOT NULL, sources JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),\n  UNIQUE(content_id, field_name)\n);\nUPDATE content SET body = JSON_MERGE_PATCH(COALESCE(data, JSON_OBJECT()), COALESCE(body, JSON_OBJECT())), data = JSON_OBJECT();\nUPDATE content_versions SET body = COALESCE(body, JSON_OBJECT());`,
    '026': `SELECT 1; -- MySQL: ALTER TABLE DROP CONSTRAINT IF EXISTS not supported; constraint may not exist`,
    '027': `SELECT 1; -- MySQL: schema already includes parent_id, url_redirects table, and indexes`,
  }[version];
  if (!custom) return convert(original, provider);
  const down = version === '019'
    ? 'ALTER TABLE content DROP INDEX uq_content_tenant_type_slug;'
    : version === '020'
      ? 'ALTER TABLE menus DROP INDEX uq_menus_tenant_slug;'
      : version === '025'
        ? 'DROP TABLE IF EXISTS content_value_migration_conflicts;'
        : '';
  return `${header}\n-- +migrate Up\n${custom}\n-- +migrate Down\n${down}\n`;
}

const files = (await readdir(sourceDir)).filter((file) => /^V\d+__.*\.sql$/.test(file));
for (const provider of ['mysql', 'mariadb']) {
  const targetDir = join(sourceDir, provider);
  await mkdir(targetDir, { recursive: true });
  for (const file of files) {
    const original = await readFile(join(sourceDir, file), 'utf8');
    const generated = providerMigration(file, provider, original)
      .replace(/[ \t]+$/gm, '')
      .replace(/\n+$/g, '\n');
    await writeFile(join(targetDir, file), generated);
  }
}
