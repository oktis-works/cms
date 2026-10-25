// @oktis-works/cms - Wizard: executor de comandos via subprocesso
//
// O wizard NUNCA chama handlers in-process: cada ação spawna o próprio bin do
// CLI (`okcms <comando>`) com stdio herdado. Isso dá três coisas que importam:
//
//   1. isolamento total de estado — o `okcms dev` roda exatamente como roda
//      no seu terminal, sem "meio ambiente envenenado" pelo wizard;
//   2. espelho de automação — a linha `$ okcms ...` impressa ANTES do spawn é
//      literalmente a linha que roda; copiar é reaproveitar em CI/script;
//   3. Ctrl+C limpo — o sinal vai pro filho; o wizard percebe o exit 130 e
//      volta pro menu em vez de morrer junto.
//
// O bin é resolvido uma vez (argv[1] do processo atual ou o dist do package);
// os testes injetam um runner falso e nunca spawnam de verdade.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { style, symbol, type Prompt } from './prompt.js';

export interface RunResult {
  code: number;
  /** true quando o filho foi encerrado por sinal (Ctrl+C). */
  interrupted: boolean;
}

/** Assinatura de spawn — injetável nos testes. */
export type SpawnFn = (command: string, args: string[], cwd?: string) => Promise<RunResult>;

/**
 * Resolve o executável + script do CLI atual. Preferências:
 *   1. `process.argv[1]` — quando o usuário rodou `okcms`/`bunx`, é o entry
 *      real (dev usa src/index.ts, build usa dist/index.js);
 *   2. dist vizinho deste módulo — fallback defensivo.
 * O intérprete é `process.execPath` (bun) — mesmo runtime, zero PATH.
 */
export function resolveCliInvocation(): { command: string; script: string } {
  const argv1 = process.argv[1];
  const here = dirname(fileURLToPath(import.meta.url));

  const candidates = [argv1, join(here, 'index.js'), join(here, 'index.ts')].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
  );
  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (existsSync(abs)) return { command: process.execPath, script: abs };
  }
  // última tentativa: argv[1] mesmo sem existsSync (bins symlinkados)
  if (argv1) return { command: process.execPath, script: resolve(argv1) };
  throw new Error('cannot resolve the okcms entry point to spawn');
}

export const defaultSpawn: SpawnFn = (command, args, cwd) =>
  new Promise<RunResult>((resolvePromise) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    let interrupted = false;

    const onSigint = (): void => {
      interrupted = true;
    };
    // o wizard vive: quem decide parar é o filho (recebe o mesmo SIGINT do
    // terminal em foreground). Sem isto, o Ctrl+C mataria os dois.
    process.once('SIGINT', onSigint);

    child.on('error', () => {
      process.removeListener('SIGINT', onSigint);
      resolvePromise({ code: 127, interrupted: false });
    });
    child.on('close', (code, signal) => {
      process.removeListener('SIGINT', onSigint);
      const bySignal = signal === 'SIGINT' || signal === 'SIGTERM';
      resolvePromise({ code: code ?? (bySignal ? 130 : 1), interrupted: interrupted || bySignal });
    });
  });

/** `['dev', ['--yes']]` → `okcms dev --yes` (a linha de automação). */
export function formatCommand(
  command: string,
  flags: Array<[string, string]>,
  positional: string[] = [],
  sensitive: ReadonlySet<string> = new Set()
): string {
  const parts = ['okcms', command, ...positional.map(shellQuote)];
  for (const [name, value] of flags) {
    for (const item of splitRepeatable(value)) {
      if (item === 'true') {
        parts.push(`--${name}`);
      } else {
        const shown = sensitive.has(name) ? '<redacted>' : item;
        parts.push(`--${name} ${shellQuote(shown)}`);
      }
    }
  }
  return parts.join(' ');
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Flags repetíveis (`--set A=1 --set B=2`) chegam acumuladas com `\n` — o
 * parser faz isso de propósito. Na linha de automação e no spawn elas voltam a
 * ser ocorrências separadas.
 */
function splitRepeatable(value: string): string[] {
  return value.includes('\n') ? value.split('\n').filter(Boolean) : [value];
}

/** Mesma conversão de `formatCommand`, mas como argv para o spawn. */
export function flagsToArgv(flags: Array<[string, string]>): string[] {
  const argv: string[] = [];
  for (const [name, value] of flags) {
    for (const item of splitRepeatable(value)) {
      if (item === 'true') argv.push(`--${name}`);
      else argv.push(`--${name}`, item);
    }
  }
  return argv;
}

export interface RunCliOptions {
  prompt: Prompt;
  spawn?: SpawnFn;
  cwd?: string;
  sensitive?: ReadonlySet<string>;
}

/**
 * Imprime o espelho (`$ okcms ...`), executa como filho com stdio herdado e
 * devolve o resultado. `longRunning` muda o aviso: o comando vai bloquear
 * (dev/start) e o Ctrl+C retorna ao wizard, não mata a sessão.
 */
export async function runCliCommand(
  command: string,
  flags: Array<[string, string]>,
  opts: RunCliOptions & { longRunning?: boolean; positional?: string[] }
): Promise<RunResult> {
  const { prompt } = opts;
  const spawnFn = opts.spawn ?? defaultSpawn;
  const positional = opts.positional ?? [];
  const line = formatCommand(command, flags, positional, opts.sensitive);

  prompt.write(`  ${style.dim(symbol.arrow)} ${style.cyan(promptMirror(line))}\n`);
  if (opts.longRunning) prompt.info('long-running command — Ctrl+C returns to the wizard');

  const { command: exe, script } = resolveCliInvocation();
  const args = [script, command, ...positional, ...flagsToArgv(flags)];

  const result = await spawnFn(exe, args, opts.cwd);

  if (result.interrupted) {
    prompt.warn('interrupted — back to the wizard');
  } else if (result.code === 0) {
    prompt.success('finished with success');
  } else {
    prompt.error(`exited with code ${result.code}`);
  }
  return result;
}

function promptMirror(line: string): string {
  return `$ ${line}`;
}
