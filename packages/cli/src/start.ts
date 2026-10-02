// @oktis-works/cms - Project Start (API + Admin + Web)

import { spawn, type ChildProcess } from 'node:child_process';
import { loadProjectConfig } from './project-config.js';
import { clearPids, recordPid } from './runtime-state.js';

const children: ChildProcess[] = [];

function spawnApp(label: string, command: string, args: string[], env: Record<string, string>): void {
  console.log(`[start] ${label}: ${command} ${args.join(' ')}`);

  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  recordPid(label, child.pid ?? -1);

  child.on('error', (error) => {
    console.error(`[start] ${label} falhou:`, error.message);
  });

  children.push(child);
}

export async function startProject(options: Record<string, string> = {}): Promise<void> {
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

  if (onlyApi) {
    spawnApp('api', 'bunx', ['@oktis-works/api'], { PORT: String(config.ports.api) });
  } else {
    spawnApp('api', 'bunx', ['@oktis-works/api'], { PORT: String(config.ports.api) });

    if (includeAdmin) {
      spawnApp('admin', 'bunx', ['@oktis-works/admin'], { PORT: String(config.ports.admin), API_URL: `http://localhost:${config.ports.api}` });
    }

    if (includeWeb) {
      spawnApp('web', 'bunx', ['@oktis-works/web'], { PORT: String(config.ports.web), API_URL: `http://localhost:${config.ports.api}` });
    }

    if (includeWorker) {
      // Filas/jobs (bullmq) — REDIS_* vem do .env do projeto. Sem Redis, o
      // worker só loga erros de conexão; os demais apps seguem rodando.
      spawnApp('worker', 'bunx', ['@oktis-works/worker'], {});
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
