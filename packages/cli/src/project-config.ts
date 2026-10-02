// @oktis-works/cms - Project Configuration Loader

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectConfig {
  name: string;
  database: {
    url?: string;
    host?: string;
    port?: number;
    name?: string;
    user?: string;
    password?: string;
  };
  storage: {
    driver: 'local' | 's3' | 'r2' | 'minio';
    localPath?: string;
  };
  themesDir: string;
  pluginsDir: string;
  activeTheme: string;
  ports: {
    api: number;
    admin: number;
    web: number;
  };
}

export const DEFAULT_CONFIG_FILENAME = 'okcms.config.json';

export function defaultProjectConfig(name = 'my-okcms-site'): ProjectConfig {
  return {
    name,
    database: {
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      name: process.env['DB_NAME'] ?? 'okcms',
      user: process.env['DB_USER'] ?? 'postgres',
      password: process.env['DB_PASSWORD'] ?? '',
    },
    storage: {
      driver: (process.env['STORAGE_DRIVER'] as ProjectConfig['storage']['driver']) ?? 'local',
      localPath: process.env['STORAGE_LOCAL_PATH'] ?? '.data/storage',
    },
    themesDir: 'themes',
    pluginsDir: 'plugins',
    activeTheme: process.env['ACTIVE_THEME'] ?? '',
    ports: {
      api: Number(process.env['PORT'] ?? 3000),
      admin: Number(process.env['ADMIN_PORT'] ?? 3001),
      web: Number(process.env['WEB_PORT'] ?? 3002),
    },
  };
}

export function loadProjectConfig(cwd = process.cwd()): ProjectConfig {
  const configPath = join(cwd, DEFAULT_CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return defaultProjectConfig();
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<ProjectConfig>;
    const base = defaultProjectConfig(raw.name);

    return {
      ...base,
      ...raw,
      database: { ...base.database, ...(raw.database ?? {}) },
      storage: { ...base.storage, ...(raw.storage ?? {}) },
      ports: { ...base.ports, ...(raw.ports ?? {}) },
    };
  } catch (error) {
    throw new Error(`Config inválida em ${configPath}: ${error instanceof Error ? error.message : error}`);
  }
}
