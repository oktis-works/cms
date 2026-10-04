// @oktis-works/cms - `okcms rollback` (histórico + rollback)
//
// Lista o histórico de updates/deploys e permite voltar para um estado anterior.
// O rollback de "download" restaura package.json (requer reinstall).
// O rollback de "deploy" troca a lane ativa no proxy (blue <-> green).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prompt } from './prompt.js';
import { listHistory, getHistoryEntry } from './history.js';
import { reloadProxy, writeUpstreams } from './docker.js';
import { defaultRunner } from './docker.js';
import { loadEnvFile } from './env-file.js';

export interface RollbackOptions {
  cwd?: string;
  /** ID da entrada do histórico (se omitido, abre menu interativo). */
  id?: number;
  /** `--yes`: confirma sem prompt. */
  yes?: boolean;
  /** `--force`: permite rodar dentro de container (não recomendado). */
  force?: boolean;
  prompt?: Prompt;
  runner?: typeof defaultRunner;
}

function printHistory(cwd: string): void {
  const entries = listHistory(cwd);
  if (entries.length === 0) {
    console.log('Histórico vazio.');
    return;
  }

  console.log('\nHistórico de updates/deploys (mais recente primeiro):\n');
  for (const entry of entries) {
    console.log(entry.id + '. ' + entry.at.split('T')[0] + ' ' + entry.at.split('T')[1]?.slice(0, 8));
    console.log('    ' + entry.mode + ': ' + entry.message);
    if (entry.packages && entry.packages.length > 0) {
      for (const p of entry.packages) {
        console.log(`    @oktis-works/${p.name}: ${p.from} → ${p.to}`);
      }
    }
    if (entry.lane) {
      console.log(`    lane: ${entry.lane}${entry.previousLane ? ` (era ${entry.previousLane})` : ''}`);
    }
    console.log('');
  }
}

/** Executa rollback de download: restaura package.json e orienta reinstall. */
async function rollbackDownload(
  cwd: string,
  entry: { packages?: Array<{ name: string; from: string; to: string }> },
  prompt: Prompt
): Promise<number> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    prompt.error('package.json não encontrado.');
    return 1;
  }

  const currentPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  let changed = false;

  if (entry.packages) {
    for (const p of entry.packages) {
      const depName = `@oktis-works/${p.name}`;
      for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        if (currentPkg[depType]?.[depName]) {
          currentPkg[depType][depName] = p.from;
          changed = true;
        }
      }
    }
  }

  if (!changed) {
    prompt.warn('Nenhuma dependência @oktis-works/* para reverter no package.json.');
    return 0;
  }

  writeFileSync(pkgPath, JSON.stringify(currentPkg, null, 2) + '\n', 'utf-8');
  prompt.success('package.json revertido para versões anteriores.');

  prompt.info('Execute `bun install` (ou `npm install`) para aplicar o rollback.');
  return 0;
}

/** Executa rollback de deploy: troca a lane ativa no proxy. */
async function rollbackDeploy(
  cwd: string,
  entry: { lane?: 'blue' | 'green'; previousLane?: 'blue' | 'green' | null },
  prompt: Prompt,
  runner: typeof defaultRunner
): Promise<number> {
  if (!entry.previousLane) {
    prompt.error('Não há lane anterior para rollback (primeiro deploy?).');
    return 1;
  }

  const targetLane = entry.previousLane;
  const currentLane = entry.lane;

  prompt.heading(`Rollback de deploy: ${currentLane} → ${targetLane}`);
  prompt.info('Trocando o proxy para a lane anterior...');

  const record = loadEnvFile(join(cwd, '.env')).toRecord();
  writeUpstreams(cwd, targetLane, record);
  const reloaded = reloadProxy(cwd, runner);
  if (!reloaded.ok) {
    prompt.error('Falha ao recarregar nginx: ' + reloaded.stderr);
    return 1;
  }

  // Atualiza estado da lane
  const statePath = join(cwd, '.deploy', 'state.json');
  let state = { lane: targetLane, previousLane: currentLane, version: '', at: new Date().toISOString(), history: [] } as any;
  try {
    const raw = readFileSync(statePath, 'utf-8');
    state = JSON.parse(raw);
  } catch {}

  state.lane = targetLane;
  state.previousLane = currentLane;
  state.at = new Date().toISOString();

  const { writeLaneState } = await import('./docker.js');
  writeLaneState(cwd, state);

  prompt.success(`Rollback concluído. Lane ativa: ${targetLane}`);
  return 0;
}

/** Executa rollback de PM2: restaura ecosystem.config.js anterior (se houver snapshot). */
async function rollbackPm2(
  cwd: string,
  entry: { packageJsonSnapshot?: string },
  prompt: Prompt
): Promise<number> {
  if (!entry.packageJsonSnapshot) {
    prompt.error('Sem snapshot de package.json para rollback PM2.');
    return 1;
  }

  const pkgPath = join(cwd, 'package.json');
  writeFileSync(pkgPath, entry.packageJsonSnapshot, 'utf-8');
  prompt.success('package.json restaurado. Rode `bun install` e `pm2 reload all`.');
  return 0;
}

export async function runRollback(opts: RollbackOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const prompt = opts.prompt ?? new Prompt();
  const ownsPrompt = opts.prompt === undefined;
  const runner = opts.runner ?? defaultRunner;

  const guard = (await import('./guards.js')).assertHostOnly('okcms rollback', { force: opts.force });
  if (!guard.ok) {
    console.error(guard.message);
    if (ownsPrompt) prompt.close();
    return 1;
  }

  try {
    const entries = listHistory(cwd);
    if (entries.length === 0) {
      prompt.warn('Histórico vazio — nada para fazer rollback.');
      return 0;
    }

    let targetId = opts.id;
    if (targetId === undefined) {
      printHistory(cwd);
      targetId = await prompt.select<number>(
        'Escolha o estado para rollback (mais recente = 1):',
        entries.map((e) => ({
          value: e.id,
          label: `#${e.id} ${e.at.slice(0, 19).replace('T', ' ')} — ${e.mode}: ${e.message}`,
        })),
        { defaultValue: entries[0]?.id }
      );
    }

    const entry = getHistoryEntry(cwd, targetId);
    if (!entry) {
      prompt.error(`Entrada #${targetId} não encontrada no histórico.`);
      return 1;
    }

    if (!opts.yes) {
      const confirmed = await prompt.confirm(
        `Confirmar rollback para #${entry.id} (${entry.mode}: ${entry.message})?`,
        { defaultValue: false }
      );
      if (!confirmed) {
        prompt.info('Cancelado.');
        return 0;
      }
    }

    let code: number;
    switch (entry.mode) {
      case 'download':
        code = await rollbackDownload(cwd, entry, prompt);
        break;
      case 'deploy':
        code = await rollbackDeploy(cwd, entry, prompt, runner);
        break;
      case 'pm2':
        code = await rollbackPm2(cwd, entry, prompt);
        break;
      default:
        prompt.error(`Modo desconhecido: ${entry.mode}`);
        return 1;
    }

    if (code === 0) {
      prompt.success('Rollback concluído com sucesso.');
    }
    return code;
  } finally {
    if (ownsPrompt) prompt.close();
  }
}