// @oktis-works/cms - `okcms update` (F3)
//
// Dois caminhos, um só comando:
//
//   download  baixa/atualiza os pacotes @oktis-works no host. É o
//             comportamento histórico (`okcms update -i`) e continua sendo o
//             default em não-TTY — script nenhum passa a fazer deploy por
//             acidente só porque a CLI ganhou um menu.
//
//   deploy    sobe a aplicação em Docker com troca blue/green: pacotes no
//             host → build → migrations → edge da lane nova → healthcheck →
//             swap do nginx → dreno do worker → derruba a lane antiga.
//             A CLI roda no HOST, sempre (ver assertHostOnly).
//
// A escolha entre os dois é o menu de TTY; fora de TTY vale `--mode` ou o
// default histórico.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { deployBlueGreen, type DeployChoices } from './bluegreen.js';
import { defaultRunner, type Runner } from './docker.js';
import { assertHostOnly, type ContainerProbe } from './guards.js';
import { getLatestVersion } from './npm-registry.js';
import { Prompt, style, symbol } from './prompt.js';

export type UpdateMode = 'download' | 'deploy';

export interface OutdatedEntry {
  /** nome curto do pacote (`api`), como aparece em node_modules. */
  name: string;
  /** nome publicado (`@oktis-works/api`). */
  pkg: string;
  current: string;
  latest: string;
}

export interface ScanResult {
  /** false = não existe `node_modules/@oktis-works` (projeto nunca instalou). */
  installed: boolean;
  outdated: OutdatedEntry[];
}

export interface UpdateOptions {
  cwd?: string;
  /** `--install`: aplica as atualizações no modo download. */
  install?: boolean;
  /** `--mode download|deploy` (aliases abaixo); ausente = menu/default. */
  mode?: string;
  /** `--no-cache`: build limpo. */
  noCache?: boolean;
  /** `--remove-orphans` / `--keep-orphans`. */
  removeOrphans?: boolean;
  keepOrphans?: boolean;
  /** `--yes`: nenhum prompt, tudo em default. */
  yes?: boolean;
  /** `--force`: permite rodar dentro de container (não recomendado). */
  force?: boolean;
  /** Sonda do `assertHostOnly` (testes); em produção usa a detecção real. */
  probe?: ContainerProbe;
  runner?: Runner;
  prompt?: Prompt;
  log?: (message: string) => void;
}

const MODE_ALIASES: Record<string, UpdateMode> = {
  download: 'download',
  pkg: 'download',
  packages: 'download',
  pacotes: 'download',
  deploy: 'deploy',
  docker: 'deploy',
  bluegreen: 'deploy',
  'blue-green': 'deploy',
  'blue_green': 'deploy',
};

/** `null` = valor inválido (diferente de "não informado"). */
export function parseMode(value: string): UpdateMode | null {
  return MODE_ALIASES[value.trim().toLowerCase()] ?? null;
}

/**
 * Varre `node_modules/@oktis-works/*` e compara cada versão instalada com a
 * do registry. Falha de rede num pacote não derruba a varredura: ele fica de
 * fora e o operador vê `?` na próxima rodada.
 */
export async function scanOutdated(
  cwd: string,
  log: (message: string) => void = console.log
): Promise<ScanResult> {
  const nmDir = join(cwd, 'node_modules', '@oktis-works');
  if (!existsSync(nmDir)) return { installed: false, outdated: [] };

  const installed = readdirSync(nmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const outdated: OutdatedEntry[] = [];

  for (const name of installed) {
    let current = '?';
    try {
      const pkgJson = JSON.parse(readFileSync(join(nmDir, name, 'package.json'), 'utf-8')) as {
        version?: string;
      };
      current = pkgJson.version ?? '?';
    } catch {
      // sem package.json legível — tratado como desconhecido abaixo
    }

    const latest = await getLatestVersion(`@oktis-works/${name}`);

    if (!latest || latest === current) {
      log(`  ✓ @oktis-works/${name} ${current} (em dia)`);
      continue;
    }

    log(`  ↑ @oktis-works/${name} ${current} → ${latest} disponível`);
    outdated.push({ name, pkg: `@oktis-works/${name}`, current, latest });
  }

  return { installed: true, outdated };
}

/** Flags > prompt. Fora de TTY, defaults conservadores e determinísticos. */
export async function resolveDeployChoices(
  opts: Pick<UpdateOptions, 'noCache' | 'removeOrphans' | 'keepOrphans' | 'yes'>,
  prompt: Prompt
): Promise<DeployChoices> {
  const interactive = prompt.interactive && opts.yes !== true;

  const noCache =
    opts.noCache === true
      ? true
      : interactive
        ? !(await prompt.confirm('Build com cache de camadas? (não = rebuild limpo, mais lento)', {
            defaultValue: true,
          }))
        : false;

  const removeOrphans =
    opts.keepOrphans === true
      ? false
      : opts.removeOrphans === true
        ? true
        : interactive
          ? await prompt.confirm('Remover contêineres órfãos da lane antiga?', {
              defaultValue: true,
            })
          : true;

  return { noCache, removeOrphans };
}

async function runDownload(
  scan: ScanResult,
  opts: UpdateOptions,
  prompt: Prompt
): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultRunner;

  if (!scan.installed) {
    console.error('Nenhum pacote @oktis-works/* instalado em node_modules.');
    console.error('Rode `bun install` (ou `okcms init`) antes de atualizar.');
    return 1;
  }

  if (scan.outdated.length === 0) {
    prompt.success('Todos os pacotes estão em dia.');
    return 0;
  }

  if (opts.install !== true) {
    prompt.info('Use --install para atualizar automaticamente.');
    prompt.info('Ou --mode deploy para um deploy Docker blue/green completo.');
    return 0;
  }

  prompt.write('\nAtualizando...\n');
  const specs = scan.outdated.map((entry) => `${entry.pkg}@latest`);
  const result = runner('bun', ['add', ...specs], {
    cwd,
    inherit: true,
    timeoutMs: 600_000,
  });
  if (result.ok) return 0;

  // host sem bun: o npm faz o mesmo trabalho, só mais devagar
  const npm = runner('npm', ['install', ...specs], {
    cwd,
    inherit: true,
    timeoutMs: 600_000,
  });
  return npm.ok ? 0 : 1;
}

export async function runUpdate(opts: UpdateOptions = {}): Promise<number> {
  const prompt = opts.prompt ?? new Prompt();
  const ownsPrompt = opts.prompt === undefined;

  // A CLI de deploy/config só existe no host: dentro de um container ela
  // viraria um instalador de pacotes na rede do banco, com .env exposto.
  const guard = assertHostOnly('okcms update', { force: opts.force, probe: opts.probe });
  if (!guard.ok) {
    console.error(guard.message);
    if (ownsPrompt) prompt.close();
    return 1;
  }

  const onInterrupt = (): void => {
    prompt.write(`\n  ${style.yellow(symbol.warn)} interrompido — nenhum passo de deploy em andamento foi registrado.\n`);
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    // ---- 1. modo ----------------------------------------------------------
    let mode: UpdateMode;
    if (opts.mode !== undefined) {
      const parsed = parseMode(opts.mode);
      if (parsed === null) {
        prompt.error(`--mode inválido: ${opts.mode} — use "download" ou "deploy"`);
        return 1;
      }
      mode = parsed;
    } else if (prompt.interactive && opts.yes !== true) {
      mode = await prompt.select<UpdateMode>('O que o update deve fazer?', [
        {
          value: 'download',
          label: 'Só baixar pacotes',
          hint: 'node_modules atualizado · nada sobe no Docker',
        },
        {
          value: 'deploy',
          label: 'Deploy Docker blue/green completo',
          hint: 'build · migrations · swap de lane · worker drenado',
        },
      ], { defaultValue: 'download' });
    } else {
      // não-TTY sem --mode = comportamento histórico, inalterado
      mode = 'download';
    }

    // ---- 2. varredura -----------------------------------------------------
    prompt.heading(`OkCMS update — modo ${mode}`);
    const scan = await scanOutdated(opts.cwd ?? process.cwd(), (message) =>
      prompt.write(`${message}\n`)
    );

    if (mode === 'download') return await runDownload(scan, opts, prompt);

    // ---- 3. escolhas do deploy -------------------------------------------
    const choices = await resolveDeployChoices(opts, prompt);
    const interactive = prompt.interactive && opts.yes !== true;

    if (interactive) {
      prompt.heading('Resumo do deploy blue/green');
      prompt.info(`pacotes: ${scan.outdated.length} atualização(ões)`);
      prompt.info(`build: ${choices.noCache ? 'sem cache (rebuild limpo)' : 'com cache de camadas'}`);
      prompt.info(`órfãos da lane antiga: ${choices.removeOrphans ? 'remover' : 'manter'}`);
      prompt.info('ordem: build → migrations no host → edge → health → swap → worker → down');
      const confirmed = await prompt.confirm('Iniciar deploy?', { defaultValue: true });
      if (!confirmed) {
        prompt.warn('cancelado — nada foi executado.');
        return 0;
      }
    }

    // ---- 4. deploy --------------------------------------------------------
    const result = await deployBlueGreen({
      cwd: opts.cwd,
      runner: opts.runner,
      choices,
      packages: scan.outdated.map((entry) => `${entry.pkg}@latest`),
      installAll: !scan.installed,
      log: (message) => prompt.write(`${message}\n`),
      warn: (message) => prompt.write(`${message}\n`),
    });

    return result.ok ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (ownsPrompt) prompt.close();
  }
}
