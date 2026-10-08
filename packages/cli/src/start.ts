// @oktis-works/cms - Project Start (API + Admin + Web)

import { spawn, type ChildProcess } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { loadEnvFile } from './env-file.js';
import { loadProjectConfig } from './project-config.js';
import { clearPids, recordPid } from './runtime-state.js';

const children: ChildProcess[] = [];

/**
 * Carrega o .env do projeto sem sobrescrever variáveis já exportadas pelo
 * shell. Isso é importante tanto para `okcms start` quanto para o processo
 * filho da API: configurações como CORS_ORIGINS e TRUSTED_ORIGINS precisam
 * chegar aos três processos, mas segredos fornecidos pelo ambiente têm
 * precedência.
 */
function loadProjectEnv(cwd = process.cwd()): void {
  const values = loadEnvFile(join(cwd, '.env')).toRecord();
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function spawnApp(label: string, command: string, args: string[], env: Record<string, string>): void {
  console.log(`[start] ${label}: ${command} ${args.join(' ')}`);

  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  recordPid(label, child.pid ?? -1);

  child.on('error', (error) => {
    console.error(`[start] ${label} failed:`, error.message);
  });

  children.push(child);
}

export async function startProject(options: Record<string, string> = {}): Promise<void> {
  loadProjectEnv();
  const config = loadProjectConfig();

  const anyFlag =
    options['api'] !== undefined ||
    options['admin'] !== undefined ||
    options['web'] !== undefined ||
    options['worker'] !== undefined;
  const defaultAll = !anyFlag && options['all'] === undefined;

  const onlyApi = options['api'] !== undefined && !defaultAll;
  const includeAdmin = defaultAll || options['admin'] !== undefined || options['all'] !== undefined;
  const includeWeb = defaultAll || options['web'] !== undefined || options['all'] !== undefined;
  const includeWorker = defaultAll || options['worker'] !== undefined || options['all'] !== undefined;

  process.env['ACTIVE_THEME'] = config.activeTheme || process.env['ACTIVE_THEME'] || '';
  const mediaEnv: Record<string, string> = {};
  if (config.storage.driver === 'local') {
    mediaEnv['UPLOAD_DIR'] = process.env['UPLOAD_DIR'] || (isAbsolute(config.storage.localPath ?? '')
      ? config.storage.localPath!
      : resolve(process.cwd(), config.storage.localPath ?? '.data/storage'));
  }

  if (onlyApi) {
    spawnApp('api', 'bunx', ['@oktis-works/api'], { PORT: String(config.ports.api), ...mediaEnv });
  } else {
    spawnApp('api', 'bunx', ['@oktis-works/api'], { PORT: String(config.ports.api), ...mediaEnv });

    if (includeAdmin) {
      // Empty PUBLIC_API_URL must not make the Admin call itself on :3011.
      // This also keeps `okcms start` consistent across WSL, Linux and Windows.
      const apiUrl = process.env['PUBLIC_API_URL']?.trim()
        || `http://localhost:${config.ports.api}`;
      spawnApp('admin', 'bunx', ['@oktis-works/admin'], { PORT: String(config.ports.admin), PUBLIC_API_URL: apiUrl });
    }

    if (includeWeb) {
      spawnApp('web', 'bunx', ['@oktis-works/web'], { PORT: String(config.ports.web), API_URL: `http://localhost:${config.ports.api}` });
    }

    if (includeWorker) {
      // Filas/jobs (bullmq) — REDIS_* vem do .env do projeto. Sem Redis, o
      // worker só loga erros de conexão; os demais apps seguem rodando.
      spawnApp('worker', 'bunx', ['@oktis-works/worker'], mediaEnv);
    }
  }

  const shutdown = (): void => {
    for (const child of children) {
      child.kill('SIGTERM');
    }
    clearPids();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {
    // mantém o processo vivo enquanto os filhos estiverem rodando
  });
}
