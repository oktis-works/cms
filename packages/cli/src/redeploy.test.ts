// @oktis-works/cms - `okcms redeploy` (F4)
//
// O compromisso testado aqui: o comando prepara no host tudo que um
// plugin/tema novo precisa (SQL do plugin em `migrations/`, `dist/theme.css`
// do tema) e só então delega a troca ao blue/green. O preparo é idempotente e
// nunca sobrescreve o que é do operador; o nada-preparado errado nunca chega
// perto do Docker.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import {
  MIGRATION_FILENAME,
  planRedeploy,
  renderPlan,
  runRedeploy,
  stagePluginMigrations,
  type RedeployOptions,
} from './redeploy.js';
import { buildThemeStylesOnDisk } from './theme-build.js';
import { Prompt, type PromptIO } from './prompt.js';
import type { ContainerProbe } from './guards.js';
import type { Runner } from './docker.js';

let dir: string;
let out: string[];

const ENV = 'PORT=3000\nWEB_PORT=3001\nADMIN_PORT=3011\nDB_PASSWORD=postgres\n';

const HOST_PROBE: ContainerProbe = { env: {}, exists: () => false, cgroup: null };
const CONTAINER_PROBE: ContainerProbe = {
  env: { OKCMS_IN_CONTAINER: '1' },
  exists: () => false,
  cgroup: null,
};

function res(partial: Partial<import('./docker.js').RunResult> = {}): import('./docker.js').RunResult {
  return {
    ok: partial.ok ?? true,
    code: partial.code ?? 0,
    stdout: partial.stdout ?? '',
    stderr: partial.stderr ?? '',
    command: partial.command ?? '',
  };
}

function makeRunner(): Runner & { calls: string[] } {
  const calls: string[] = [];
  const runner = ((command: string, args: string[]) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    const head = args[0];
    if (head === 'version') return res({ stdout: '29.8.2\n' });
    if (head === 'compose' && args[1] === 'version') return res({ stdout: '5.6.0\n' });
    if (head === 'network' && args[1] === 'inspect') return res({ ok: false, code: 1, stderr: 'no such' });
    if (head === 'inspect') {
      const name = args[args.length - 1] ?? '';
      if (name.includes('worker')) return res({ stdout: 'exited|none\n' });
      return res({ stdout: 'running|healthy\n' });
    }
    if (head === 'ps') return res({ stdout: '' });
    return res({ command: line });
  }) as Runner & { calls: string[] };
  runner.calls = calls;
  return runner;
}

function buildPrompt(isTTY: boolean, lines: string[]): Prompt & { printed: () => string } {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(String(chunk));
      cb();
    },
  });
  if (isTTY) setImmediate(() => input.end(`${lines.join('\n')}\n`));
  const io: PromptIO = { input, output, isTTY };
  const prompt = new Prompt(io) as Prompt & { printed: () => string };
  prompt.printed = (): string => chunks.join('');
  return prompt;
}

const nonTty = (): Prompt & { printed: () => string } => buildPrompt(false, []);
const ttyPrompt = (lines: string[]): Prompt & { printed: () => string } => buildPrompt(true, lines);

// ---------------------------------------------------------------------------

function writePlugin(name: string, files: Record<string, string>): void {
  const base = join(dir, 'plugins', name);
  mkdirSync(base, { recursive: true });
  writeFileSync(
    join(base, 'manifest.json'),
    JSON.stringify({ name, version: '0.1.0', type: 'plugin', main: 'index.js' })
  );
  for (const [rel, content] of Object.entries(files)) {
    const path = join(base, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
}

function writeTheme(name: string, manifest: unknown, files: Record<string, string> = {}): void {
  const base = join(dir, 'themes', name);
  mkdirSync(base, { recursive: true });
  if (manifest !== null) {
    writeFileSync(join(base, 'theme.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  }
  for (const [rel, content] of Object.entries(files)) {
    const path = join(base, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
}

/** Host com node_modules: o deploy não precisa rodar `bun install` no teste. */
function markInstalled(): void {
  mkdirSync(join(dir, 'node_modules', '@oktis-works'), { recursive: true });
}

async function run(overrides: Partial<RedeployOptions> = {}): Promise<{
  code: number;
  calls: string[];
  printed: string;
  logs: string[];
}> {
  const runner = makeRunner();
  const prompt = nonTty();
  const logs: string[] = [];
  const code = await runRedeploy({
    cwd: dir,
    runner,
    prompt,
    probe: HOST_PROBE,
    log: (message) => logs.push(message),
    ...overrides,
  });
  prompt.close();
  return { code, calls: runner.calls, printed: prompt.printed(), logs };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-redeploy-'));
  out = [];
  writeFileSync(join(dir, '.env'), ENV);
  markInstalled();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('MIGRATION_FILENAME', () => {
  it('aceita o padrão do runner e rejeita o resto', () => {
    expect(MIGRATION_FILENAME.test('V001__core__create_users.sql')).toBe(true);
    expect(MIGRATION_FILENAME.test('V012__plugin_seo__add_meta.sql')).toBe(true);
    expect(MIGRATION_FILENAME.test('001_add_table.sql')).toBe(false);
    expect(MIGRATION_FILENAME.test('README.sql')).toBe(false);
    expect(MIGRATION_FILENAME.test('V001_core_sem-dono.sql')).toBe(false);
    // espelha o runner: o nome depois do segundo `__` aceita qualquer coisa
    expect(MIGRATION_FILENAME.test('V001__core__com espaço.sql')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('planRedeploy — migrations de plugin', () => {
  it('classifica nova, staged, conflito e inválida', () => {
    writePlugin('seo', {
      'migrations/V001__plugin_seo__tabelas.sql': 'CREATE TABLE seo (id int);',
      'migrations/V002__plugin_seo__col.sql': 'ALTER TABLE seo ADD COLUMN k text;',
      'migrations/V003__plugin_seo__dup.sql': 'SELECT 1;',
      'migrations/notas.sql': 'SELECT 1;',
    });
    mkdirSync(join(dir, 'migrations'), { recursive: true });
    // V002 já está idêntico (staged); V003 está divergente (conflito)
    writeFileSync(join(dir, 'migrations', 'V002__plugin_seo__col.sql'), 'ALTER TABLE seo ADD COLUMN k text;');
    writeFileSync(join(dir, 'migrations', 'V003__plugin_seo__dup.sql'), 'SELECT 2;');

    const plan = planRedeploy({ cwd: dir });

    expect(plan.plugins).toEqual(['seo']);
    expect(plan.migrations.map((m) => [m.file, m.status])).toEqual([
      ['V001__plugin_seo__tabelas.sql', 'new'],
      ['V002__plugin_seo__col.sql', 'staged'],
      ['V003__plugin_seo__dup.sql', 'conflict'],
      ['notas.sql', 'invalid'],
    ]);
  });

  it('reporta .sql já existente em migrations/ fora do padrão do runner', () => {
    mkdirSync(join(dir, 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'migrations', 'backup.sql'), 'SELECT 1;');

    expect(planRedeploy({ cwd: dir }).invalidExisting).toEqual(['backup.sql']);
  });

  it('--plugin limita o plano às migrations daquele plugin', () => {
    writePlugin('a', { 'migrations/V001__a__t.sql': 'SELECT 1;' });
    writePlugin('b', { 'migrations/V001__b__t.sql': 'SELECT 1;' });

    const plan = planRedeploy({ cwd: dir, plugin: 'b' });

    expect(plan.plugins).toEqual(['a', 'b']);
    expect(plan.migrations.map((m) => m.plugin)).toEqual(['b']);
  });
});

describe('planRedeploy — build de tema', () => {
  it('tema com entrada de estilo entra no build; sem entrada fica de fora', () => {
    writeTheme('arde', { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css' } }, {
      'style.css': '.site { color: red; }',
    });
    writeTheme('seco', { name: 'seco', version: '1.0.0', stylesConfig: { engine: 'css' } });

    const plan = planRedeploy({ cwd: dir });

    expect(plan.themes).toEqual(['arde', 'seco']);
    expect(plan.themeBuilds.map((t) => [t.theme, t.status])).toEqual([
      ['arde', 'build'],
      ['seco', 'no-entry'],
    ]);
    expect(plan.themeBuilds[0]?.engine).toBe('css');
  });

  it('manifesto ausente ou inválido não vira build', () => {
    writeTheme('sem-manifesto', null, { 'index.html': '<p>oi</p>' });
    writeTheme('quebrado', '{ nao é json');

    const plan = planRedeploy({ cwd: dir });

    expect(plan.themeBuilds.map((t) => [t.theme, t.status])).toEqual([
      ['quebrado', 'invalid-manifest'],
      ['sem-manifesto', 'missing-manifest'],
    ]);
  });

  it('manifesto que o runtime recusaria é marcado, não compilado', () => {
    writeTheme('ruim', {
      name: 'ruim',
      version: '1.0.0',
      stylesConfig: { engine: 'css', entry: 'style.css', isolation: false },
    }, { 'style.css': '.a{}' });

    const plan = planRedeploy({ cwd: dir });

    expect(plan.themeBuilds[0]?.status).toBe('invalid-manifest');
    expect(plan.themeBuilds[0]?.problems.join(' ')).toContain('isolation=false');
  });
});

// ---------------------------------------------------------------------------

describe('stagePluginMigrations', () => {
  it('só copia o que é novo — staged e conflito intocados, inválida fora', () => {
    writePlugin('seo', {
      'migrations/V001__plugin_seo__novo.sql': 'CREATE TABLE novo (id int);',
      'migrations/V002__plugin_seo__igual.sql': 'SELECT 1;',
      'migrations/V003__plugin_seo__diverge.sql': 'SELECT 9;',
      'migrations/leia-me.sql': 'não é sql válido',
    });
    mkdirSync(join(dir, 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'migrations', 'V002__plugin_seo__igual.sql'), 'SELECT 1;');
    writeFileSync(join(dir, 'migrations', 'V003__plugin_seo__diverge.sql'), 'SELECT 2;');

    const result = stagePluginMigrations(planRedeploy({ cwd: dir }));

    expect(result.copied).toEqual(['seo: V001__plugin_seo__novo.sql']);
    expect(result.already).toEqual(['seo: V002__plugin_seo__igual.sql']);
    expect(result.conflicts).toEqual(['seo: V003__plugin_seo__diverge.sql']);
    expect(result.invalid).toEqual(['seo: leia-me.sql']);

    expect(readFileSync(join(dir, 'migrations', 'V001__plugin_seo__novo.sql'), 'utf-8')).toBe(
      'CREATE TABLE novo (id int);'
    );
    // o conflito preserva a versão do projeto — migrations/ é do operador
    expect(readFileSync(join(dir, 'migrations', 'V003__plugin_seo__diverge.sql'), 'utf-8')).toBe(
      'SELECT 2;'
    );
    expect(existsSync(join(dir, 'migrations', 'leia-me.sql'))).toBe(false);
  });

  it('é idempotente: a segunda rodada não copia nada', () => {
    writePlugin('seo', { 'migrations/V001__plugin_seo__t.sql': 'SELECT 1;' });

    stagePluginMigrations(planRedeploy({ cwd: dir }));
    const second = stagePluginMigrations(planRedeploy({ cwd: dir }));

    expect(second.copied).toEqual([]);
    expect(second.already).toEqual(['seo: V001__plugin_seo__t.sql']);
  });
});

// ---------------------------------------------------------------------------

describe('renderPlan', () => {
  it('lista o que será copiado, compilado e a ordem do deploy', () => {
    writePlugin('seo', { 'migrations/V001__plugin_seo__t.sql': 'SELECT 1;' });
    writeTheme('arde', { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css' } }, {
      'style.css': '.a{}',
    });

    const text = renderPlan(planRedeploy({ cwd: dir })).join('\n');

    expect(text).toContain('plugins: seo');
    expect(text).toContain('+ seo: V001__plugin_seo__t.sql → migrations/ (novo)');
    expect(text).toContain('✓ arde — css → dist/theme.css');
    expect(text).toContain('stage no host → build da imagem → migrations');
  });

  it('reflete as flags de pular', () => {
    writePlugin('seo', { 'migrations/V001__plugin_seo__t.sql': 'SELECT 1;' });
    writeTheme('arde', { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css' } }, {
      'style.css': '.a{}',
    });

    const text = renderPlan(planRedeploy({ cwd: dir }), {
      skipMigrations: true,
      skipThemeBuild: true,
    }).join('\n');

    expect(text).toContain('puladas (--skip-migrations)');
    expect(text).toContain('pulado (--skip-theme-build)');
  });
});

// ---------------------------------------------------------------------------

describe('buildThemeStylesOnDisk', () => {
  it('gera dist/theme.css isolado no tema', async () => {
    writeTheme(
      'arde',
      { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css', entry: 'style.css' } },
      { 'style.css': '.site { color: red; }' }
    );

    const outcome = await buildThemeStylesOnDisk(join(dir, 'themes'), 'arde');

    expect(outcome.engine).toBe('css');
    expect(outcome.output).toBe('dist/theme.css');
    expect(outcome.bytes).toBeGreaterThan(0);
    const css = readFileSync(join(dir, 'themes', 'arde', 'dist', 'theme.css'), 'utf-8');
    expect(css).toContain('data-theme="arde"');
  });

  it('manifesto ausente lança em vez de sair com exit', async () => {
    await expect(buildThemeStylesOnDisk(join(dir, 'themes'), 'fantasma')).rejects.toThrow(
      /manifesto do tema não encontrado/
    );
  });

  it('recusa output que escaparia do diretório do tema', async () => {
    writeTheme(
      'evil',
      { name: 'evil', version: '1.0.0', stylesConfig: { engine: 'css', entry: 'style.css', output: '../../fora.css' } },
      { 'style.css': '.a{}' }
    );

    await expect(buildThemeStylesOnDisk(join(dir, 'themes'), 'evil')).rejects.toThrow(
      /stylesConfig.output inválido/
    );
    expect(existsSync(join(dir, 'fora.css'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('runRedeploy', () => {
  it('recusa rodar dentro de container', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await run({ probe: CONTAINER_PROBE });
      expect(result.code).toBe(1);
      expect(result.calls).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('--dry-run mostra o plano e não toca no Docker nem no disco', async () => {
    writePlugin('seo', { 'migrations/V001__plugin_seo__t.sql': 'SELECT 1;' });

    const result = await run({ dryRun: true });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.printed).toContain('OkCMS redeploy');
    expect(result.printed).toContain('dry-run: nada foi executado');
    expect(existsSync(join(dir, 'migrations', 'V001__plugin_seo__t.sql'))).toBe(false);
  });

  it('falha antes do Docker se migrations/ tem arquivo fora do padrão', async () => {
    mkdirSync(join(dir, 'migrations'), { recursive: true });
    writeFileSync(join(dir, 'migrations', 'backup.sql'), 'SELECT 1;');

    const result = await run({ dryRun: true });

    expect(result.code).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.printed).toContain('o db:migrate falharia');
  });

  it('--plugin/--theme com nome inexistente sai com 1', async () => {
    writePlugin('seo', {});
    writeTheme('arde', { name: 'arde', version: '1.0.0' });

    expect((await run({ plugin: 'nao-existe' })).code).toBe(1);
    expect((await run({ theme: 'nao-existe' })).code).toBe(1);
  });

  it('prepara migrations + tema e faz o deploy blue/green', async () => {
    writePlugin('seo', { 'migrations/V001__plugin_seo__t.sql': 'CREATE TABLE seo (id int);' });
    writeTheme(
      'arde',
      { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css', entry: 'style.css' } },
      { 'style.css': '.site { color: red; }' }
    );

    const result = await run();

    expect(result.code).toBe(0);
    // stage
    expect(existsSync(join(dir, 'migrations', 'V001__plugin_seo__t.sql'))).toBe(true);
    // build de tema
    expect(existsSync(join(dir, 'themes', 'arde', 'dist', 'theme.css'))).toBe(true);
    // deploy
    expect(result.calls.some((call) => call.includes('docker-compose.infra.yml'))).toBe(true);
    expect(result.calls.some((call) => call.includes('deploy.yml build'))).toBe(true);
    expect(result.calls.some((call) => call.includes('nginx -s reload'))).toBe(true);
    // sem `bun add`: redeploy não mexe em versão de pacote
    expect(result.calls.some((call) => call.startsWith('bun add'))).toBe(false);
    expect(result.calls.some((call) => call.startsWith('npm install'))).toBe(false);
    expect(result.logs.join('')).toContain('+ migrations: seo: V001__plugin_seo__t.sql');
    expect(result.printed).toContain('redeploy concluído');
  });

  it('sem node_modules roda `bun install` antes (o db:migrate precisa das deps)', async () => {
    rmSync(join(dir, 'node_modules'), { recursive: true, force: true });

    const result = await run();

    expect(result.code).toBe(0);
    expect(result.calls.some((call) => call === 'bun install')).toBe(true);
  });

  it('--skip-migrations e --skip-theme-build preparam nada e ainda assim dão deploy', async () => {
    writePlugin('seo', { 'migrations/V001__plugin_seo__t.sql': 'SELECT 1;' });
    writeTheme(
      'arde',
      { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css', entry: 'style.css' } },
      { 'style.css': '.a{}' }
    );

    const result = await run({ skipMigrations: true, skipThemeBuild: true });

    expect(result.code).toBe(0);
    expect(existsSync(join(dir, 'migrations', 'V001__plugin_seo__t.sql'))).toBe(false);
    expect(existsSync(join(dir, 'themes', 'arde', 'dist', 'theme.css'))).toBe(false);
    expect(result.calls.some((call) => call.includes('deploy.yml build'))).toBe(true);
    expect(result.printed).toContain('não copiadas (--skip-migrations)');
    expect(result.printed).toContain('sem build de estilo (--skip-theme-build)');
  });

  it('confirmação recusada no TTY não executa nada', async () => {
    const prompt = ttyPrompt(['', '', 'n']);
    const runner = makeRunner();

    const code = await runRedeploy({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      log: (message) => out.push(message),
    });
    prompt.close();

    expect(code).toBe(0);
    expect(runner.calls).toEqual([]);
    expect(prompt.printed()).toContain('cancelado — nada foi executado');
    expect(prompt.printed()).toContain('Iniciar redeploy?');
  });

  it('falha no build do tema aborta antes de tocar no Docker', async () => {
    writeTheme(
      'arde',
      { name: 'arde', version: '1.0.0', stylesConfig: { engine: 'css', entry: 'style.css' } },
      { 'style.css': '.a{}' }
    );
    // O plano enxerga entrada de estilo e manda buildar; a escrita do artefato
    // falha porque `dist/theme.css` existe como diretório (EISDIR) — é a
    // falha de preparo que precisa abortar o deploy inteiro.
    mkdirSync(join(dir, 'themes', 'arde', 'dist', 'theme.css'), { recursive: true });

    const result = await run();

    expect(result.code).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.printed).toContain('nada foi buildado nem trocado');
  });
});
