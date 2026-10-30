import { basename, resolve } from 'node:path';
import { initDb } from './db-init.js';
import { getMigrationsDir, prepareDb } from './db-prepare.js';
import { VALID_ROLES, createUserAccount } from './users.js';
import type { DocsLang } from './scaffold-docs.js';
import { style } from './prompt.js';

export interface Option {
  name: string;
  alias: string;
  description: string;
  required: boolean;
  default?: string;
  /**
   * Aceita repetição no comando (`--set A=1 --set B=2`). O parser acumula
   * múltiplas ocorrências em `KEY` separadas por `\n` — sem isso a segunda
   * ocorrência sobrescreveria a primeira silenciosamente.
   */
  repeatable?: boolean;
  /** Value contract shared by the parser and the interactive wizard. */
  type?: 'value' | 'boolean';
  /** Optional value validation shared by parser and generated command forms. */
  valueKind?: 'enum' | 'path' | 'url' | 'tenant' | 'version' | 'integer';
  choices?: readonly string[];
}

export interface PositionalArgs {
  /** Maximum number of positional values accepted by the command. */
  max: number;
  /** Human-readable label used in validation errors. */
  label?: string;
}

const BOOLEAN_OPTION_NAMES = new Set([
  'no-install', 'api', 'admin', 'web', 'worker', 'all',
  'yes', 'skip-start', 'no-infra', 'force', 'list', 'show-secrets', 'non-interactive',
  'install', 'no-cache', 'remove-orphans', 'keep-orphans',
  'skip-migrations', 'skip-theme-build', 'dry-run', 'adopt-legacy',
  'json',
  'clean', 'info', 'enable', 'disable', 'uninstall', 'set-active',
]);

export function optionTakesValue(option: Option | undefined): boolean {
  if (!option) return true;
  if (option.type) return option.type === 'value';
  return !BOOLEAN_OPTION_NAMES.has(option.name);
}

export interface Command {
  name: string;
  description: string;
  options: Option[];
  positionals?: PositionalArgs;
  handler: (args: string[], options: Record<string, string>) => Promise<void>;
}

export const commands: Command[] = [
  {
    name: 'wp',
    description: 'WordPress migration tools (import, validate)',
    options: [
      { name: 'help', alias: 'h', description: 'Show help for wp subcommands', required: false },
    ],
    positionals: { max: 1, label: 'subcommand (import|validate)' },
    handler: async (args, options) => {
      const subcommand = args[0] ?? 'help';
      if (subcommand === 'help' || options['help'] !== undefined) {
        console.log(`
Usage: okcms wp <subcommand> [options]

Subcommands:
  import    Import WordPress database into OkCMS
  validate  Validate WordPress database structure without migrating

Run 'okcms wp import --help' or 'okcms wp validate --help' for subcommand options.
        `);
        return;
      }
      // Delegate to subcommand handler
      const { runWPImport, runWPValidate } = await import('./wp-migrate/index.js');
      if (subcommand === 'import') {
        await runWPImport(args.slice(1), options);
      } else if (subcommand === 'validate') {
        await runWPValidate(args.slice(1), options);
      } else {
        console.error(`Unknown wp subcommand: ${subcommand}`);
        console.log('Run "okcms wp --help" for usage.');
        process.exitCode = 1;
      }
    },
  },
  {
    name: 'init',
    description: 'Scaffold a new OkCMS project in a directory',
    positionals: { max: 2, label: 'project directory and optional project name' },
    options: [
      { name: 'dir', alias: 'd', description: 'Target directory (same as positional arg)', required: false },
      {
        name: 'lang',
        alias: 'l',
        description: 'Docs language for README/PLUGIN/THEME: en or pt (asks when interactive, default en)',
        required: false,
        valueKind: 'enum',
        choices: ['en', 'pt'],
      },
      {
        name: 'no-install',
        alias: 'n',
        description: 'Skip dependency install (and the install prompt)',
        required: false,
      },
      {
        name: 'db-engine',
        alias: 'e',
        description: 'Database provider: postgres, mysql, or mariadb',
        required: false,
        valueKind: 'enum',
        choices: ['postgres', 'mysql', 'mariadb'],
      },
    ],
    handler: async (args, options) => {
      const { scaffoldProject } = await import('./scaffold.js');
      const { DEFAULT_DOCS_LANG, parseDocsLang } = await import('./scaffold-docs.js');
      const { Prompt } = await import('./prompt.js');

      const prompt = new Prompt();

      // Language of the generated docs (.md only — the code never changes
      // language). `--lang en|pt` decides without a TTY (CI/script); with a TTY
      // and no flag, an arrow menu asks; without either, English is the default.
      const rawLang = options['lang'];
      let lang: DocsLang;
      if (rawLang !== undefined && rawLang !== 'true') {
        const parsed = parseDocsLang(rawLang);
        if (parsed === null) {
          throw new Error(`invalid --lang "${rawLang}" — use en or pt`);
        }
        lang = parsed;
      } else if (rawLang === 'true') {
        throw new Error('--lang requires a value: en or pt');
      } else if (prompt.interactive) {
        lang = await prompt.select<DocsLang>(
          'Docs language (README.md, PLUGIN.md, THEME.md)',
          [
            { value: 'en', label: 'English', hint: 'default' },
            { value: 'pt', label: 'Português (Brasil)' },
          ],
          { defaultValue: DEFAULT_DOCS_LANG }
        );
      } else {
        lang = DEFAULT_DOCS_LANG;
      }

      const dbEngine = options['db-engine'] ?? 'postgres';
      if (!['postgres', 'mysql', 'mariadb'].includes(dbEngine)) {
        throw new Error(`invalid --db-engine "${dbEngine}" — use postgres, mysql, or mariadb`);
      }

      // Install the dependencies now? Same arrow-key menu as the language
      // selector. `--no-install` answers for scripts/CI; without a TTY the
      // default is Yes — pipelines keep getting an automatic install.
      let install = true;
      if (options['no-install'] !== undefined) {
        install = false;
      } else if (prompt.interactive) {
        install = await prompt.select<boolean>(
          'Install project dependencies now?',
          [
            { value: true, label: 'Yes', hint: 'recommended' },
            { value: false, label: 'No', hint: 'install later with bun/npm' },
          ],
          { defaultValue: true }
        );
      }

      // The positional arg wins over -d: `init my-site` must create my-site
      // (the parser's default '.' would swallow args[0]). Without either, an
      // interactive run asks where to put the project.
      let target = args[0] ?? options['dir'];
      if (target === undefined && prompt.interactive) {
        target = await prompt.ask('Project directory', { default: '.' });
      }
      target ??= '.';

      const name = args[1] ?? basename(resolve(target));
      const root = resolve(target);

      // Zero config: dependencies are installed right in `init` (bun, or npm
      // when bun is missing) — and BEFORE the summary, so the next steps are
      // the last thing on screen. The live loader (spinner + real package
      // versions) lives in install-loader.ts; without a TTY it prints static.
      await scaffoldProject(target, name, lang, async () => {
        if (!install) {
          console.log(
            style.gray('  → Dependencies not installed — run "bun install" (or "npm install")')
          );
          return;
        }
        const { installProjectDepsLive } = await import('./install-loader.js');
        const result = await installProjectDepsLive(root, { interactive: prompt.interactive });
        if (!result.ok) {
          throw new Error(
            `Dependency installation failed with ${result.tool}. ` +
            'The scaffold was preserved; run bun install or npm install and retry.'
          );
        }
      }, { provider: dbEngine as 'postgres' | 'mysql' | 'mariadb' });
      prompt.close();
    },
  },
  {
    name: 'start',
    description: 'Start API + Admin + Web + Worker apps for this project',
    options: [
      { name: 'api', alias: 'a', description: 'Start only the API', required: false },
      { name: 'admin', alias: 'm', description: 'Include admin app', required: false },
      { name: 'web', alias: 'w', description: 'Include web app', required: false },
      { name: 'worker', alias: 'W', description: 'Include background worker (queues)', required: false },
      { name: 'all', alias: 'A', description: 'Start all apps (default)', required: false },
    ],
    handler: async (_args, options) => {
      const { startProject } = await import('./start.js');
      await startProject(options);
    },
  },
  {
    name: 'stop',
    description: 'Stop apps started by `start` (via pidfile or process detection)',
    options: [],
    handler: async () => {
      const { stopAll, findRunningApps, clearPids } = await import('./runtime-state.js');
      const results = stopAll();

      if (results.length === 0) {
        const fallback = findRunningApps();
        for (const proc of fallback) {
          try {
            process.kill(proc.pid, 'SIGTERM');
            console.log(`[stop] ${proc.label} (pid ${proc.pid}) finished`);
          } catch {
            console.error(`[stop] failed to stop ${proc.label} (pid ${proc.pid})`);
          }
        }
        if (fallback.length === 0) {
          console.log('No apps running.');
        }
        clearPids();
        return;
      }

      for (const result of results) {
        if (result.stopped) {
          console.log(`[stop] ${result.label} (pid ${result.pid}) finished`);
        } else {
          console.log(`[stop] ${result.label} (pid ${result.pid}) was no longer running`);
        }
      }
      clearPids();
    },
  },
  {
    name: 'status',
    description: 'Show status of apps started by `start` + project summary',
    options: [],
    handler: async () => {
      const { statusAll } = await import('./runtime-state.js');
      const { loadProjectConfig } = await import('./project-config.js');
      const config = loadProjectConfig();
      const processes = statusAll();

      console.log(`Project "${config.name}" — ports api:${config.ports.api} admin:${config.ports.admin} web:${config.ports.web}`);
      console.log(`Active theme: ${config.activeTheme || '(not set)'}`);

      if (processes.length === 0) {
        console.log('No pidfile found (use `okcms start`).');
        return;
      }

      for (const proc of processes) {
        console.log(`  ${proc.alive ? '●' : '○'} ${proc.label.padEnd(6)} pid=${proc.pid} started=${proc.startedAt}`);
      }
    },
  },
  {
    name: 'dev',
    description:
      'One-shot dev setup + run: complete .env → infra → migrations → first admin → start apps',
    options: [
      { name: 'yes', alias: 'y', description: 'No prompts: take every default', required: false },
      {
        name: 'skip-start',
        alias: 's',
        description: 'Prepare everything (env, infra, db, user) but do not start the apps',
        required: false,
      },
      {
        name: 'no-infra',
        alias: 'n',
        description: 'Do not start the Docker infrastructure (external Postgres)',
        required: false,
      },
      { name: 'email', alias: 'e', description: 'First admin email (required in non-TTY)', required: false },
      { name: 'name', alias: 'N', description: 'First admin name (required in non-TTY)', required: false },
      { name: 'password', alias: 'p', description: 'First admin password (required in non-TTY)', required: false },
      {
        name: 'force',
        alias: 'F',
        description: 'Allow running inside a container (not recommended)',
        required: false,
      },
    ],
    handler: async (_args, options) => {
      const { runDev } = await import('./dev.js');
      const code = await runDev({
        yes: options['yes'] !== undefined,
        skipStart: options['skip-start'] !== undefined,
        noInfra: options['no-infra'] !== undefined,
        force: options['force'] !== undefined,
        email: options['email'] ? String(options['email']) : undefined,
        name: options['name'] ? String(options['name']) : undefined,
        password: options['password'] ? String(options['password']) : undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'menu',
    description: 'Open the interactive wizard (same as running `okcms` with no args in a TTY)',
    options: [],
    handler: async () => {
      const { runWizard } = await import('./wizard.js');
      const code = await runWizard();
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'doctor',
    description: 'Environment diagnostics: node, .env, database, config, docker/compose/lane/proxy',
    options: [],
    handler: async () => {
      const { runDoctorChecks } = await import('./doctor.js');
      const results = await runDoctorChecks();
      let failed = 0;
      for (const check of results) {
        const icon = check.ok ? '\u2713' : check.required ? '\u2717' : '\u25CB';
        console.log(`  ${icon} ${check.name.padEnd(24)} ${check.detail}`);
        if (!check.ok && check.required) failed++;
      }
      if (failed > 0) {
        console.error(`doctor: ${failed} required problem(s) found`);
        process.exitCode = 1;
      } else {
        console.log('Environment OK.');
      }
    },
  },
  {
    name: 'plugin:create',
    description: 'Scaffold a minimal compatible plugin (--name)',
    options: [
      { name: 'name', alias: 'n', description: 'Plugin name', required: true },
      { name: 'dir', alias: 'd', description: 'Base directory (default: ./plugins)', required: false },
    ],
    handler: async (_args, options) => {
      const { scaffoldPlugin } = await import('./extension-scaffold.js');
      const name = options['name'];
      if (!name) {
        console.error('Plugin name is required (--name)');
        process.exit(1);
      }
      try {
        const result = scaffoldPlugin(name, options['dir']);
        console.log(`Plugin created at ${result.dir}`);
        console.log(`Compatibility validated against CMS ${result.manifest['compatibility'] ? '' : ''}(manifest.json)`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:create',
    description: 'Scaffold a minimal compatible theme (--name --style css|scss|tailwind)',
    options: [
      { name: 'name', alias: 'n', description: 'Theme name', required: true },
      { name: 'dir', alias: 'd', description: 'Base directory (default: ./themes)', required: false },
      { name: 'style', alias: 's', description: 'Style engine: css|scss|tailwind', required: false, valueKind: 'enum', choices: ['css', 'scss', 'tailwind'] },
    ],
    handler: async (_args, options) => {
      const { scaffoldTheme } = await import('./extension-scaffold.js');
      const name = options['name'];
      const style = (options['style'] ?? 'css') as 'css' | 'scss' | 'tailwind';
      if (!name) {
        console.error('Theme name is required (--name)');
        process.exit(1);
      }
      if (!['css', 'scss', 'tailwind'].includes(style)) {
        console.error('--style must be css|scss|tailwind');
        process.exit(1);
      }
      try {
        const result = scaffoldTheme(name, options['dir'], style);
        console.log(`Theme created at ${result.dir} (engine: ${style})`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:build',
    description: 'Compile theme styles (SCSS/Tailwind -> dist/theme.css with [data-theme] isolation)',
    options: [
      { name: 'name', alias: 'n', description: 'Theme name', required: true },
      { name: 'themes-dir', alias: 'd', description: 'Themes directory (default: ./themes)', required: false },
    ],
    handler: async (_args, options) => {
      const { join } = await import('node:path');
      const name = options['name'];
      if (!name) {
        console.error('--name required');
        process.exit(1);
      }
      const themesDir = options['themes-dir'] ?? join(process.cwd(), 'themes');
      try {
        const { buildThemeStylesOnDisk } = await import('./theme-build.js');
        const { migrateThemeManifests } = await import('./theme-migrate.js');
        // Unificação theme.json: migra manifesto legado antes do build (o
        // themeManifestPath só lê o nome canônico).
        for (const migrated of migrateThemeManifests(themesDir)) {
          console.log(`migrated theme manifest: ${migrated} -> theme.json`);
        }
        const outcome = await buildThemeStylesOnDisk(themesDir, name);
        for (const warning of outcome.warnings) console.warn(`warn: ${warning}`);
        if (outcome.skipped) {
          console.log(
            `[${name}] no style entry (${outcome.engine}) — nothing compiled, dist/theme.css left untouched`
          );
        } else {
          console.log(
            `[${name}] ${outcome.engine} -> ${outcome.output} (${outcome.bytes} bytes) isolated=${outcome.isolated}`
          );
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    },
  },
  {
    name: 'build',
    description: 'Build project apps via bun filters (--apps api,admin,web)',
    options: [
      { name: 'apps', alias: 'a', description: 'Apps to build (default: api,admin,web)', required: false },
    ],
    handler: async (_args, options) => {
      const { runProjectBuild, isWorkspaceProject } = await import('./build.js');
      // Projeto scaffold (sem workspaces) não tem o que buildar: os apps do
      // OkCMS vêm pré-compilados do npm — o `bun run --filter` falharia com
      // "No packages matched the filter".
      if (!isWorkspaceProject(process.cwd())) {
        console.log('OkCMS apps come pre-built from npm — nothing to build in this project.');
        console.log('To compile theme styles use: okcms theme:build --name <theme>');
        return;
      }
      const appsArg = options['apps'];
      const apps = appsArg
        ? (appsArg.split(',').map((s) => s.trim()) as Array<'api' | 'admin' | 'web'>)
        : undefined;
      const started = Date.now();
      const { results, ok } = runProjectBuild({ apps });
      for (const step of results) {
        const icon = step.ok ? '\u2713' : '\u2717';
        console.log(`  ${icon} ${step.label.padEnd(6)} ${step.durationMs}ms`);
        if (!step.ok && step.output) {
          console.error(step.output.split('\n').slice(-10).join('\n'));
        }
      }
      console.log(ok ? `Build completed in ${Date.now() - started}ms.` : 'Build failed.');
      process.exitCode = ok ? 0 : 1;
    },
  },
  {
    name: 'config',
    description:
      'Environment variables wizard (.env) — interactive, or --list / --set KEY=value',
    options: [
      { name: 'set', alias: 's', description: 'Set a key (repeat for more): --set PORT=3000', required: false, repeatable: true },
      { name: 'list', alias: 'l', description: 'List .env keys (secrets masked)', required: false },
      { name: 'show-secrets', alias: 'S', description: 'With --list, show secrets unmasked', required: false },
      { name: 'non-interactive', alias: 'n', description: 'No TTY wait (CI) — output of --list', required: false },
      { name: 'section', alias: 'x', description: 'Open directly on a section (app|database|redis|auth|storage|worker|cache|ports|theme|deploy)', required: false },
      { name: 'force', alias: 'F', description: 'Allow running inside a container (not recommended)', required: false },
    ],
    handler: async (_args, options) => {
      const { runConfigWizard } = await import('./config-wizard.js');
      const code = await runConfigWizard({
        set: options['set'],
        list: options['list'] !== undefined,
        showSecrets: options['show-secrets'] !== undefined,
        nonInteractive: options['non-interactive'] !== undefined,
        section: options['section'],
        force: options['force'] !== undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'update',
    description:
      'Update packages and migrations, then deploy (blue/green, simple or PM2) — y/n wizard',
    options: [
      {
        name: 'install',
        alias: 'i',
        description: 'Legacy alias; full update already installs packages',
        required: false,
      },
      {
        name: 'mode',
        alias: 'm',
        description: 'Optional: download (packages only) or deploy (default)',
        required: false,
        valueKind: 'enum',
        choices: ['download', 'deploy'],
      },
      {
        name: 'target',
        alias: 't',
        description: 'Skip the target menu: blue-green | simple | pm2',
        required: false,
        valueKind: 'enum',
        choices: ['blue-green', 'simple', 'pm2'],
      },
      {
        name: 'no-cache',
        alias: 'c',
        description: 'Deploy: build --no-cache (clean rebuild, slower)',
        required: false,
      },
      {
        name: 'remove-orphans',
        alias: 'r',
        description: 'Deploy (blue/green): down --remove-orphans on the old lane (default)',
        required: false,
      },
      {
        name: 'keep-orphans',
        alias: 'k',
        description: 'Deploy (blue/green): keep the orphan containers of the old lane',
        required: false,
      },
      { name: 'dry-run', alias: 'n', description: 'Print the update plan and exit without changing anything', required: false, type: 'boolean' },
      { name: 'yes', alias: 'y', description: 'No prompts: take every default', required: false },
      {
        name: 'force',
        alias: 'F',
        description: 'Allow running inside a container (not recommended)',
        required: false,
      },
    ],
    handler: async (_args, options) => {
      const { runUpdate } = await import('./update.js');
      const code = await runUpdate({
        install: options['install'] !== undefined,
        mode: options['mode'],
        target: options['target'],
        noCache: options['no-cache'] !== undefined,
        removeOrphans: options['remove-orphans'] !== undefined,
        keepOrphans: options['keep-orphans'] !== undefined,
        dryRun: options['dry-run'] !== undefined,
        yes: options['yes'] !== undefined,
        force: options['force'] !== undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'redeploy',
    description: 'Apply a freshly installed plugin/theme: migrations + theme build + deploy',
    options: [
      { name: 'plugin', alias: 'p', description: 'Only prepare the migrations of this plugin', required: false },
      { name: 'theme', alias: 't', description: 'Only build this theme', required: false },
      {
        name: 'skip-migrations',
        alias: 'M',
        description: 'Do not copy plugin SQL into migrations/',
        required: false,
      },
      {
        name: 'skip-theme-build',
        alias: 'B',
        description: 'Do not compile theme styles',
        required: false,
      },
      { name: 'dry-run', alias: 'n', description: 'Show the plan and exit without running', required: false },
      {
        name: 'target',
        alias: 'T',
        description: 'Skip the target menu: blue-green | simple | pm2',
        required: false,
      },
      {
        name: 'no-cache',
        alias: 'c',
        description: 'Deploy: build --no-cache (clean rebuild, slower)',
        required: false,
      },
      {
        name: 'remove-orphans',
        alias: 'r',
        description: 'Deploy (blue/green): down --remove-orphans on the old lane (default)',
        required: false,
      },
      {
        name: 'keep-orphans',
        alias: 'k',
        description: 'Deploy (blue/green): keep the orphan containers of the old lane',
        required: false,
      },
      { name: 'yes', alias: 'y', description: 'No prompts: take every default', required: false },
      {
        name: 'force',
        alias: 'F',
        description: 'Allow running inside a container (not recommended)',
        required: false,
      },
    ],
    handler: async (_args, options) => {
      const { runRedeploy } = await import('./redeploy.js');
      const code = await runRedeploy({
        plugin: options['plugin'],
        theme: options['theme'],
        skipMigrations: options['skip-migrations'] !== undefined,
        skipThemeBuild: options['skip-theme-build'] !== undefined,
        dryRun: options['dry-run'] !== undefined,
        target: options['target'],
        noCache: options['no-cache'] !== undefined,
        removeOrphans: options['remove-orphans'] !== undefined,
        keepOrphans: options['keep-orphans'] !== undefined,
        yes: options['yes'] !== undefined,
        force: options['force'] !== undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'db:migrate',
    description: 'Run pending database migrations',
    options: [
      { name: 'dir', alias: 'd', description: 'Migrations directory', required: false },
      { name: 'tenant', alias: 't', description: 'Tenant ID', required: false, default: 'default', valueKind: 'tenant' },
      { name: 'adopt-legacy', alias: 'a', description: 'Adopt a legacy database after backup and inventory review', required: false, type: 'boolean' },
    ],
    handler: async (args, options) => {
      const dir = getMigrationsDir(options);
      const { runMigrations } = await import('@oktis-works/database');
      // db:migrate SEMPRE precisa do tenant default existente para o contexto
      // RLS (set_config('app.current_tenant_id', ...)) funcionar nas migrações,
      // mesmo quando todas são de domain core_schema. Sem tenant, o UUID vazio
      // causa "invalid input syntax for type uuid: """.
      const tenantId = await prepareDb(options, {
        adoptLegacy: options['adopt-legacy'] !== undefined,
        createDefaultTenant: true,
        resolveTenant: true,
      });
      const result = await runMigrations(tenantId, dir, { adoptLegacy: options['adopt-legacy'] !== undefined });
      if (result.applied.length === 0 && result.skipped.length === 0) {
        // migrations/ de projeto scaffoldado é VAZIO por design: o schema core
        // (inclusive deltas de versão nova, ex.: users.locale) é aplicado acima
        // pelo prepareDb via schema.sql — deixar isso explícito evita o "0, 0"
        // parecer uma migração que não rodou.
        console.log(`Applied: 0, Skipped: 0 — no .sql files in ${dir}`);
        console.log('  (core schema is synced automatically by this command)');
        return;
      }
      console.log(`Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
      for (const name of result.applied) {
        console.log(`  + ${name}`);
      }
    },
  },
  {
    name: 'db:rollback',
    description: 'Rollback the last migration',
    options: [
      { name: 'dir', alias: 'd', description: 'Migrations directory', required: false },
      { name: 'tenant', alias: 't', description: 'Tenant ID', required: false, default: 'default', valueKind: 'tenant' },
      { name: 'domain', alias: 'D', description: 'Rollback domain: core_schema | tenant_data | plugin_schema', required: false, valueKind: 'enum', choices: ['core_schema', 'tenant_data', 'plugin_schema'] },
    ],
    handler: async (args, options) => {
      const tenantId = await prepareDb(options, { ensureSchema: false, createDefaultTenant: false });
      const { getAppliedMigrations, rollbackMigration, loadMigrationsFromDir } = await import('@oktis-works/database');
      const dir = getMigrationsDir(options);
      const applied = await getAppliedMigrations(tenantId);
      if (applied.length === 0) {
        console.log('No migrations to rollback');
        return;
      }
      const scoped = options['domain']
        ? applied.filter((migration) => migration.domain === options['domain'])
        : applied;
      if (scoped.length === 0) {
        console.log(`No applied migrations in domain ${options['domain']}`);
        return;
      }
      const last = [...scoped].sort(
        (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
      )[0]!;
      const allMigrations = loadMigrationsFromDir(dir);
      const migration = allMigrations.find(
        (m) => m.owner === last.owner && m.version === last.version
      );
      if (!migration) {
        console.error(`Migration file not found for: ${last.name}`);
        process.exit(1);
      }
      await rollbackMigration(tenantId, migration);
      console.log(`Rolled back: ${last.name}`);
    },
  },
  {
    name: 'db:status',
    description: 'Show migration status',
    options: [
      { name: 'dir', alias: 'd', description: 'Migrations directory', required: false },
      { name: 'tenant', alias: 't', description: 'Tenant ID', required: false, default: 'default', valueKind: 'tenant' },
    ],
    handler: async (args, options) => {
      const { getAppliedMigrations, loadMigrationsFromDir } = await import('@oktis-works/database');
      let tenantId: string;
      let applied: Awaited<ReturnType<typeof getAppliedMigrations>>;
      try {
        tenantId = await prepareDb(options, { ensureSchema: false, createDefaultTenant: false });
        applied = await getAppliedMigrations(tenantId);
      } catch (error) {
        console.error(`Database migration ledger is unavailable: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
        return;
      }
      const migrations = loadMigrationsFromDir(getMigrationsDir(options));
      const appliedByKey = new Map(applied.map((migration) => [`${migration.owner}:${migration.version}`, migration]));
      const filesByKey = new Map(migrations.map((migration) => [`${migration.owner}:${migration.version}`, migration]));
      const drifted = migrations.filter((migration) => {
        const record = appliedByKey.get(`${migration.owner}:${migration.version}`);
        return record !== undefined && record.checksum !== migration.checksum;
      });
      const pending = migrations.filter(
        (migration) => !appliedByKey.has(`${migration.owner}:${migration.version}`)
      );
      const missing = applied.filter(
        (migration) => !filesByKey.has(`${migration.owner}:${migration.version}`)
      );
      const blocked = drifted.length > 0 || missing.length > 0;

      console.log(`Applied: ${applied.length}`);
      console.log(`Pending: ${pending.length}`);
      console.log(`Drifted: ${drifted.length}`);
      console.log(`Missing: ${missing.length}`);
      console.log(`Orphaned: ${missing.length}`);
      console.log(`Blocked: ${blocked ? 'yes' : 'no'}`);
      for (const migration of drifted) {
        const record = appliedByKey.get(`${migration.owner}:${migration.version}`)!;
        console.log(`  ! ${migration.version} - ${migration.name} (checksum ${record.checksum} -> ${migration.checksum})`);
      }
      for (const migration of pending) {
        console.log(`  + ${migration.version} - ${migration.name} (pending)`);
      }
      for (const migration of missing) {
        console.log(`  ! ${migration.version} - ${migration.name} (orphaned ledger record has no local file)`);
      }
      if (blocked) process.exitCode = 1;
      if (applied.length > 0 && pending.length === 0 && !blocked) {
        console.log('Migration state is consistent.');
      }
    },
  },
  {
    name: 'db:inventory',
    description: 'Print the validated migration manifest (read-only)',
    options: [
      { name: 'dir', alias: 'd', description: 'Migrations directory', required: false },
      { name: 'json', alias: 'j', description: 'Print machine-readable JSON only', required: false, type: 'boolean' },
    ],
    handler: async (_args, options) => {
      const { buildMigrationManifest, loadMigrationsFromDir } = await import('@oktis-works/database');
      const manifest = buildMigrationManifest(loadMigrationsFromDir(getMigrationsDir(options)));
      if (options['json'] !== undefined) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }
      console.log(`Migration manifest: ${manifest.entries.length} file(s), provider=${manifest.provider}`);
      for (const entry of manifest.entries) {
        const metadata = entry.metadata;
        console.log(
          `  ${entry.id} ${metadata.domain} ${metadata.reversible ? 'reversible' : 'forward-only'}` +
          `${metadata.requiresBackup ? ' backup-required' : ''}`
        );
      }
    },
  },
  {
    name: 'db:backup',
    description: 'Backup the database using pg_dump (custom format)',
    options: [
      { name: 'out', alias: 'o', description: 'Output file (.dump). Defaults to timestamped name', required: false },
    ],
    handler: async (_args, options) => {
      const { backupDatabase } = await import('./db-dump.js');
      const result = backupDatabase({ out: options['out'] });
      if (!result.ok) {
        console.error(result.message);
        process.exitCode = 1;
        return;
      }
      console.log(result.message);
    },
  },
  {
    name: 'db:restore',
    description: 'Restore the database from a pg_dump custom-format file',
    positionals: { max: 1, label: 'dump file' },
    options: [
      { name: 'file', alias: 'f', description: 'Dump file to restore from (or the first positional argument)', required: false },
      { name: 'clean', alias: 'c', description: 'Drop objects before restore (--clean)', required: false },
      { name: 'target-database', alias: 'T', description: 'Require this PostgreSQL database name before restore', required: false },
      { name: 'max-age-hours', alias: 'H', description: 'Reject backups older than this many hours', required: false, valueKind: 'integer' },
    ],
    handler: async (args, options) => {
      const { restoreDatabase } = await import('./db-dump.js');
      const file = typeof options['file'] === 'string' ? options['file'] : args[0] ?? '';
      if (!file) {
        console.error('Dump file is required: use --file <path> or provide a positional path.');
        process.exitCode = 1;
        return;
      }
      const maxAgeHours = options['max-age-hours'] ? Number(options['max-age-hours']) : undefined;
      const result = restoreDatabase({
        file,
        clean: options['clean'] === 'true',
        expectedDatabase: options['target-database'],
        maxAgeMs: maxAgeHours === undefined ? undefined : maxAgeHours * 60 * 60 * 1000,
      });
      if (!result.ok) {
        console.error(result.message);
        process.exitCode = 1;
        return;
      }
      console.log(result.message);
    },
  },
  {
    name: 'plugin:install',
    description: 'Install a plugin from a local path into the project plugins dir',
    options: [
      { name: 'name', alias: 'n', description: 'Plugin name or path', required: true },
    ],
    handler: async (_args, options) => {
      const name = options['name'];
      if (!name) {
        console.error('Plugin name or path is required (--name)');
        process.exit(1);
      }
      const { installExtension } = await import('./installer.js');
      try {
        await installExtension('plugin', name);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    },
  },
  {
    name: 'plugin:list',
    description: 'List installed plugins',
    options: [],
    handler: async () => {
      const { listExtensions } = await import('./installer.js');
      listExtensions('plugin');
    },
  },
  {
    name: 'plugin:search',
    description: 'Search plugins in the npm registry (keywords:okcms-plugin)',
    options: [
      { name: 'query', alias: 'q', description: 'Search terms', required: false },
    ],
    handler: async (_args, options) => {
      const { searchExtensions } = await import('./npm-registry.js');
      try {
        const results = await searchExtensions('plugin', options['query'] ?? '');
        if (results.length === 0) {
          console.log('No plugins found.');
          return;
        }
        for (const result of results) {
          console.log(`  ${result.name}@${result.version} — ${result.description}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    },
  },
  {
    name: 'plugin:manage',
    description: 'Show info or enable/disable an installed plugin (--info | --enable | --disable)',
    options: [
      { name: 'name', alias: 'n', description: 'Plugin name', required: true },
      { name: 'info', alias: 'i', description: 'Show manifest info', required: false },
      { name: 'enable', alias: 'e', description: 'Enable the plugin for a tenant', required: false },
      { name: 'disable', alias: 'd', description: 'Disable the plugin for a tenant', required: false },
      { name: 'tenant', alias: 't', description: 'Tenant ID (required for --enable/--disable)', required: false, valueKind: 'tenant' },
      { name: 'uninstall', alias: 'u', description: 'Uninstall (remove files + registry)', required: false },
    ],
    handler: async (_args, options) => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { loadProjectConfig } = await import('./project-config.js');
      const { setEnabled, loadExtensionsState, uninstallExtension } = await import('./extensions-state.js');
      const { initDb } = await import('./db-init.js');
      const { pluginService } = await import('@oktis-works/core');
      const { runWithTenantTransaction } = await import('@oktis-works/database');

      const name = options['name'];
      if (!name) {
        console.error('Plugin name is required (--name)');
        process.exit(1);
      }

      if (options['uninstall'] !== undefined) {
        const result = uninstallExtension('plugin', name);
        if (!result.removed) {
          console.log(`Plugin "${name}" was not installed.`);
          process.exitCode = 1;
          return;
        }
        console.log(`Plugin "${name}" uninstalled (${result.targetDir}).`);
        return;
      }

      if (options['enable'] !== undefined || options['disable'] !== undefined) {
        const enabled = options['enable'] !== undefined;
        const tenantId = options['tenant'];
        
        if (!tenantId) {
          console.error('Tenant ID is required for --enable/--disable (use --tenant)');
          process.exitCode = 1;
          return;
        }

        try {
          await initDb();
          
          const plugin = await pluginService.getByName(name);
          if (!plugin) {
            console.error(`Plugin "${name}" not found.`);
            process.exitCode = 1;
            return;
          }

          await runWithTenantTransaction(tenantId, async () => {
            if (enabled) {
              await pluginService.activate(plugin.id, tenantId);
            } else {
              await pluginService.deactivate(plugin.id, tenantId);
            }
          });

          // Also update local state for consistency
          setEnabled('plugin', name, enabled);
          
          console.log(`Plugin "${name}" ${enabled ? 'enabled' : 'disabled'} for tenant "${tenantId}".`);
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to ${enabled ? 'enable' : 'disable'} plugin: ${message}`);
          process.exitCode = 1;
        }
        return;
      }

      // default/--info: mostra manifesto + estado
      const config = loadProjectConfig();
      const manifestPath = join(process.cwd(), config.pluginsDir, name, 'manifest.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
        const state = loadExtensionsState().plugins[name];
        console.log(`Name:        ${manifest['name'] ?? name}`);
        console.log(`Version:     ${manifest['version'] ?? '?'}`);
        console.log(`Description: ${manifest['description'] ?? '-'}`);
        console.log(`Entry:       ${manifest['main'] ?? '?'}`);
        console.log(`Permissions: ${(manifest['permissions'] as string[] | undefined)?.join(', ') ?? '-'}`);
        console.log(`State:       ${state?.enabled === false ? 'disabled' : 'enabled'}`);
      } catch {
        console.error(`Manifest not found at ${manifestPath}`);
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:install',
    description: 'Install a theme from a local path into the project themes dir',
    options: [
      { name: 'name', alias: 'n', description: 'Theme name or path', required: true },
    ],
    handler: async (_args, options) => {
      const name = options['name'];
      if (!name) {
        console.error('Theme name or path is required (--name)');
        process.exit(1);
      }
      const { installExtension } = await import('./installer.js');
      try {
        await installExtension('theme', name);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:list',
    description: 'List installed themes',
    options: [],
    handler: async () => {
      const { listExtensions } = await import('./installer.js');
      listExtensions('theme');
    },
  },
  {
    name: 'theme:search',
    description: 'Search themes in the npm registry (keywords:okcms-theme)',
    options: [
      { name: 'query', alias: 'q', description: 'Search terms', required: false },
    ],
    handler: async (_args, options) => {
      const { searchExtensions } = await import('./npm-registry.js');
      try {
        const results = await searchExtensions('theme', options['query'] ?? '');
        if (results.length === 0) {
          console.log('No themes found.');
          return;
        }
        for (const result of results) {
          console.log(`  ${result.name}@${result.version} — ${result.description}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:manage',
    description: 'Theme info / enable / disable / --set-active / --uninstall',
    options: [
      { name: 'name', alias: 'n', description: 'Theme name', required: true },
      { name: 'info', alias: 'i', description: 'Show theme.json info', required: false },
      { name: 'enable', alias: 'e', description: 'Enable the theme', required: false },
      { name: 'disable', alias: 'd', description: 'Disable the theme', required: false },
      { name: 'uninstall', alias: 'u', description: 'Uninstall (remove files + registry)', required: false },
      { name: 'set-active', alias: 's', description: 'Set as active theme', required: false },
    ],
    handler: async (_args, options) => {
      const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { loadProjectConfig, DEFAULT_CONFIG_FILENAME } = await import('./project-config.js');
      const { setEnabled, loadExtensionsState } = await import('./extensions-state.js');

      const name = options['name'];
      if (!name) {
        console.error('Theme name is required (--name)');
        process.exit(1);
      }

      // Unificação theme.json: migra manifesto legado (manifest.json) antes de
      // qualquer leitura — --info, --set-active (syncFromDirectory) e o
      // ThemeService só enxergam o nome canônico.
      const { migrateThemeManifests } = await import('./theme-migrate.js');
      migrateThemeManifests(join(process.cwd(), loadProjectConfig().themesDir));

      if (options['uninstall'] !== undefined) {
        const { uninstallExtension } = await import('./extensions-state.js');
        const result = uninstallExtension('theme', name);
        if (!result.removed) {
          console.log(`Theme "${name}" was not installed.`);
          process.exitCode = 1;
          return;
        }
        console.log(`Theme "${name}" uninstalled (${result.targetDir}).`);
        // Remove também o registro no banco (best-effort — sem banco, o
        // registro continua visível na tela Temas do admin para desinstalar).
        try {
          const { initDb } = await import('./db-init.js');
          await initDb();
          const { themeService } = await import('@oktis-works/core');
          const row = await themeService.getByName(name);
          if (row) await themeService.uninstall(row.id);
        } catch {
          // registro remanescente é tratável pela UI
        }
        return;
      }

      if (options['set-active'] !== undefined) {
        const configPath = join(process.cwd(), DEFAULT_CONFIG_FILENAME);

        if (!existsSync(configPath)) {
          console.error(`${DEFAULT_CONFIG_FILENAME} not found; run \`okcms init\` first.`);
          process.exit(1);
        }

        const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        raw['activeTheme'] = name;
        writeFileSync(configPath, JSON.stringify(raw, null, 2));

        // Fonte única do tema ativo em runtime é o BANCO (o site lê por
        // request) — sem gravar lá, a ativação via CLI seria ignorada ou
        // divergiria do status mostrado no admin.
        try {
          const { initDb } = await import('./db-init.js');
          await initDb();
          const { themeService } = await import('@oktis-works/core');
          await themeService.syncFromDirectory(); // registra temas do diretório (idempotente)
          const row = await themeService.getByName(name);
          if (row) {
            await themeService.activate(row.id);
            console.log(`Active theme set to "${name}" (config + banco).`);
          } else {
            console.log(`Active theme set to "${name}" (config; tema não descoberto no banco — abra a tela Temas do admin para sincronizar).`);
          }
        } catch {
          console.log(`Active theme set to "${name}" (config; banco indisponível — ative pelo admin depois).`);
        }
        return;
      }

      if (options['enable'] !== undefined || options['disable'] !== undefined) {
        const enabled = options['enable'] !== undefined;
        const ok = setEnabled('theme', name, enabled);
        console.log(ok ? `Theme "${name}" ${enabled ? 'enabled' : 'disabled'}.` : `Theme "${name}" is not registered.`);
        process.exitCode = ok ? 0 : 1;
        return;
      }

      const config = loadProjectConfig();
      const themeDir = join(process.cwd(), config.themesDir, name);
      const themeJsonPath = join(themeDir, 'theme.json');
      try {
        if (!existsSync(themeJsonPath)) throw new Error('manifesto não encontrado');
        const manifest = JSON.parse(readFileSync(themeJsonPath, 'utf-8')) as Record<string, unknown>;
        const provides = (manifest['provides'] ?? {}) as Record<string, unknown>;
        const state = loadExtensionsState().themes[name];
        console.log(`Name:       ${manifest['name'] ?? name}`);
        console.log(`Version:    ${manifest['version'] ?? '?'}`);
        console.log(`Author:     ${manifest['author'] ?? '-'}`);
        console.log(`Parent:     ${manifest['parent'] ?? '-'}`);
        console.log(`Layouts:    ${(provides['layouts'] as string[] | undefined)?.join(', ') ?? '-'}`);
        console.log(`Active:     ${config.activeTheme === name ? 'yes' : 'no'} (${config.activeTheme || 'none'})`);
        console.log(`State:      ${state?.enabled === false ? 'disabled' : 'enabled'}`);
      } catch {
        console.error(`theme.json not found at ${themeDir}`);
        process.exit(1);
      }
    },
  },
  {
    name: 'media:migrate',
    description: 'Migrate media files between storage drivers (local <-> s3/r2/minio)',
    options: [
      { name: 'from', alias: 'f', description: 'Source driver (local|s3|r2|minio)', required: true },
      { name: 'to', alias: 't', description: 'Target driver (local|s3|r2|minio)', required: true },
    ],
    handler: async (_args, options) => {
      const from = options['from'] ?? 'local';
      const to = options['to'] ?? 's3';
      console.log(`Migrating media from "${from}" to "${to}"...`);

      const { initDb } = await import('./db-init.js');
      await initDb();

      const { createMigrator } = await import('@oktis-works/core');
      const migrator = createMigrator(from, to);
      const result = await migrator.migrateAll();

      console.log(`Migrated: ${result.migrated}, Failed: ${result.failed}`);
      for (const err of result.errors) {
        console.error(`  ! ${err.filename}: ${err.error}`);
      }
    },
  },
  {
    name: 'user:create',
    description: 'Create a new user and assign a role in the tenant',
    options: [
      { name: 'email', alias: 'e', description: 'User email', required: true },
      { name: 'name', alias: 'n', description: 'User name', required: true },
      { name: 'password', alias: 'p', description: 'User password', required: true },
      { name: 'role', alias: 'r', description: `User role (${VALID_ROLES.join(', ')})`, required: false, default: 'EDITOR' },
      { name: 'tenant', alias: 't', description: 'Tenant slug', required: false, default: 'default', valueKind: 'tenant' },
    ],
    handler: async (_args, options) => {
      // A política RBAC usa slugs em maiúsculas: `--role editor` → EDITOR.
      const roleSlug = String(options['role'] ?? 'EDITOR').toUpperCase();
      try {
        await createUserAccount({
          email: String(options['email']),
          name: String(options['name']),
          password: String(options['password']),
          role: roleSlug,
          tenant: String(options['tenant'] ?? 'default'),
        });
        console.log(`✓ user created: ${options['email']} (role ${roleSlug})`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    },
  },
  {
    name: 'seed',
    description: 'Seed system data; use --demo for explicit demo content creation',
    options: [
      { name: 'demo', alias: 'd', description: 'Also create demo content (may replace existing demo records)', required: false },
      { name: 'yes', alias: 'y', description: 'Confirm demo seeding without an interactive prompt', required: false },
    ],
    handler: async (_args, options) => {
      await initDb();
      const { ensureCoreSchema, seedCoreData, seedDemoContent, seedActivateDefaultTheme } = await import('@oktis-works/database');
      const applied = await ensureCoreSchema();
      if (applied) {
        console.log('✓ core schema applied (database initialized)');
      }
      const { roles, settings } = await seedCoreData();
      console.log(`✓ seed completed: ${roles} roles, ${settings} settings created`);
      if (options['demo'] !== undefined) {
        if (options['yes'] === undefined) {
          const { Prompt } = await import('./prompt.js');
          const prompt = new Prompt();
          const confirmed = await prompt.confirm(
            'Demo seeding may remove and recreate demo records. Continue?',
            { defaultValue: false }
          );
          prompt.close();
          if (!confirmed) {
            console.log('Demo seed cancelled; system seed was completed.');
            return;
          }
        }
        const demo = await seedDemoContent();
        const total = demo.pages + demo.posts + demo.menus + demo.readingSettings;
        if (total > 0) {
          console.log(`✓ demo content: ${demo.pages} pages, ${demo.posts} posts, ${demo.menus} menus, ${demo.readingSettings} reading settings`);
        }
      }
      try {
        await seedActivateDefaultTheme();
        console.log('✓ default theme activated');
      } catch (error) {
        console.warn('⚠ default theme activation failed:', error instanceof Error ? error.message : error);
      }
    },
  },
  {
    name: 'system:status',
    description: 'Show system status (environment + database health)',
    options: [],
    handler: async () => {
      const { healthCheck } = await import('@oktis-works/database');
      const { loadConfig } = await import('@oktis-works/config');
      const config = loadConfig();
      console.log('OkCMS Status');
      console.log(`  Environment: ${config.app.nodeEnv}`);
      console.log(`  Host: ${config.app.host}:${config.app.port}`);
      const dbOk = await healthCheck();
      console.log(`  Database: ${dbOk ? 'connected' : 'disconnected'}`);
    },
  },
  {
    name: 'i18n:extract',
    description: 'Extract plugin translation keys (api.i18n.translate/__()) into locales/<locale>.json',
    options: [
      { name: 'dir', alias: 'd', description: 'Base directory containing plugins (default: ./plugins)', required: false },
      { name: 'name', alias: 'n', description: 'Single plugin name to extract (default: all plugins)', required: false },
      { name: 'locale', alias: 'l', description: 'Target locale file (default: en)', required: false },
    ],
    handler: async (_args, options) => {
      const { runI18nExtract } = await import('./i18n-extract.js');
      const code = await runI18nExtract({
        dir: options['dir'] ? String(options['dir']) : undefined,
        name: options['name'] ? String(options['name']) : undefined,
        locale: options['locale'] ? String(options['locale']) : undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'rollback',
    description: 'Rollback to a previous state (lists history and lets you choose)',
    options: [
      { name: 'id', alias: 'i', description: 'History ID for direct rollback (no menu)', required: false },
      { name: 'yes', alias: 'y', description: 'Confirm without prompt', required: false },
      { name: 'force', alias: 'F', description: 'Allow running inside a container (not recommended)', required: false },
    ],
    handler: async (_args, options) => {
      const { runRollback } = await import('./rollback.js');
      const code = await runRollback({
        id: options['id'] ? Number(options['id']) : undefined,
        yes: options['yes'] !== undefined,
        force: options['force'] !== undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
  {
    name: 'deploy',
    description: 'First deploy — pick a target: blue/green lanes, simple containers or PM2',
    options: [
      {
        name: 'target',
        alias: 't',
        description: 'Skip the menu: blue-green | simple | pm2',
        required: false,
      },
      { name: 'yes', alias: 'y', description: 'No prompts: take every default', required: false },
      {
        name: 'force',
        alias: 'F',
        description: 'Allow running inside a container (not recommended)',
        required: false,
      },
      { name: 'install', alias: 'i', description: 'PM2: update packages before deploying', required: false },
    ],
    handler: async (_args, options) => {
      const { runDeploy } = await import('./deploy.js');
      const code = await runDeploy({
        target: options['target'],
        yes: options['yes'] !== undefined,
        force: options['force'] !== undefined,
        install: options['install'] !== undefined,
      });
      if (code !== 0) process.exitCode = code;
    },
  },
];

export function getCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name);
}
