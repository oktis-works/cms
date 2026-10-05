// @oktis-works/cms - Project Configuration Loader

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectConfig {
  name: string;
  // Conexão de banco NÃO mora aqui: fonte única é o .env
  // (DATABASE_URL ou DB_*) — ver @oktis-works/config loadConfig().
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
    storage: {
      driver: (process.env['STORAGE_DRIVER'] as ProjectConfig['storage']['driver']) ?? 'local',
      localPath: process.env['STORAGE_LOCAL_PATH'] ?? '.data/storage',
    },
    themesDir: 'themes',
    pluginsDir: 'plugins',
    activeTheme: process.env['ACTIVE_THEME'] ?? '',
    ports: {
      api: Number(process.env['PORT'] ?? 3000),
      admin: Number(process.env['ADMIN_PORT'] ?? 3011),
      web: Number(process.env['WEB_PORT'] ?? 3001),
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
      storage: { ...base.storage, ...(raw.storage ?? {}) },
      ports: { ...base.ports, ...(raw.ports ?? {}) },
    };
  } catch (error) {
    throw new Error(`Invalid config at ${configPath}: ${error instanceof Error ? error.message : error}`);
  }
}
