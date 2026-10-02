import { basename, join, resolve } from 'node:path';
import { initDb } from './db-init.js';

export interface Option {
  name: string;
  alias: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface Command {
  name: string;
  description: string;
  options: Option[];
  handler: (args: string[], options: Record<string, string>) => Promise<void>;
}

function getMigrationsDir(options: Record<string, string>): string {
  return options['dir'] ?? join(process.cwd(), 'migrations');
}

function getTenantId(options: Record<string, string>): string {
  return options['tenant'] ?? 'default';
}

export const commands: Command[] = [
  {
    name: 'init',
    description: 'Scaffold a new OkCMS project in a directory',
    options: [
      { name: 'dir', alias: 'd', description: 'Target directory (same as positional arg)', required: false },
    ],
    handler: async (args, options) => {
      const { scaffoldProject } = await import('./scaffold.js');
      // O arg posicional tem prioridade sobre -d: `init cms-teste` deve criar
      // o diretório cms-teste (o default '.' injetado pelo parser engolia args[0]).
      const target = args[0] ?? options['dir'] ?? '.';
      const name = args[1] ?? basename(resolve(target));
      await scaffoldProject(target, name);
    },
  },
  {
    name: 'start',
    description: 'Start API + Admin + Web apps for this project',
    options: [
      { name: 'api', alias: 'a', description: 'Start only the API', required: false },
      { name: 'admin', alias: 'm', description: 'Include admin app', required: false },
      { name: 'web', alias: 'w', description: 'Include web app', required: false },
      { name: 'all', alias: 'A', description: 'Start all apps (default)', required: false },
    ],
    handler: async (_args, options) => {
      const { startProject } = await import('./start.js');
      await startProject(options);
    },
  },
  {
    name: 'stop',
    description: 'Stop apps started by `start` (via pidfile ou detecção de processos)',
    options: [],
    handler: async () => {
      const { stopAll, findRunningApps, clearPids } = await import('./runtime-state.js');
      const results = stopAll();

      if (results.length === 0) {
        const fallback = findRunningApps();
        for (const proc of fallback) {
          try {
            process.kill(proc.pid, 'SIGTERM');
            console.log(`[stop] ${proc.label} (pid ${proc.pid}) finalizado`);
          } catch {
            console.error(`[stop] falha ao finalizar ${proc.label} (pid ${proc.pid})`);
          }
        }
        if (fallback.length === 0) {
          console.log('Nenhum app rodando.');
        }
        clearPids();
        return;
      }

      for (const result of results) {
        if (result.stopped) {
          console.log(`[stop] ${result.label} (pid ${result.pid}) finalizado`);
        } else {
          console.log(`[stop] ${result.label} (pid ${result.pid}) não estava mais ativo`);
        }
      }
      clearPids();
    },
  },
  {
    name: 'status',
    description: 'Show status of apps started by `start` + resumo do projeto',
    options: [],
    handler: async () => {
      const { statusAll } = await import('./runtime-state.js');
      const { loadProjectConfig } = await import('./project-config.js');
      const config = loadProjectConfig();
      const processes = statusAll();

      console.log(`Projeto "${config.name}" — ports api:${config.ports.api} admin:${config.ports.admin} web:${config.ports.web}`);
      console.log(`Tema ativo: ${config.activeTheme || '(não definido)'}`);

      if (processes.length === 0) {
        console.log('Nenhum pidfile encontrado (use `okcms start`).');
        return;
      }

      for (const proc of processes) {
        console.log(`  ${proc.alive ? '●' : '○'} ${proc.label.padEnd(6)} pid=${proc.pid} iniciado=${proc.startedAt}`);
      }
    },
  },
  {
    name: 'doctor',
    description: 'Diagnóstico do ambiente: node, .env, DATABASE_URL, config (cli-devexp-003)',
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
        console.error(`doctor: ${failed} problema(s) obrigatório(s) encontrado(s)`);
        process.exitCode = 1;
      } else {
        console.log('Ambiente OK.');
      }
    },
  },
  {
    name: 'plugin:create',
    description: 'Scaffold de um plugin mínimo e compatível (--name)',
    options: [
      { name: 'name', alias: 'n', description: 'Nome do plugin', required: true },
      { name: 'dir', alias: 'd', description: 'Diretório base (default: ./plugins)', required: false },
    ],
    handler: async (_args, options) => {
      const { scaffoldPlugin } = await import('./extension-scaffold.js');
      const name = options['name'];
      if (!name) {
        console.error('Nome do plugin é obrigatório (--name)');
        process.exit(1);
      }
      try {
        const result = scaffoldPlugin(name, options['dir']);
        console.log(`Plugin criado em ${result.dir}`);
        console.log(`Compatibilidade validada contra CMS ${result.manifest['compatibility'] ? '' : ''}(manifest.json)`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:create',
    description: 'Scaffold de um tema mínimo e compatível (--name --style css|scss|tailwind)',
    options: [
      { name: 'name', alias: 'n', description: 'Nome do tema', required: true },
      { name: 'dir', alias: 'd', description: 'Diretório base (default: ./themes)', required: false },
      { name: 'style', alias: 's', description: 'Engine de estilo: css|scss|tailwind', required: false },
    ],
    handler: async (_args, options) => {
      const { scaffoldTheme } = await import('./extension-scaffold.js');
      const name = options['name'];
      const style = (options['style'] ?? 'css') as 'css' | 'scss' | 'tailwind';
      if (!name) {
        console.error('Nome do tema é obrigatório (--name)');
        process.exit(1);
      }
      if (!['css', 'scss', 'tailwind'].includes(style)) {
        console.error('--style deve ser css|scss|tailwind');
        process.exit(1);
      }
      try {
        const result = scaffoldTheme(name, options['dir'], style);
        console.log(`Tema criado em ${result.dir} (engine: ${style})`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  },
  {
    name: 'theme:build',
    description: 'Compila estilos do tema (SCSS/Tailwind -> dist/theme.css com isolamento [data-theme])',
    options: [
      { name: 'name', alias: 'n', description: 'Nome do tema', required: true },
      { name: 'themes-dir', alias: 'd', description: 'Diretório de temas (default: ./themes)', required: false },
    ],
    handler: async (_args, options) => {
      const { join } = await import('node:path');
      const { mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs');
      const { buildThemeStyles } = await import('@oktis-works/theme-runtime');
      const name = options['name'];
      if (!name) {
        console.error('--name obrigatório');
        process.exit(1);
      }
      const themesDir = options['themes-dir'] ?? join(process.cwd(), 'themes');
      const manifestPath = join(themesDir, name, 'theme.json');
      if (!existsSync(manifestPath)) {
        console.error(`theme.json não encontrado em ${manifestPath}`);
        process.exit(1);
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      try {
        const { css, report } = await buildThemeStyles({ themesRoot: themesDir, themeName: name, manifest });
        if (!report.entry) console.log(`[${name}] sem entrada de estilo (${report.engine})`);
        for (const w of report.warnings) console.warn(`warn: ${w}`);
        mkdirSync(join(themesDir, name, 'dist'), { recursive: true });
        writeFileSync(join(themesDir, name, report.output), css, 'utf-8');
        console.log(`[${name}] ${report.engine} -> ${report.output} (${css.length} bytes) isolated=${report.isolated}`);
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    },
  },
  {
    name: 'build',
    description: 'Build dos apps do projeto via bun filters (--apps api,admin,web)',
    options: [
      { name: 'apps', alias: 'a', description: 'Apps a buildar (default: api,admin,web)', required: false },
    ],
    handler: async (_args, options) => {
      const { runProjectBuild } = await import('./build.js');
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
      console.log(ok ? `Build concluído em ${Date.now() - started}ms.` : 'Build falhou.');
      process.exitCode = ok ? 0 : 1;
    },
  },
  {
    name: 'prerender',
    description: 'Prerender estático das páginas publicadas para o tema ativo (best-effort)',
    options: [
      { name: 'out', alias: 'o', description: 'Diretório de saída (default: ./.prerender)', required: false },
    ],
    handler: async (_args, options) => {
      const { join } = await import('node:path');

      if (!process.env['DATABASE_URL']) {
        console.log('[prerender] DATABASE_URL não configurado — pulando (best-effort).');
        return;
      }

      const outDir = options['out'] ?? join(process.cwd(), '.prerender');

      try {
        const { getConnection } = await import('@oktis-works/database');
        const { prerenderStatic } = await import('@oktis-works/theme-runtime');

        const rows = await getConnection().unsafe(
          "SELECT type, slug FROM content WHERE status = 'PUBLISHED' ORDER BY updated_at DESC LIMIT 500"
        );
        const contents = rows as unknown as Array<{ type: string; slug: string }>;

        const result = await prerenderStatic(
          contents.map((content) => ({
            path: `/${content.slug}`,
            render: async () =>
              `<main data-type="${content.type}" data-slug="${content.slug}"></main>`,
          })),
          outDir
        );

        console.log(`[prerender] ${result.pages} página(s) geradas em ${outDir}`);
        if (result.failed.length > 0) {
          const failedPaths = result.failed.map((failed) => failed.path).join(', ');
          console.warn(`[prerender] ${result.failed.length} falha(s): ${failedPaths}`);
        }
      } catch (error) {
        console.warn(`[prerender] indisponível (${error instanceof Error ? error.message : String(error)}) — pulando.`);
      }
    },
  },
  {
    name: 'update',
    description: 'Check @oktis-works/* packages against npm registry latest (--install to upgrade)',
    options: [
      { name: 'install', alias: 'i', description: 'Run npm install for outdated packages', required: false },
    ],
    handler: async (_args, options) => {
      const { existsSync, readdirSync, readFileSync } = await import('node:fs');
      const { spawnSync } = await import('node:child_process');
      const { getLatestVersion } = await import('./npm-registry.js');

      const nmDir = join(process.cwd(), 'node_modules', '@oktis-works');
      if (!existsSync(nmDir)) {
        console.error('Nenhum pacote @oktis-works/* instalado em node_modules.');
        process.exit(1);
      }

      const installed = readdirSync(nmDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const outdated: Array<{ pkg: string; current: string; latest: string }> = [];

      for (const name of installed) {
        let current = '?';
        try {
          const pkgJson = JSON.parse(readFileSync(join(nmDir, name, 'package.json'), 'utf-8')) as { version?: string };
          current = pkgJson.version ?? '?';
        } catch {
          // sem package.json legível
        }

        const latest = await getLatestVersion(`@oktis-works/${name}`);

        if (!latest || latest === current) {
          console.log(`  ✓ @oktis-works/${name} ${current} (em dia)`);
          continue;
        }

        console.log(`  ↑ @oktis-works/${name} ${current} → ${latest} disponível`);
        outdated.push({ pkg: `@oktis-works/${name}`, current, latest });
      }

      if (outdated.length === 0) return;

      if (options['install'] !== undefined) {
        console.log('\nAtualizando...');
        const result = spawnSync('bun', ['add', ...outdated.map((entry) => `${entry.pkg}@latest`)], {
          stdio: 'inherit',
        });
        process.exitCode = result.status ?? 1;
      } else {
        console.log('\nUse --install para atualizar automaticamente.');
      }
    },
  },
  {
    name: 'db:migrate',
    description: 'Run pending database migrations',
    options: [
      { name: 'dir', alias: 'd', description: 'Migrations directory', required: false },
      { name: 'tenant', alias: 't', description: 'Tenant ID', required: false, default: 'default' },
    ],
    handler: async (args, options) => {
      await initDb();
      const { runMigrations } = await import('@oktis-works/database');
      const result = await runMigrations(getTenantId(options), getMigrationsDir(options));
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
      { name: 'tenant', alias: 't', description: 'Tenant ID', required: false, default: 'default' },
    ],
    handler: async (args, options) => {
      await initDb();
      const { getAppliedMigrations, rollbackMigration, loadMigrationsFromDir } = await import('@oktis-works/database');
      const tenantId = getTenantId(options);
      const dir = getMigrationsDir(options);
      const applied = await getAppliedMigrations(tenantId);
      if (applied.length === 0) {
        console.log('No migrations to rollback');
        return;
      }
      const last = applied[applied.length - 1]!;
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
      { name: 'tenant', alias: 't', description: 'Tenant ID', required: false, default: 'default' },
    ],
    handler: async (args, options) => {
      await initDb();
      const { getAppliedMigrations } = await import('@oktis-works/database');
      const applied = await getAppliedMigrations(getTenantId(options));
      if (applied.length === 0) {
        console.log('No migrations applied');
        return;
      }
      console.log('Applied migrations:');
      for (const m of applied) {
        console.log(`  ${m.version} - ${m.name} (${m.applied_at.toISOString()})`);
      }
    },
  },
  {
    name: 'db:backup',
    description: 'Backup the database using pg_dump (custom format)',
    options: [
      { name: 'out', alias: 'o', description: 'Output file (.dump). Defaults to timestamped name', required: false },
    ],
    handler: async () => {
      const { backupDatabase } = await import('./db-dump.js');
      const result = backupDatabase();
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
    options: [
      { name: 'file', alias: 'f', description: 'Dump file to restore from', required: true },
      { name: 'clean', alias: 'c', description: 'Drop objects before restore (--clean)', required: false },
    ],
    handler: async (_args, options) => {
      const { restoreDatabase } = await import('./db-dump.js');
      const file = typeof options['file'] === 'string' ? options['file'] : '';
      const result = restoreDatabase({ file, clean: Boolean(options['clean']) });
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
        console.error('Nome ou caminho do plugin é obrigatório (--name)');
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
          console.log('Nenhum plugin encontrado.');
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
      { name: 'enable', alias: 'e', description: 'Enable the plugin', required: false },
      { name: 'disable', alias: 'd', description: 'Disable the plugin', required: false },
      { name: 'uninstall', alias: 'u', description: 'Uninstall (remove files + registro)', required: false },
    ],
    handler: async (_args, options) => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { loadProjectConfig } = await import('./project-config.js');
      const { setEnabled, loadExtensionsState, uninstallExtension } = await import('./extensions-state.js');

      const name = options['name'];
      if (!name) {
        console.error('Nome do plugin é obrigatório (--name)');
        process.exit(1);
      }

      if (options['uninstall'] !== undefined) {
        const result = uninstallExtension('plugin', name);
        if (!result.removed) {
          console.log(`Plugin "${name}" não estava instalado.`);
          process.exitCode = 1;
          return;
        }
        console.log(`Plugin "${name}" desinstalado (${result.targetDir}).`);
        return;
      }

      if (options['enable'] !== undefined || options['disable'] !== undefined) {
        const enabled = options['enable'] !== undefined;
        const ok = setEnabled('plugin', name, enabled);
        console.log(ok ? `Plugin "${name}" ${enabled ? 'habilitado' : 'desabilitado'}.` : `Plugin "${name}" não está registrado.`);
        process.exitCode = ok ? 0 : 1;
        return;
      }

      // default/--info: mostra manifesto + estado
      const config = loadProjectConfig();
      const manifestPath = join(process.cwd(), config.pluginsDir, name, 'manifest.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
        const state = loadExtensionsState().plugins[name];
        console.log(`Nome:       ${manifest['name'] ?? name}`);
        console.log(`Versão:     ${manifest['version'] ?? '?'}`);
        console.log(`Descrição:  ${manifest['description'] ?? '-'}`);
        console.log(`Entry:      ${manifest['main'] ?? '?'}`);
        console.log(`Permissões: ${(manifest['permissions'] as string[] | undefined)?.join(', ') ?? '-'}`);
        console.log(`Estado:     ${state?.enabled === false ? 'desabilitado' : 'habilitado'}`);
      } catch {
        console.error(`Manifesto não encontrado em ${manifestPath}`);
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
        console.error('Nome ou caminho do tema é obrigatório (--name)');
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
          console.log('Nenhum tema encontrado.');
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
      { name: 'uninstall', alias: 'u', description: 'Uninstall (remove files + registro)', required: false },
      { name: 'set-active', alias: 's', description: 'Set as active theme', required: false },
    ],
    handler: async (_args, options) => {
      const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { loadProjectConfig, DEFAULT_CONFIG_FILENAME } = await import('./project-config.js');
      const { setEnabled, loadExtensionsState } = await import('./extensions-state.js');

      const name = options['name'];
      if (!name) {
        console.error('Nome do tema é obrigatório (--name)');
        process.exit(1);
      }

      if (options['uninstall'] !== undefined) {
        const { uninstallExtension } = await import('./extensions-state.js');
        const result = uninstallExtension('theme', name);
        if (!result.removed) {
          console.log(`Theme "${name}" não estava instalado.`);
          process.exitCode = 1;
          return;
        }
        console.log(`Theme "${name}" desinstalado (${result.targetDir}).`);
        return;
      }

      if (options['set-active'] !== undefined) {
        const configPath = join(process.cwd(), DEFAULT_CONFIG_FILENAME);

        if (!existsSync(configPath)) {
          console.error(`${DEFAULT_CONFIG_FILENAME} não encontrado; rode \`okcms init\` primeiro.`);
          process.exit(1);
        }

        const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        raw['activeTheme'] = name;
        writeFileSync(configPath, JSON.stringify(raw, null, 2));
        console.log(`Tema ativo definido como "${name}".`);
        return;
      }

      if (options['enable'] !== undefined || options['disable'] !== undefined) {
        const enabled = options['enable'] !== undefined;
        const ok = setEnabled('theme', name, enabled);
        console.log(ok ? `Tema "${name}" ${enabled ? 'habilitado' : 'desabilitado'}.` : `Tema "${name}" não está registrado.`);
        process.exitCode = ok ? 0 : 1;
        return;
      }

      const config = loadProjectConfig();
      const themeJsonPath = join(process.cwd(), config.themesDir, name, 'theme.json');
      try {
        const manifest = JSON.parse(readFileSync(themeJsonPath, 'utf-8')) as Record<string, unknown>;
        const provides = (manifest['provides'] ?? {}) as Record<string, unknown>;
        const state = loadExtensionsState().themes[name];
        console.log(`Nome:       ${manifest['name'] ?? name}`);
        console.log(`Versão:     ${manifest['version'] ?? '?'}`);
        console.log(`Autor:      ${manifest['author'] ?? '-'}`);
        console.log(`Parent:     ${manifest['parent'] ?? '-'}`);
        console.log(`Layouts:    ${(provides['layouts'] as string[] | undefined)?.join(', ') ?? '-'}`);
        console.log(`Ativo:      ${config.activeTheme === name ? 'sim' : 'não'} (${config.activeTheme || 'nenhum'})`);
        console.log(`Estado:     ${state?.enabled === false ? 'desabilitado' : 'habilitado'}`);
      } catch {
        console.error(`theme.json não encontrado em ${themeJsonPath}`);
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
      console.log(`Migrando mídia de "${from}" para "${to}"...`);

      const { initDb } = await import('./db-init.js');
      await initDb();

      const { createMigrator } = await import('@oktis-works/core');
      const migrator = createMigrator(from, to);
      const result = await migrator.migrateAll();

      console.log(`Migrados: ${result.migrated}, Falhas: ${result.failed}`);
      for (const err of result.errors) {
        console.error(`  ! ${err.filename}: ${err.error}`);
      }
    },
  },
  {
    name: 'user:create',
    description: 'Create a new user',
    options: [
      { name: 'email', alias: 'e', description: 'User email', required: true },
      { name: 'password', alias: 'p', description: 'User password', required: true },
      { name: 'role', alias: 'r', description: 'User role', required: false, default: 'editor' },
    ],
    handler: async (_args, _options) => {
      console.error('user:create ainda não está implementado — use o fluxo de onboarding da API (POST /api/v1/auth/register).');
      process.exitCode = 1;
    },
  },
  {
    name: 'seed',
    description: 'Seed the database with initial data',
    options: [],
    handler: async () => {
      console.error('seed ainda não está implementado — nenhuma alteração foi feita no banco.');
      process.exitCode = 1;
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
];

export function getCommand(name: string): Command | undefined {
  return commands.find((c) => c.name === name);
}
