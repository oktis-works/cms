// @oktis-works/cms - `okcms update` (F3)
//
// O compromisso central testado aqui: `okcms update` é uma atualização
// completa (pacotes + migrations + deploy) e pede confirmação em TTY. O modo
// de pacotes apenas continua explícito em `--mode download`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

vi.mock('./npm-registry.js', () => ({
  getLatestVersion: vi.fn(async () => '0.9.9'),
  searchExtensions: vi.fn(async () => []),
}));

import { getLatestVersion } from './npm-registry.js';
import { parseMode, runUpdate, scanOutdated, type UpdateOptions } from './update.js';
import { Prompt, type PromptIO } from './prompt.js';
import type { ContainerProbe } from './guards.js';
import type { Runner } from './docker.js';

let dir: string;
let out: string[];

const ENV = 'PORT=3000\nWEB_PORT=3001\nADMIN_PORT=3011\nDB_PASSWORD=postgres\n';

/** Host determinístico — o teste não depende do ambiente real. */
const HOST_PROBE: ContainerProbe = { env: {}, exists: () => false, cgroup: null };
/** Container determinístico (OKCMS_IN_CONTAINER=1). */
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

/** Prompt não-TTY com saída capturada (não polui o log do vitest). */
function nonTty(): Prompt & { printed: () => string } {
  return buildPrompt(false, []);
}

/** Prompt de TTY que responde `lines` (uma linha por pergunta). */
function ttyPrompt(lines: string[]): Prompt & { printed: () => string } {
  return buildPrompt(true, lines);
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

function installPackage(name: string, version: string): void {
  const path = join(dir, 'node_modules', '@oktis-works', name);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, 'package.json'),
    JSON.stringify({ name: `@oktis-works/${name}`, version })
  );
}

interface RunResult {
  code: number;
  calls: string[];
  printed: string;
  logs: string[];
}

/** Executa não-interativamente e fecha o prompt criado. */
async function run(overrides: Partial<UpdateOptions> = {}): Promise<RunResult> {
  const runner = makeRunner();
  const prompt = nonTty();
  const logs: string[] = [];
  const code = await runUpdate({
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
  dir = mkdtempSync(join(tmpdir(), 'okcms-update-'));
  out = [];
  writeFileSync(join(dir, '.env'), ENV);
  vi.mocked(getLatestVersion).mockClear();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('parseMode', () => {
  it('aceita os aliases documentados', () => {
    expect(parseMode('download')).toBe('download');
    expect(parseMode(' pacotes ')).toBe('download');
    expect(parseMode('packages')).toBe('download');
    expect(parseMode('deploy')).toBe('deploy');
    expect(parseMode('BLUE-GREEN')).toBe('deploy');
    expect(parseMode('docker')).toBe('deploy');
  });

  it('valor desconhecido é inválido, não um default silencioso', () => {
    expect(parseMode('production')).toBeNull();
    expect(parseMode('')).toBeNull();
  });
});

describe('scanOutdated', () => {
  it('projeto nunca instalado devolve installed:false sem registry', async () => {
    const result = await scanOutdated(dir);
    expect(result).toEqual({ installed: false, outdated: [] });
    expect(vi.mocked(getLatestVersion)).not.toHaveBeenCalled();
  });

  it('compara versão instalada com a do registry', async () => {
    installPackage('api', '0.1.0');
    installPackage('core', '0.9.9');

    const result = await scanOutdated(dir, (message) => out.push(message));

    expect(result.installed).toBe(true);
    expect(result.outdated).toEqual([
      { name: 'api', pkg: '@oktis-works/api', current: '0.1.0', latest: '0.9.9' },
    ]);
    expect(out.join('\n')).toContain('@oktis-works/core 0.9.9 (up to date)');
  });
});

// ---------------------------------------------------------------------------

describe('modo download (explícito)', () => {
  it('não-TTY com --mode download não inicia Docker', async () => {
    installPackage('api', '0.1.0');
    const result = await run({ mode: 'download' });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.printed).toContain('--install');
    expect(result.printed).toContain('--mode deploy');
  });

  it('não-TTY com --mode download -i instala apenas os pacotes', async () => {
    installPackage('api', '0.1.0');
    const result = await run({ mode: 'download', install: true });

    expect(result.code).toBe(0);
    expect(result.calls).toContain('bun add @oktis-works/api@latest');
    expect(result.calls.some((call) => call.includes('compose'))).toBe(false);
  });

  it('TTY + Enter confirma a atualização completa', async () => {
    installPackage('api', '0.1.0');
    const prompt = ttyPrompt(['', '', '', '']);
    const runner = makeRunner();

    const code = await runUpdate({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      log: (m) => out.push(m),
    });

    expect(code).toBe(0);
    expect(runner.calls.some((call) => call.includes('docker-compose.infra.yml'))).toBe(true);
    expect(runner.calls.some((call) => call.includes('db:migrate'))).toBe(true);
    expect(prompt.printed()).toContain('Start the update?');
    prompt.close();
  });

  it('sem --mode pede confirmação antes de uma atualização completa', async () => {
    installPackage('api', '0.1.0');
    const result = await run();

    expect(result.code).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.printed).toContain('interactive confirmation required');
  });

  it('sem node_modules continua permitindo deploy completo com --yes', async () => {
    const result = await run({ yes: true });

    expect(result.code).toBe(0);
    expect(result.calls.some((call) => call.includes('docker-compose.infra.yml'))).toBe(true);
    expect(vi.mocked(getLatestVersion)).not.toHaveBeenCalled();
  });
});

describe('modo deploy', () => {
  it('não-TTY com --mode deploy executa o blue/green', async () => {
    // lane existente → há lane antiga para derrubar e é aí que os defaults
    // de órfãos ficam observáveis
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(
      join(dir, '.deploy/state.json'),
      JSON.stringify({ lane: 'blue', previousLane: null, version: '1', at: 'x', history: [] })
    );

    const result = await run({ mode: 'deploy' });

    expect(result.code).toBe(0);
    expect(result.calls.some((call) => call.includes('docker-compose.infra.yml'))).toBe(true);
    expect(result.calls.some((call) => call.includes('deploy.yml build'))).toBe(true);
    expect(result.calls.some((call) => call.includes('nginx -s reload'))).toBe(true);
    // escolhas fora de TTY: com cache de camadas e removendo órfãos (defaults)
    expect(result.calls.some((call) => call.includes('build --no-cache'))).toBe(false);
    expect(result.calls.some((call) => call.includes('down --remove-orphans'))).toBe(true);
  });

  it('não-TTY com -i mantém compatibilidade, mas executa o fluxo completo', async () => {
    installPackage('api', '0.1.0');
    const result = await run({ install: true, yes: true });

    expect(result.code).toBe(0);
    expect(result.calls).toContain('bun add @oktis-works/api@latest');
    expect(result.calls.some((call) => call.includes('db:migrate'))).toBe(true);
    expect(result.calls.some((call) => call.includes('docker-compose.infra.yml'))).toBe(true);
  });

  it('--no-cache + --keep-orphans vira build limpo e down sem órfãos', async () => {
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(
      join(dir, '.deploy/state.json'),
      JSON.stringify({ lane: 'blue', previousLane: null, version: '1', at: 'x', history: [] })
    );

    const result = await run({ mode: 'deploy', noCache: true, keepOrphans: true });

    expect(result.code).toBe(0);
    expect(result.calls.some((call) => call.includes('deploy.yml build --no-cache'))).toBe(true);
    const down = result.calls.find((call) => call.includes(' down'));
    expect(down).toBeDefined();
    expect(down).not.toContain('--remove-orphans');
    expect(down).not.toContain('-v');
  });

  it('--mode inválido sai com 1 e sem tocar em nada', async () => {
    const result = await run({ mode: 'producao' });
    expect(result.code).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.printed).toContain('invalid --mode');
  });

  it('--yes pula resumo e confirmação mesmo com TTY', async () => {
    const prompt = ttyPrompt(['0', '0', '0', '0']);
    const runner = makeRunner();

    const code = await runUpdate({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      mode: 'deploy',
      yes: true,
      log: (m) => out.push(m),
    });

    expect(code).toBe(0);
    expect(prompt.printed()).not.toContain('Start the update?');
    expect(runner.calls.some((call) => call.includes('nginx -s reload'))).toBe(true);
    prompt.close();
  });

  it('confirmação recusada no TTY não executa nada', async () => {
    // 1) alvo  2) cache  3) órfãos  4) confirmação = "n"
    const prompt = ttyPrompt(['1', '', '', 'n']);
    const runner = makeRunner();

    const code = await runUpdate({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      log: (m) => out.push(m),
    });

    expect(code).toBe(0);
    expect(runner.calls).toEqual([]);
    expect(prompt.printed()).toContain('cancelled — nothing was executed');
    prompt.close();
  });
});

// ---------------------------------------------------------------------------

describe('guarda de host', () => {
  it('recusa rodar dentro de container', async () => {
    const result = await run({ probe: CONTAINER_PROBE });

    expect(result.code).toBe(1);
    expect(result.calls).toEqual([]);
  });

  it('--force é o escape consciente', async () => {
    installPackage('api', '0.1.0');
    const result = await run({ probe: CONTAINER_PROBE, force: true, install: true, yes: true });

    expect(result.code).toBe(0);
    expect(result.calls).toContain('bun add @oktis-works/api@latest');
  });
});
