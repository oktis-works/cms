// @oktis-works/cms - `okcms deploy` (novo comando unificado)
//
// Menu interativo para escolher o tipo de deploy:
//
//   1. Docker blue/green  (padrão para produção)
//   2. PM2 (processos no host)
//
// - Docker: usa o fluxo blue/green completo (build → migrations → swap → worker)
// - PM2: instala/atualiza pacotes + configura ecosystem.config.js + pm2 reload
//
// Histórico unificado em `.deploy/update-history.json`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prompt } from './prompt.js';
import { defaultRunner, type Runner } from './docker.js';
import { deployBlueGreen } from './bluegreen.js';
import { resolveDeployChoices } from './update.js';

export type DeployTarget = 'docker' | 'pm2';

export interface DeployOptions {
  cwd?: string;
  /** `--target docker|pm2` (pula o menu). */
  target?: string;
  /** `--yes`: sem prompts, usa defaults. */
  yes?: boolean;
  /** `--force`: permite rodar dentro de container (não recomendado). */
  force?: boolean;
  /** `--no-cache`: build Docker sem cache. */
  noCache?: boolean;
  /** `--install`: atualiza pacotes antes do deploy PM2. */
  install?: boolean;
  runner?: Runner;
  prompt?: Prompt;
}

const PM2_ECOSYSTEM_TEMPLATE = `// ecosystem.config.js — gerado por okcms deploy (PM2)
// Edite conforme necessário e rode: pm2 reload all

module.exports = {
  apps: [
    {
      name: 'okcms-api',
      script: 'bunx',
      args: '@oktis-works/api',
      env: { NODE_ENV: 'production', PORT: 3000 },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'okcms-admin',
      script: 'bunx',
      args: '@oktis-works/admin',
      env: { NODE_ENV: 'production', PORT: 3011 },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'okcms-web',
      script: 'bunx',
      args: '@oktis-works/web',
      env: { NODE_ENV: 'production', WEB_PORT: 3001 },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'okcms-worker',
      script: 'bunx',
      args: '@oktis-works/worker',
      env: { NODE_ENV: 'production', WORKER_MODE: 'pm2' },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
`;

/** Verifica se PM2 está instalado globalmente. */
async function checkPm2Installed(runner: Runner): Promise<boolean> {
  const result = runner('pm2', ['--version'], { timeoutMs: 10_000 });
  return result.ok;
}

/** Instala PM2 globalmente via bun/npm. */
async function installPm2(runner: Runner): Promise<boolean> {
  const bunResult = runner('bun', ['add', '-g', 'pm2'], { inherit: true, timeoutMs: 120_000 });
  if (bunResult.ok) return true;

  const npmResult = runner('npm', ['install', '-g', 'pm2'], { inherit: true, timeoutMs: 120_000 });
  return npmResult.ok;
}

/** Gera/atualiza ecosystem.config.js se não existir ou se forçado. */
function ensureEcosystemConfig(cwd: string, force = false): boolean {
  const path = join(cwd, 'ecosystem.config.js');
  if (existsSync(path) && !force) return false;
  writeFileSync(path, PM2_ECOSYSTEM_TEMPLATE, 'utf-8');
  return true;
}

/** Snapshot do package.json para rollback PM2. */
function snapshotPackageJson(cwd: string): string {
  const path = join(cwd, 'package.json');
  return readFileSync(path, 'utf-8');
}

/** Atualiza pacotes no modo PM2 (mesmo fluxo do download). */
async function pm2UpdatePackages(
  cwd: string,
  runner: Runner,
  prompt: Prompt,
  install: boolean
): Promise<{ ok: boolean; scan: Awaited<ReturnType<typeof import('./update.js').scanOutdated>> }> {
  const { scanOutdated } = await import('./update.js');
  const scan = await scanOutdated(cwd, (m) => prompt.write(m + '\n'));

  if (!scan.installed) {
    prompt.error('Nenhum pacote @oktis-works/* instalado. Rode `bun install` primeiro.');
    return { ok: false, scan };
  }

  if (scan.outdated.length === 0) {
    prompt.success('Todos os pacotes já estão em dia.');
    return { ok: true, scan };
  }

  if (!install) {
    prompt.info('Use --install para atualizar os pacotes antes do deploy PM2.');
    return { ok: false, scan };
  }

  prompt.write('\nAtualizando pacotes...\n');
  const specs = scan.outdated.map((e) => `${e.pkg}@latest`);
  const result = runner('bun', ['add', ...specs], { cwd, inherit: true, timeoutMs: 600_000 });
  if (!result.ok) {
    const npmResult = runner('npm', ['install', ...specs], { cwd, inherit: true, timeoutMs: 600_000 });
    if (!npmResult.ok) {
      prompt.error('Falha ao atualizar pacotes.');
      return { ok: false, scan };
    }
  }
  return { ok: true, scan };
}

/** Roda migrations no host (necessário para PM2 e Docker). */
async function runMigrations(cwd: string, runner: Runner, prompt: Prompt): Promise<boolean> {
  const { migrateInvocation } = await import('./bluegreen.js');
  const { command, args } = migrateInvocation();
  prompt.write('\nRodando migrations no host...\n');
  const result = runner(command, args, { cwd, inherit: true, timeoutMs: 120_000 });
  if (!result.ok) {
    prompt.error('Migrations falharam — deploy abortado.');
    return false;
  }
  prompt.success('Migrations aplicadas.');
  return true;
}

/** Deploy PM2: atualiza pacotes (opcional) + migrations + pm2 reload. */
async function deployPm2(
  cwd: string,
  opts: DeployOptions,
  prompt: Prompt,
  runner: Runner
): Promise<number> {
  const pm2Ok = await checkPm2Installed(runner);
  if (!pm2Ok) {
    prompt.warn('PM2 não encontrado globalmente.');
    if (opts.yes !== true) {
      const installIt = await prompt.confirm('Instalar PM2 globalmente agora? (bun add -g pm2)', {
        defaultValue: true,
      });
      if (!installIt) {
        prompt.error('PM2 é obrigatório para este modo. Instale manualmente: bun add -g pm2');
        return 1;
      }
    }
    const installed = await installPm2(runner);
    if (!installed) {
      prompt.error('Falha ao instalar PM2.');
      return 1;
    }
    prompt.success('PM2 instalado globalmente.');
  }

  // ecosystem.config.js
  const created = ensureEcosystemConfig(cwd, false);
  if (created) prompt.info('ecosystem.config.js criado (padrão).');

  // Snapshot para rollback
  const pkgSnapshot = snapshotPackageJson(cwd);

  // Atualiza pacotes se --install
  let scan: Awaited<ReturnType<typeof import('./update.js').scanOutdated>> = { installed: false, outdated: [] };
  if (opts.install) {
    const result = await pm2UpdatePackages(cwd, runner, prompt, true);
    if (!result.ok) return 1;
    scan = result.scan;
  } else {
    // Ainda faz scan para histórico
    scan = await (await import('./update.js')).scanOutdated(cwd);
  }

  // Migrations (obrigatório)
  const migOk = await runMigrations(cwd, runner, prompt);
  if (!migOk) return 1;

  // pm2 reload all
  prompt.write('\nRecarregando processos PM2...\n');
  const reload = runner('pm2', ['reload', 'all', '--update-env'], { cwd, inherit: true, timeoutMs: 60_000 });
  if (!reload.ok) {
    prompt.error('pm2 reload falhou.');
    return 1;
  }

  prompt.success('Deploy PM2 concluído.');

  // Histórico
  const { addHistoryEntry } = await import('./history.js');
  const pkg = await import('../package.json', { with: { type: 'json' } });
  addHistoryEntry(cwd, {
    mode: 'pm2',
    at: new Date().toISOString(),
    cliVersion: pkg.default.version,
    packages: scan.outdated.map((e) => ({ name: e.name, from: e.current, to: e.latest })),
    message: `Deploy PM2 — ${scan.outdated.length} pacote(s) atualizado(s)`,
    packageJsonSnapshot: pkgSnapshot,
  }, pkg.default.version);

  // Atualiza docs
  const { updateProjectDocs } = await import('./docs-updater.js');
  const updated = updateProjectDocs(cwd);
  if (updated.length > 0) prompt.success(`Docs atualizados: ${updated.join(', ')}`);

  return 0;
}

/** Deploy Docker: reusa o fluxo blue/green do update.ts. */
async function deployDocker(
  cwd: string,
  opts: DeployOptions,
  prompt: Prompt,
  runner: Runner
): Promise<number> {
  // Reusa a lógica do update --mode deploy
  const scan = await (await import('./update.js')).scanOutdated(cwd, (m) => prompt.write(m + '\n'));

  if (!scan.installed) {
    prompt.error('Projeto sem node_modules/@oktis-works. Rode `bun install` primeiro.');
    return 1;
  }

  const choices = await resolveDeployChoices(
    { noCache: opts.noCache, removeOrphans: false, keepOrphans: false, yes: opts.yes },
    prompt
  );

  const interactive = prompt.interactive && opts.yes !== true;
  if (interactive) {
    prompt.heading('Resumo do deploy blue/green (Docker)');
    prompt.info(`pacotes: ${scan.outdated.length} atualização(ões)`);
    prompt.info(`build: ${choices.noCache ? 'sem cache (rebuild limpo)' : 'com cache de camadas'}`);
    prompt.info('ordem: build → migrations no host → edge → health → swap → worker → down');
    const confirmed = await prompt.confirm('Iniciar deploy Docker blue/green?', { defaultValue: true });
    if (!confirmed) {
      prompt.warn('Cancelado.');
      return 0;
    }
  }

  const result = await deployBlueGreen({
    cwd,
    runner,
    choices,
    packages: scan.outdated.map((e) => `${e.pkg}@latest`),
    installAll: !scan.installed,
    log: (m) => prompt.write(m + '\n'),
    warn: (m) => prompt.write(m + '\n'),
  });

  if (result.ok) {
    // Histórico
    const { addHistoryEntry } = await import('./history.js');
    const pkg = await import('../package.json', { with: { type: 'json' } });
    addHistoryEntry(cwd, {
      mode: 'deploy',
      at: new Date().toISOString(),
      cliVersion: pkg.default.version,
      packages: scan.outdated.map((e) => ({ name: e.name, from: e.current, to: e.latest })),
      lane: result.lane,
      previousLane: result.previousLane,
      message: `Deploy blue/green → lane ${result.lane} (era ${result.previousLane ?? 'n/a'})`,
    }, pkg.default.version);

    // Atualiza docs
    const { updateProjectDocs } = await import('./docs-updater.js');
    const updated = updateProjectDocs(cwd);
    if (updated.length > 0) prompt.success(`Docs atualizados: ${updated.join(', ')}`);
  }

  return result.ok ? 0 : 1;
}

export async function runDeploy(opts: DeployOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const prompt = opts.prompt ?? new Prompt();
  const ownsPrompt = opts.prompt === undefined;
  const runner = opts.runner ?? defaultRunner;

  const guard = (await import('./guards.js')).assertHostOnly('okcms deploy', { force: opts.force });
  if (!guard.ok) {
    console.error(guard.message);
    if (ownsPrompt) prompt.close();
    return 1;
  }

  try {
    let target: DeployTarget;

    if (opts.target !== undefined) {
      const t = opts.target.trim().toLowerCase();
      if (t === 'docker' || t === 'bluegreen' || t === 'blue-green') target = 'docker';
      else if (t === 'pm2' || t === 'process') target = 'pm2';
      else {
        prompt.error(`--target inválido: ${opts.target} — use "docker" ou "pm2"`);
        return 1;
      }
    } else if (prompt.interactive && opts.yes !== true) {
      target = await prompt.select<DeployTarget>('Como deseja fazer o deploy?', [
        {
          value: 'docker',
          label: 'Docker blue/green (recomendado para produção)',
          hint: 'build → migrations → healthcheck → swap proxy → worker drenado',
        },
        {
          value: 'pm2',
          label: 'PM2 (processos no host)',
          hint: 'atualiza pacotes → migrations → pm2 reload all',
        },
      ], { defaultValue: 'docker' });
    } else {
      target = 'docker';
    }

    if (target === 'pm2') return await deployPm2(cwd, opts, prompt, runner);
    return await deployDocker(cwd, opts, prompt, runner);
  } finally {
    if (ownsPrompt) prompt.close();
  }
}