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
    console.log('History is empty.');
    return;
  }

  console.log('\nUpdate/deploy history (newest first):\n');
  for (const entry of entries) {
    console.log(entry.id + '. ' + entry.at.split('T')[0] + ' ' + entry.at.split('T')[1]?.slice(0, 8));
    console.log('    ' + entry.mode + ': ' + entry.message);
    if (entry.packages && entry.packages.length > 0) {
      for (const p of entry.packages) {
        console.log(`    @oktis-works/${p.name}: ${p.from} → ${p.to}`);
      }
    }
    if (entry.lane) {
      console.log(`    lane: ${entry.lane}${entry.previousLane ? ` (was ${entry.previousLane})` : ''}`);
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
    prompt.error('package.json not found.');
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
    prompt.warn('No @oktis-works/* dependency to revert in package.json.');
    return 0;
  }

  writeFileSync(pkgPath, JSON.stringify(currentPkg, null, 2) + '\n', 'utf-8');
  prompt.success('package.json reverted to previous versions.');

  prompt.info('Run `bun install` (or `npm install`) to apply the rollback.');
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
    prompt.error('No previous lane to roll back to (first deploy?).');
    return 1;
  }

  const targetLane = entry.previousLane;
  const currentLane = entry.lane;

  prompt.heading(`Deploy rollback: ${currentLane} → ${targetLane}`);
  prompt.info('Switching the proxy to the previous lane...');

  const record = loadEnvFile(join(cwd, '.env')).toRecord();
  writeUpstreams(cwd, targetLane, record);
  const reloaded = reloadProxy(cwd, runner);
  if (!reloaded.ok) {
    prompt.error('Failed to reload nginx: ' + reloaded.stderr);
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

  prompt.success(`Rollback complete. Active lane: ${targetLane}`);
  return 0;
}

/** Executa rollback de PM2: restaura ecosystem.config.js anterior (se houver snapshot). */
async function rollbackPm2(
  cwd: string,
  entry: { packageJsonSnapshot?: string },
  prompt: Prompt
): Promise<number> {
  if (!entry.packageJsonSnapshot) {
    prompt.error('No package.json snapshot for PM2 rollback.');
    return 1;
  }

  const pkgPath = join(cwd, 'package.json');
  writeFileSync(pkgPath, entry.packageJsonSnapshot, 'utf-8');
  prompt.success('package.json restored. Run `bun install` and `pm2 reload all`.');
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
      prompt.warn('History is empty — nothing to roll back.');
      return 0;
    }

    let targetId = opts.id;
    if (targetId === undefined) {
      printHistory(cwd);
      targetId = await prompt.select<number>(
        'Choose the state to roll back to (newest = 1)',
        entries.map((e) => ({
          value: e.id,
          label: `#${e.id} ${e.at.slice(0, 19).replace('T', ' ')} — ${e.mode}: ${e.message}`,
        })),
        { defaultValue: entries[0]?.id }
      );
    }

    const entry = getHistoryEntry(cwd, targetId);
    if (!entry) {
      prompt.error(`Entry #${targetId} not found in history.`);
      return 1;
    }

    if (!opts.yes) {
      const confirmed = await prompt.confirm(
        `Confirm rollback to #${entry.id} (${entry.mode}: ${entry.message})?`,
        { defaultValue: false }
      );
      if (!confirmed) {
        prompt.info('Cancelled.');
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
        prompt.error(`Unknown mode: ${entry.mode}`);
        return 1;
    }

    if (code === 0) {
      prompt.success('Rollback completed successfully.');
    }
    return code;
  } finally {
    if (ownsPrompt) prompt.close();
  }
}