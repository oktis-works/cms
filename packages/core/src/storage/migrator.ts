// @oktis-works/core - Media Storage Migration

import { getConnection } from '@oktis-works/database';
import { createStorageDriver } from './index.js';
import type { StorageDriver } from './driver.js';

export interface MigrationResult {
  migrated: number;
  failed: number;
  errors: Array<{ id: string; filename: string; error: string }>;
}

export class StorageMigrator {
  constructor(
    private readonly source: StorageDriver,
    private readonly target: StorageDriver
  ) {}

  async migrateAll(): Promise<MigrationResult> {
    const sql = getConnection();
    const result: MigrationResult = { migrated: 0, failed: 0, errors: [] };

    const rows = await sql.unsafe('SELECT id, path, mime_type, filename FROM media') as unknown as Array<Record<string, unknown>>;

    for (const row of rows) {
      const id = String(row['id']);
      const key = String(row['path']);
      const mimeType = String(row['mime_type'] ?? 'application/octet-stream');
      const filename = String(row['filename'] ?? key);

      try {
        if (!(await this.source.exists(key))) {
          result.failed += 1;
          result.errors.push({ id, filename, error: 'arquivo de origem não encontrado' });
          continue;
        }

        const body = await this.source.get(key);
        if (!body) {
          result.failed += 1;
          result.errors.push({ id, filename, error: 'falha ao ler arquivo de origem' });
          continue;
        }

        await this.target.put(key, body, mimeType);
        result.migrated += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({ id, filename, error: String(error instanceof Error ? error.message : error) });
      }
    }

    return result;
  }
}

export function createMigrator(fromDriver: string, toDriver: string): StorageMigrator {
  return new StorageMigrator(createStorageDriver(fromDriver), createStorageDriver(toDriver));
}
