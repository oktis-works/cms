// @oktis-works/cms - `okcms redeploy` (F4)
//
// Instalar plugin/tema no host ainda não muda o que está no ar:
//
//   plugins e temas entram na imagem pelo `COPY . .` do Dockerfile (o
//   `.dockerignore` os preserva de propósito) — sem rebuild, o container segue
//   servindo a cópia antiga;
//
//   `themes/<n>/dist/theme.css` só existe se o build de estilo rodou no host:
//   o web linka esse arquivo pronto, ele não é compilado dentro do container;
//
//   um plugin que mexe no banco traz SQL em `plugins/<n>/migrations/`, que
//   precisa chegar em `migrations/` para o `db:migrate` aplicá-lo — o runner
//   só lê UM diretório e classifica como PLUGIN todo owner que não é `core`
//   (`V###__owner__nome.sql`, rastreado por `owner:version`).
//
// Redeploy = preparar no host (stage do SQL + build dos temas) e então
// delegar a troca ao mesmo blue/green do `okcms update --mode deploy`, só que
// sem `bun add`: o que mudou é conteúdo de extensão, não versão de pacote.
//
// Ordem e garantias são as do deploy normal: falha no preparo = nada foi
// buildado nem trocado; falha no deploy = rollback e a lane que estava
// servindo continua servindo.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { deployBlueGreen, type DeployChoices } from './bluegreen.js';
import type { Runner } from './docker.js';
import { assertHostOnly, type ContainerProbe } from './guards.js';
import { loadProjectConfig } from './project-config.js';
import { Prompt } from './prompt.js';
import {
  buildThemeStylesOnDisk,
  resolveThemeStyle,
  themeManifestPath,
} from './theme-build.js';
import { resolveDeployChoices } from './update.js';

/**
 * Mesmo padrão de `parseMigrationName` (packages/database): qualquer `.sql`
 * fora dele derruba `loadMigrationsFromDir` para TODAS as migrations do
 * diretório — por isso nada fora do padrão é copiado para `migrations/`.
 */
export const MIGRATION_FILENAME = /^V\d+__\w+__.+\.sql$/;

// ---------------------------------------------------------------------------
// Plano
// ---------------------------------------------------------------------------

export interface PluginMigrationEntry {
  plugin: string;
  /** Nome do arquivo (o mesmo nos dois lados — é a identidade da migration). */
  file: string;
  source: string;
  target: string;
  /**
   * new      não está em migrations/ → copiar;
   * staged   está idêntico → nada a fazer;
   * conflict está mas com outro conteúdo → NÃO sobrescreve (a do projeto é
   *          do operador, e a versão já aplicada no banco tem checksum);
   * invalid  nome fora do padrão do runner → nunca copiar.
   */
  status: 'new' | 'staged' | 'conflict' | 'invalid';
}

export interface ThemeBuildEntry {
  theme: string;
  manifestPath: string | null;
  engine: string;
  output: string;
  entry: string | null;
  /** 'build' = tem entrada de estilo e será compilado. */
  status: 'build' | 'no-entry' | 'missing-manifest' | 'invalid-manifest';
  /** Erros do manifest (o runtime recusaria o tema de qualquer forma). */
  problems: string[];
}

export interface RedeployPlan {
  /** Todos os plugins instalados (mesmo sem migrations). */
  plugins: string[];
  /** Todos os temas instalados. */
  themes: string[];
  migrations: PluginMigrationEntry[];
  themeBuilds: ThemeBuildEntry[];
  /**
   * `.sql` JÁ existente em `migrations/` fora do padrão do runner: bloqueia
   * qualquer `db:migrate`, então é detectado aqui, antes do deploy.
   */
  invalidExisting: string[];
}

export interface RedeployPlanOptions {
  cwd?: string;
  /** Prepara só as migrations deste plugin (o rebuild é sempre global). */
  plugin?: string;
  /** Compila só este tema (o rebuild é sempre global). */
  theme?: string;
  /** Diretório de migrations do projeto (default: `<cwd>/migrations`). */
  migrationsDir?: string;
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listSql(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function sameContent(a: string, b: string): boolean {
  try {
    return readFileSync(a, 'utf-8') === readFileSync(b, 'utf-8');
  } catch {
    return false;
  }
}

/**
 * Lê o estado de plugins/temas e devolve o que o redeploy faria. Só lê —
 * nenhum byte é escrito aqui, o que torna `--dry-run` e os testes triviais.
 */
export function planRedeploy(opts: RedeployPlanOptions = {}): RedeployPlan {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadProjectConfig(cwd);
  const pluginsDir = join(cwd, config.pluginsDir);
  const themesDir = join(cwd, config.themesDir);
  const migrationsDir = opts.migrationsDir ?? join(cwd, 'migrations');

  const plugins = listDirs(pluginsDir);
  const themes = listDirs(themesDir);

  // ---- migrations de plugin ------------------------------------------------
  const migrations: PluginMigrationEntry[] = [];
  const scopedPlugins = opts.plugin ? plugins.filter((name) => name === opts.plugin) : plugins;

  for (const plugin of scopedPlugins) {
    const dir = join(pluginsDir, plugin, 'migrations');
    for (const file of listSql(dir)) {
      const source = join(dir, file);
      const target = join(migrationsDir, file);
      let status: PluginMigrationEntry['status'];
      if (!MIGRATION_FILENAME.test(file)) status = 'invalid';
      else if (!existsSync(target)) status = 'new';
      else if (sameContent(source, target)) status = 'staged';
      else status = 'conflict';
      migrations.push({ plugin, file, source, target, status });
    }
  }

  // ---- build de tema -------------------------------------------------------
  const themeBuilds: ThemeBuildEntry[] = [];
  const scopedThemes = opts.theme ? themes.filter((name) => name === opts.theme) : themes;

  for (const theme of scopedThemes) {
    const manifestPath = themeManifestPath(themesDir, theme);
    if (!manifestPath) {
      themeBuilds.push({
        theme,
        manifestPath: null,
        engine: '-',
        output: 'dist/theme.css',
        entry: null,
        status: 'missing-manifest',
        problems: [],
      });
      continue;
    }

    const resolved = resolveThemeStyle(themesDir, theme);
    if (!resolved) {
      themeBuilds.push({
        theme,
        manifestPath,
        engine: '-',
        output: 'dist/theme.css',
        entry: null,
        status: 'invalid-manifest',
        problems: ['manifesto não é um JSON válido'],
      });
      continue;
    }

    // O ThemeLoader recusa manifesto sem name/version — buildar seria trabalho
    // jogado fora.
    const problems: string[] = [];
    if (
      typeof resolved.manifest['name'] !== 'string' ||
      typeof resolved.manifest['version'] !== 'string'
    ) {
      problems.push('manifesto sem "name" e/ou "version"');
    }
    problems.push(...resolved.report.errors);

    const { report } = resolved;
    themeBuilds.push({
      theme,
      manifestPath,
      engine: report.engine,
      output: report.output,
      entry: report.entry,
      status: problems.length > 0 ? 'invalid-manifest' : report.entry ? 'build' : 'no-entry',
      problems,
    });
  }

  // ---- higiene do diretório canônico de migrations --------------------------
  const invalidExisting = listSql(migrationsDir).filter((file) => !MIGRATION_FILENAME.test(file));

  return { plugins, themes, migrations, themeBuilds, invalidExisting };
}

// ---------------------------------------------------------------------------
// Preparo no host
// ---------------------------------------------------------------------------

export interface StageResult {
  copied: string[];
  already: string[];
  conflicts: string[];
  invalid: string[];
}

/**
 * Copia o SQL de plugin para `migrations/` (o único diretório que o runner
 * lê). Idempotente: arquivo idêntico não é tocado, arquivo divergente é
 * PRESERVADO — `migrations/` pertence ao operador e a versão aplicada no
 * banco já tem checksum registrado.
 */
export function stagePluginMigrations(plan: RedeployPlan): StageResult {
  const result: StageResult = { copied: [], already: [], conflicts: [], invalid: [] };

  for (const entry of plan.migrations) {
    if (entry.status === 'invalid') {
      result.invalid.push(`${entry.plugin}: ${entry.file}`);
      continue;
    }
    if (entry.status === 'conflict') {
      result.conflicts.push(`${entry.plugin}: ${entry.file}`);
      continue;
    }
    if (entry.status === 'staged') {
      result.already.push(`${entry.plugin}: ${entry.file}`);
      continue;
    }
    mkdirSync(dirname(entry.target), { recursive: true });
    copyFileSync(entry.source, entry.target);
    result.copied.push(`${entry.plugin}: ${entry.file}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export interface RenderPlanOptions {
  skipMigrations?: boolean;
  skipThemeBuild?: boolean;
}

/** Linhas do resumo do redeploy — puras, para `--dry-run` e para os testes. */
export function renderPlan(plan: RedeployPlan, opts: RenderPlanOptions = {}): string[] {
  const lines: string[] = [];

  lines.push(`plugins: ${plan.plugins.length > 0 ? plan.plugins.join(', ') : 'nenhum'}`);
  lines.push(`temas: ${plan.themes.length > 0 ? plan.themes.join(', ') : 'nenhum'}`);

  if (opts.skipMigrations) {
    lines.push('migrations de plugin: puladas (--skip-migrations)');
  } else if (plan.migrations.length === 0) {
    lines.push('migrations de plugin: nenhuma');
  } else {
    lines.push('migrations de plugin (plugins/*/migrations → migrations/):');
    for (const entry of plan.migrations) {
      const who = `${entry.plugin}: ${entry.file}`;
      if (entry.status === 'new') lines.push(`  + ${who} → migrations/ (novo)`);
      else if (entry.status === 'staged') lines.push(`  = ${who} (já em migrations/)`);
      else if (entry.status === 'conflict')
        lines.push(`  ! ${who} difere do que já está em migrations/ — mantido o do projeto`);
      else lines.push(`  ! ${who} fora do padrão V###__owner__nome.sql — não copiado`);
    }
  }

  if (opts.skipThemeBuild) {
    lines.push('build de tema: pulado (--skip-theme-build)');
  } else if (plan.themeBuilds.length === 0) {
    lines.push('build de tema: nenhum tema instalado');
  } else {
    lines.push('build de tema:');
    for (const entry of plan.themeBuilds) {
      if (entry.status === 'build') {
        lines.push(`  ✓ ${entry.theme} — ${entry.engine} → ${entry.output}`);
      } else if (entry.status === 'no-entry') {
        lines.push(`  - ${entry.theme} — sem entrada de estilo (${entry.engine})`);
      } else if (entry.status === 'missing-manifest') {
        lines.push(`  ! ${entry.theme} — sem theme.json`);
      } else {
        lines.push(`  ! ${entry.theme} — manifest recusado: ${entry.problems.join('; ')}`);
      }
    }
  }

  for (const file of plan.invalidExisting) {
    lines.push(`  ! migrations/${file} fora do padrão V###__owner__nome.sql — quebra todo db:migrate`);
  }

  lines.push('ordem: stage no host → build da imagem → migrations → health → swap → worker → down');

  return lines;
}

// ---------------------------------------------------------------------------
// Comando
// ---------------------------------------------------------------------------

export interface RedeployOptions {
  cwd?: string;
  runner?: Runner;
  prompt?: Prompt;
  /** Só prepara as migrations deste plugin. */
  plugin?: string;
  /** Só compila este tema. */
  theme?: string;
  /** `--skip-migrations`: não copia SQL de plugin para `migrations/`. */
  skipMigrations?: boolean;
  /** `--skip-theme-build`: não compila estilos (útil só para rebuild de plugin). */
  skipThemeBuild?: boolean;
  /** `--dry-run`: mostra o plano e sai sem tocar em nada. */
  dryRun?: boolean;
  /** `--no-cache`: build limpo da imagem. */
  noCache?: boolean;
  /** `--remove-orphans` / `--keep-orphans`. */
  removeOrphans?: boolean;
  keepOrphans?: boolean;
  /** `--yes`: nenhum prompt, tudo em default. */
  yes?: boolean;
  /** `--force`: permite rodar dentro de container (não recomendado). */
  force?: boolean;
  probe?: ContainerProbe;
  log?: (message: string) => void;
}

export async function runRedeploy(opts: RedeployOptions = {}): Promise<number> {
  const prompt = opts.prompt ?? new Prompt();
  const ownsPrompt = opts.prompt === undefined;
  const cwd = opts.cwd ?? process.cwd();
  const write = opts.log ?? ((message: string): void => prompt.write(message));

  // Mesmo motivo do `okcms update`: dentro de um container a CLI viraria um
  // executor de `bun add` na rede do banco, com o .env na mão.
  const guard = assertHostOnly('okcms redeploy', { force: opts.force, probe: opts.probe });
  if (!guard.ok) {
    console.error(guard.message);
    if (ownsPrompt) prompt.close();
    return 1;
  }

  const onInterrupt = (): void => {
    prompt.write(`\n  interrompido — nenhuma troca de lane em andamento foi registrada.\n`);
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    const plan = planRedeploy({ cwd, plugin: opts.plugin, theme: opts.theme });
    const config = loadProjectConfig(cwd);
    const themesDir = join(cwd, config.themesDir);

    if (opts.plugin && !plan.plugins.includes(opts.plugin)) {
      prompt.error(`plugin não encontrado: ${opts.plugin}`);
      prompt.info(`instalados: ${plan.plugins.join(', ') || 'nenhum'}`);
      return 1;
    }
    if (opts.theme && !plan.themes.includes(opts.theme)) {
      prompt.error(`tema não encontrado: ${opts.theme}`);
      prompt.info(`instalados: ${plan.themes.join(', ') || 'nenhum'}`);
      return 1;
    }

    prompt.heading('OkCMS redeploy');
    for (const line of renderPlan(plan, opts)) write(`${line}\n`);

    // `.sql` inválido em migrations/ derruba o `db:migrate` do passo 5 do
    // deploy. Falhar aqui é melhor que falhar no meio do blue/green.
    if (plan.invalidExisting.length > 0) {
      prompt.error(
        `${plan.invalidExisting.length} arquivo(s) em migrations/ fora do padrão ` +
          `V###__owner__nome.sql — o db:migrate falharia. Renomeie ou remova.`
      );
      return 1;
    }

    if (opts.dryRun) {
      prompt.info('dry-run: nada foi executado.');
      return 0;
    }

    const choices: DeployChoices = await resolveDeployChoices(opts, prompt);
    const interactive = prompt.interactive && opts.yes !== true;

    if (interactive) {
      prompt.heading('Resumo do redeploy');
      prompt.info(
        `stage: ${plan.migrations.filter((m) => m.status === 'new').length} migration(s) de plugin`
      );
      prompt.info(
        `build de estilo: ${plan.themeBuilds.filter((t) => t.status === 'build').length} tema(s)`
      );
      prompt.info(`imagem: ${choices.noCache ? 'sem cache' : 'com cache de camadas'}`);
      prompt.info(`órfãos da lane antiga: ${choices.removeOrphans ? 'remover' : 'manter'}`);
      const confirmed = await prompt.confirm('Iniciar redeploy?', { defaultValue: true });
      if (!confirmed) {
        prompt.warn('cancelado — nada foi executado.');
        return 0;
      }
    }

    // ---- stage de migrations ----------------------------------------------
    if (opts.skipMigrations) {
      const pending = plan.migrations.filter((m) => m.status === 'new').length;
      if (pending > 0) {
        prompt.warn(`${pending} migration(s) de plugin não copiadas (--skip-migrations).`);
      }
    } else {
      const staged = stagePluginMigrations(plan);
      for (const item of staged.copied) write(`  + migrations: ${item}\n`);
      if (staged.copied.length > 0) {
        prompt.success(`${staged.copied.length} migration(s) de plugin em migrations/`);
      }
      for (const item of staged.conflicts) prompt.warn(`conflito (mantido o do projeto): ${item}`);
      for (const item of staged.invalid) prompt.warn(`fora do padrão, não copiada: ${item}`);
    }

    // ---- build de estilo ---------------------------------------------------
    const toBuild = plan.themeBuilds.filter((entry) => entry.status === 'build');
    if (opts.skipThemeBuild) {
      if (toBuild.length > 0) {
        prompt.warn(`${toBuild.length} tema(s) sem build de estilo (--skip-theme-build).`);
      }
    } else {
      for (const entry of toBuild) {
        try {
          const outcome = await buildThemeStylesOnDisk(themesDir, entry.theme);
          for (const warning of outcome.warnings) prompt.warn(`${entry.theme}: ${warning}`);
          write(
            `  ✓ tema ${outcome.theme}: ${outcome.engine} → ${outcome.output} ` +
              `(${outcome.bytes} bytes, isolated=${outcome.isolated})\n`
          );
        } catch (error) {
          prompt.error(
            `build do tema ${entry.theme} falhou: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          prompt.warn('nada foi buildado nem trocado — a lane atual segue no ar.');
          return 1;
        }
      }
      for (const entry of plan.themeBuilds) {
        if (entry.status === 'missing-manifest') {
          prompt.warn(`${entry.theme}: sem theme.json — ignorado.`);
        } else if (entry.status === 'invalid-manifest') {
          prompt.warn(`${entry.theme}: manifest recusado — ${entry.problems.join('; ')}`);
        }
      }
    }

    // ---- deploy blue/green -------------------------------------------------
    const result = await deployBlueGreen({
      cwd,
      runner: opts.runner,
      choices,
      // Sem `bun add`: o que mudou é conteúdo de extensão, não versão de
      // pacote. Só instala tudo quando o host nem tem node_modules — sem ele
      // o `db:migrate` do passo 5 não tem como rodar.
      packages: [],
      installAll: !existsSync(join(cwd, 'node_modules', '@oktis-works')),
      log: write,
      warn: write,
    });

    if (result.ok) {
      prompt.success(
        `redeploy concluído na lane ${result.lane}` +
          (result.previousLane ? ` (lane anterior: ${result.previousLane})` : '')
      );
    }
    return result.ok ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (ownsPrompt) prompt.close();
  }
}
