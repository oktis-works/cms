// @oktis-works/cms - `okcms redeploy` (F4)
//
// Installing a plugin/theme on the host still does not change what is running:
//
//   plugins and themes enter the image through the Dockerfile `COPY . .` (the
//   `.dockerignore` keeps them on purpose) — without a rebuild the container
//   keeps serving the old copy;
//
//   `themes/<n>/dist/theme.css` only exists if the style build ran on the
//   host: the web app links that ready file, it is not compiled inside the
//   container;
//
//   a plugin that touches the database ships SQL in `plugins/<n>/migrations/`,
//   which must reach `migrations/` for `db:migrate` to apply it — the runner
//   reads ONE directory and classifies as PLUGIN every owner that is not
//   `core` (`V###__owner__name.sql`, tracked as `owner:version`).
//
// Redeploy = prepare on the host (SQL staging + theme build) and then hand the
// switch to the chosen target — blue/green lanes, the simple stack or PM2 —
// always without `bun add`: what changed is extension content, not a package
// version.
//
// Order and guarantees are the normal deploy's: a preparation failure = no
// build and no switch; a deploy failure = rollback, and the lane that was
// serving keeps serving.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { deployBlueGreen, type DeployChoices } from './bluegreen.js';
import { deploySimple } from './simple.js';
import { deployPm2 } from './pm2.js';
import { resolveTarget, saveTarget, type DeployTarget } from './deploy-target.js';
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
        problems: ['manifest is not valid JSON'],
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
      problems.push('manifest without "name" and/or "version"');
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
  /** Deploy target — only the last line (the order) depends on it. */
  target?: DeployTarget;
}

/** Redeploy summary lines — pure, for `--dry-run` and for the tests. */
export function renderPlan(plan: RedeployPlan, opts: RenderPlanOptions = {}): string[] {
  const lines: string[] = [];

  lines.push(`plugins: ${plan.plugins.length > 0 ? plan.plugins.join(', ') : 'none'}`);
  lines.push(`themes: ${plan.themes.length > 0 ? plan.themes.join(', ') : 'none'}`);

  if (opts.skipMigrations) {
    lines.push('plugin migrations: skipped (--skip-migrations)');
  } else if (plan.migrations.length === 0) {
    lines.push('plugin migrations: none');
  } else {
    lines.push('plugin migrations (plugins/*/migrations → migrations/):');
    for (const entry of plan.migrations) {
      const who = `${entry.plugin}: ${entry.file}`;
      if (entry.status === 'new') lines.push(`  + ${who} → migrations/ (new)`);
      else if (entry.status === 'staged') lines.push(`  = ${who} (already in migrations/)`);
      else if (entry.status === 'conflict')
        lines.push(`  ! ${who} differs from migrations/ — project copy kept`);
      else lines.push(`  ! ${who} does not match V###__owner__name.sql — not copied`);
    }
  }

  if (opts.skipThemeBuild) {
    lines.push('theme build: skipped (--skip-theme-build)');
  } else if (plan.themeBuilds.length === 0) {
    lines.push('theme build: no theme installed');
  } else {
    lines.push('theme build:');
    for (const entry of plan.themeBuilds) {
      if (entry.status === 'build') {
        lines.push(`  ✓ ${entry.theme} — ${entry.engine} → ${entry.output}`);
      } else if (entry.status === 'no-entry') {
        lines.push(`  - ${entry.theme} — no style entry (${entry.engine})`);
      } else if (entry.status === 'missing-manifest') {
        lines.push(`  ! ${entry.theme} — no theme.json`);
      } else {
        lines.push(`  ! ${entry.theme} — manifest rejected: ${entry.problems.join('; ')}`);
      }
    }
  }

  for (const file of plan.invalidExisting) {
    lines.push(`  ! migrations/${file} does not match V###__owner__name.sql — breaks every db:migrate`);
  }

  lines.push(orderLine(opts.target ?? 'blue-green'));

  return lines;
}

/** The deploy order for the chosen target (the plan's last line). */
function orderLine(target: DeployTarget): string {
  if (target === 'pm2') {
    return 'order: stage on host → migrations → pm2 startOrReload';
  }
  if (target === 'simple') {
    return 'order: stage on host → build image → migrations → up -d → proxy → health';
  }
  return 'order: stage on host → build image → migrations → health → swap → worker → down';
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
  /** `--target blue-green|simple|pm2` (pula o menu). */
  target?: string;
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
    prompt.write(`\n  interrupted — no lane switch in progress was recorded.\n`);
    process.exit(130);
  };
  process.once('SIGINT', onInterrupt);

  try {
    const plan = planRedeploy({ cwd, plugin: opts.plugin, theme: opts.theme });
    const config = loadProjectConfig(cwd);
    const themesDir = join(cwd, config.themesDir);

    if (opts.plugin && !plan.plugins.includes(opts.plugin)) {
      prompt.error(`plugin not found: ${opts.plugin}`);
      prompt.info(`installed: ${plan.plugins.join(', ') || 'none'}`);
      return 1;
    }
    if (opts.theme && !plan.themes.includes(opts.theme)) {
      prompt.error(`theme not found: ${opts.theme}`);
      prompt.info(`installed: ${plan.themes.join(', ') || 'none'}`);
      return 1;
    }

    // ---- deploy target (arrow menu, last choice remembered) ---------------
    let target: DeployTarget;
    try {
      target = await resolveTarget({ cwd, target: opts.target, yes: opts.yes }, prompt);
    } catch (error) {
      prompt.error(error instanceof Error ? error.message : String(error));
      return 1;
    }

    prompt.heading('OkCMS redeploy');
    for (const line of renderPlan(plan, { ...opts, target })) write(`${line}\n`);

    // A stray `.sql` in migrations/ breaks step 5 of the deploy (`db:migrate`).
    // Failing here beats failing in the middle of a blue/green switch.
    if (plan.invalidExisting.length > 0) {
      prompt.error(
        `${plan.invalidExisting.length} file(s) in migrations/ do not match ` +
          `V###__owner__name.sql — db:migrate would fail. Rename or remove them.`
      );
      return 1;
    }

    if (opts.dryRun) {
      prompt.info('dry-run: nothing was executed.');
      return 0;
    }

    const choices: DeployChoices = await resolveDeployChoices(opts, prompt, target);
    const interactive = prompt.interactive && opts.yes !== true;

    if (interactive) {
      prompt.heading(`Redeploy summary — ${target}`);
      prompt.info(
        `stage: ${plan.migrations.filter((m) => m.status === 'new').length} plugin migration(s)`
      );
      prompt.info(
        `style build: ${plan.themeBuilds.filter((t) => t.status === 'build').length} theme(s)`
      );
      if (target === 'pm2') {
        prompt.info('host: PM2 startOrReload (no docker build)');
      } else {
        prompt.info(`image: ${choices.noCache ? 'no cache' : 'layer cache'}`);
        if (target === 'blue-green') {
          prompt.info(`old lane orphans: ${choices.removeOrphans ? 'remove' : 'keep'}`);
        }
      }
      const confirmed = await prompt.confirm('Start the redeploy?', { defaultValue: true });
      if (!confirmed) {
        prompt.warn('cancelled — nothing was executed.');
        return 0;
      }
    }

    // ---- plugin migrations staging ----------------------------------------
    if (opts.skipMigrations) {
      const pending = plan.migrations.filter((m) => m.status === 'new').length;
      if (pending > 0) {
        prompt.warn(`${pending} plugin migration(s) not copied (--skip-migrations).`);
      }
    } else {
      const staged = stagePluginMigrations(plan);
      for (const item of staged.copied) write(`  + migrations: ${item}\n`);
      if (staged.copied.length > 0) {
        prompt.success(`${staged.copied.length} plugin migration(s) staged in migrations/`);
      }
      for (const item of staged.conflicts) prompt.warn(`conflict (project copy kept): ${item}`);
      for (const item of staged.invalid) prompt.warn(`off-pattern, not copied: ${item}`);
    }

    // ---- theme style build -------------------------------------------------
    const toBuild = plan.themeBuilds.filter((entry) => entry.status === 'build');
    if (opts.skipThemeBuild) {
      if (toBuild.length > 0) {
        prompt.warn(`${toBuild.length} theme(s) without a style build (--skip-theme-build).`);
      }
    } else {
      for (const entry of toBuild) {
        try {
          const outcome = await buildThemeStylesOnDisk(themesDir, entry.theme);
          for (const warning of outcome.warnings) prompt.warn(`${entry.theme}: ${warning}`);
          write(
            `  ✓ theme ${outcome.theme}: ${outcome.engine} → ${outcome.output} ` +
              `(${outcome.bytes} bytes, isolated=${outcome.isolated})\n`
          );
        } catch (error) {
          prompt.error(
            `theme build failed for ${entry.theme}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          prompt.warn('nothing was built or switched — the current stack keeps serving.');
          return 1;
        }
      }
      for (const entry of plan.themeBuilds) {
        if (entry.status === 'missing-manifest') {
          prompt.warn(`${entry.theme}: no theme.json — skipped.`);
        } else if (entry.status === 'invalid-manifest') {
          prompt.warn(`${entry.theme}: manifest rejected — ${entry.problems.join('; ')}`);
        }
      }
    }

    // ---- deploy ------------------------------------------------------------
    const installAll = !existsSync(join(cwd, 'node_modules', '@oktis-works'));

    if (target === 'pm2') {
      // No image is built here, so the staged SQL is applied by the same
      // `db:migrate` PM2 always runs before reloading.
      const code = await deployPm2({
        cwd,
        prompt,
        runner: opts.runner,
        install: false,
        yes: opts.yes === true,
      });
      if (code === 0) saveTarget(cwd, 'pm2');
      return code;
    }

    if (target === 'simple') {
      const result = await deploySimple({
        cwd,
        runner: opts.runner,
        noCache: opts.noCache === true,
        packages: [],
        installAll,
        log: write,
        warn: write,
      });
      if (!result.ok) return 1;
      saveTarget(cwd, 'simple');
      prompt.success('redeploy done on the simple stack');
      return 0;
    }

    const result = await deployBlueGreen({
      cwd,
      runner: opts.runner,
      choices,
      // No `bun add`: what changed is extension content, not a package version.
      // Everything is installed only when the host has no node_modules —
      // without it step 5 (`db:migrate`) has nothing to run.
      packages: [],
      installAll,
      log: write,
      warn: write,
    });

    if (result.ok) {
      saveTarget(cwd, 'blue-green');
      prompt.success(
        `redeploy done on lane ${result.lane}` +
          (result.previousLane ? ` (previous lane: ${result.previousLane})` : '')
      );
    }
    return result.ok ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    if (ownsPrompt) prompt.close();
  }
}
