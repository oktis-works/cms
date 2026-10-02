// @oktis-works/core - Storage Driver Factory

import { LocalStorageDriver } from './drivers/local.js';
import { S3StorageDriver } from './drivers/s3.js';
import type { StorageDriver } from './driver.js';

export type StorageDriverName = 'local' | 's3' | 'r2' | 'minio';

/**
 * Drivers S3-compatíveis com defaults por provedor:
 * - s3: AWS (endpoint opcional)
 * - r2: Cloudflare R2 (region auto, endpoint obrigatório via env)
 * - minio: MinIO self-hosted (path-style sempre ligado)
 */
const S3_LIKE = new Set(['s3', 'r2', 'minio']);

function resolveS3LikeConfig(name: 's3' | 'r2' | 'minio'): ConstructorParameters<typeof S3StorageDriver>[0] {
  if (name === 's3') {
    return {
      name: 's3',
      bucket: process.env['STORAGE_S3_BUCKET'],
      region: process.env['STORAGE_S3_REGION'] ?? 'us-east-1',
      endpoint: process.env['STORAGE_S3_ENDPOINT'],
    };
  }

  if (name === 'r2') {
    const accountId = process.env['STORAGE_R2_ACCOUNT_ID'];
    const endpoint = process.env['STORAGE_R2_ENDPOINT'] ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    if (!endpoint) {
      throw new Error('R2 requer STORAGE_R2_ACCOUNT_ID ou STORAGE_R2_ENDPOINT');
    }

    return {
      name: 'r2',
      bucket: process.env['STORAGE_R2_BUCKET'] ?? process.env['STORAGE_S3_BUCKET'],
      region: 'auto',
      endpoint,
      forcePathStyle: true,
    };
  }

  return {
    name: 'minio',
    bucket: process.env['STORAGE_MINIO_BUCKET'] ?? process.env['STORAGE_S3_BUCKET'],
    region: process.env['STORAGE_MINIO_REGION'] ?? 'us-east-1',
    endpoint: process.env['STORAGE_MINIO_ENDPOINT'] ?? 'http://localhost:9000',
    forcePathStyle: true,
  };
}

export function createStorageDriver(name?: string): StorageDriver {
  const driver = name ?? process.env['STORAGE_DRIVER'] ?? 'local';

  switch (driver) {
    case 'local':
      return new LocalStorageDriver();
    case 's3':
    case 'r2':
    case 'minio':
      return new S3StorageDriver(resolveS3LikeConfig(driver));
    default:
      throw new Error(`Storage driver "${driver}" não suportado (use: local, s3, r2, minio)`);
  }
}

export { S3_LIKE };

export const storage = createStorageDriver();

export { StorageMigrator, createMigrator } from './migrator.js';
export type { MigrationResult } from './migrator.js';

export type { StorageDriver, StorageObject } from './driver.js';
