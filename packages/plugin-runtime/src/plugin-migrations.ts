// @oktis-works/plugin-runtime - Plugin schema migrations (Item 20 do plano)
//
// Manifest v2 `migrations[]` SQL files run in order at plugin boot (platform
// scope), each in its own transaction, recorded in `plugin_schema_migrations`
// with a checksum. Re-runs skip applied files; a changed checksum is DRIFT —
// the plugin fails isolated instead of running mutated SQL.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { BootstrapPluginsSql } from './bootstrap.js';

export interface PluginMigrationResult {
  applied: string[];
  skipped: string[];
  /** Files whose checksum differs from the applied record (never executed). */
  drift: string[];
}

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS plugin_schema_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plugin_name, path)
)`;

function checksumOf(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Applies the plugin's `manifest.migrations[]` in order. Each file runs as a
 * single atomic statement batch (`BEGIN; …; COMMIT;`). Applied files are
 * skipped by checksum; a checksum mismatch is reported as drift and blocks
 * the plugin from booting with mutated SQL.
 */
export async function applyPluginMigrations(
  sql: BootstrapPluginsSql,
  pluginName: string,
  pluginDir: string,
  migrations: readonly string[]
): Promise<PluginMigrationResult> {
  const result: PluginMigrationResult = { applied: [], skipped: [], drift: [] };
  if (!Array.isArray(migrations) || migrations.length === 0) return result;

  await sql.unsafe(MIGRATIONS_TABLE_SQL, []);

  for (const relative of migrations) {
    // Same traversal guards as manifest validation (defense in depth).
    if (typeof relative !== 'string' || relative.includes('..') || relative.startsWith('/')) {
      result.drift.push(`${relative} (invalid path)`);
      continue;
    }

    let content: string;
    try {
      content = await readFile(join(pluginDir, relative), 'utf8');
    } catch (error) {
      result.drift.push(`${relative} (could not be read: ${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const checksum = checksumOf(content);
    const appliedRows = (await sql.unsafe(
      'SELECT checksum FROM plugin_schema_migrations WHERE plugin_name = $1 AND path = $2',
      [pluginName, relative]
    )) as Array<{ checksum?: string }>;
    const existing = appliedRows[0]?.checksum;

    if (existing === checksum) {
      result.skipped.push(relative);
      continue;
    }
    if (existing !== undefined) {
      // Drift: the file changed after being applied — blocks the plugin boot.
      result.drift.push(`${relative} (checksum divergente do aplicado)`);
      continue;
    }

    // One transaction per migration: a single batch (the Postgres simple
    // protocol executes multi-statement strings atomically; the explicit
    // BEGIN/COMMIT pins the semantics).
    await sql.unsafe(`BEGIN;\n${content}\nCOMMIT;`, []);
    await sql.unsafe(
      'INSERT INTO plugin_schema_migrations (id, plugin_name, path, checksum) VALUES ($1, $2, $3, $4)',
      [randomUUID(), pluginName, relative, checksum]
    );
    result.applied.push(relative);
  }

  return result;
}
