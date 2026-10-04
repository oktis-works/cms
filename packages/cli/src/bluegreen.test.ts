// @oktis-works/cms - Deploy blue/green (F3)
//
// O que se testa aqui é a ORDEM. Blue/green não falha por sintaxe: falha
// quando o worker novo sobe antes do antigo drenar, quando o swap acontece
// antes do healthcheck, ou quando o `down` passa de `-v` e leva o volume de
// mídia junto. Nada disso é verificável subindo container — é verificável
// inspecionando a sequência de comandos que a CLI monta.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_TIMEOUTS,
  deployBlueGreen,
  ensureDeployFiles,
  laneContainers,
  laneServices,
  migrateInvocation,
  preflight,
  type DeployChoices,
} from './bluegreen.js';
import { DEPLOY_PATHS, renderUpstreams } from './assets.js';
import { defaultRunner, type Runner } from './docker.js';

let dir: string;
let logs: string[];
let warns: string[];

const ENV = [
  'NODE_ENV=production',
  'PORT=3000',
  'WEB_PORT=3001',
  'ADMIN_PORT=3011',
  'DB_PASSWORD=postgres',
  'SERVER_NAME=_',
  'ADMIN_SERVER_NAME=admin.localhost',
  'OKCMS_VERSION=0.3.0',
  '',
].join('\n');

interface FakeOptions {
  /** contêineres que reportam healthcheck unhealthy */
  unhealthy?: string[];
  /** força exit != 0 quando o predicado bater */
  fail?: (command: string, args: string[]) => boolean;
  /** saída de `docker ps` (detecção de lane sem state.json) */
  ps?: string;
}

function res(partial: Partial<import('./docker.js').RunResult> = {}): import('./docker.js').RunResult {
  return {
    ok: partial.ok ?? true,
    code: partial.code ?? 0,
    stdout: partial.stdout ?? '',
    stderr: partial.stderr ?? '',
    command: partial.command ?? '',
  };
}

function makeRunner(opts: FakeOptions = {}): Runner & { calls: string[] } {
  const calls: string[] = [];
  const runner = ((command: string, args: string[]) => {
    const line = [command, ...args].join(' ');
    calls.push(line);

    const head = args[0];
    if (head === 'version') return res({ stdout: '29.8.2\n' });
    if (head === 'compose' && args[1] === 'version') return res({ stdout: '5.6.0\n' });
    if (head === 'network' && args[1] === 'inspect') {
      return res({ ok: false, code: 1, stderr: 'Error: No such network: okcms-net' });
    }
    if (head === 'inspect') {
      const name = args[args.length - 1] ?? '';
      if (opts.unhealthy?.includes(name)) return res({ stdout: 'running|unhealthy\n' });
      if (name.includes('worker')) return res({ stdout: 'exited|none\n' });
      return res({ stdout: 'running|healthy\n' });
    }
    if (head === 'ps') return res({ stdout: opts.ps ?? '' });
    if (opts.fail?.(command, args)) return res({ ok: false, code: 1, stderr: 'falha forçada' });
    return res({ command: line });
  }) as Runner & { calls: string[] };
  runner.calls = calls;
  return runner;
}

const FAST: Parameters<typeof deployBlueGreen>[0]['timeouts'] = {
  ...DEFAULT_TIMEOUTS,
  dataMs: 200,
  edgeMs: 80,
  stopMs: 80,
  intervalMs: 10,
};

const BASE_CHOICES: DeployChoices = { noCache: false, removeOrphans: true };

/** Grava os arquivos de deploy com um runner falso (nunca com docker real). */
const seed = (): void => {
  ensureDeployFiles(dir, undefined, makeRunner());
};

async function deploy(runner: Runner, choices: DeployChoices = BASE_CHOICES) {
  return deployBlueGreen({
    cwd: dir,
    runner,
    choices,
    timeouts: FAST,
    healthProbe: async () => true,
    log: (message) => logs.push(message),
    warn: (message) => warns.push(message),
  });
}

/** posição do primeiro comando que casa; -1 quando ausente */
const at = (calls: string[], fragment: string): number =>
  calls.findIndex((call) => call.includes(fragment));

const upstreamsText = (): string =>
  readFileSync(join(dir, DEPLOY_PATHS.nginxUpstreams), 'utf-8');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-bluegreen-'));
  logs = [];
  warns = [];
  writeFileSync(join(dir, '.env'), ENV);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('ensureDeployFiles', () => {
  it('cria os 7 arquivos quando não existem', () => {
    const created = ensureDeployFiles(dir, undefined, makeRunner());

    expect(created).toHaveLength(7);
    expect(existsSync(join(dir, '.dockerignore'))).toBe(true);
    expect(existsSync(join(dir, 'docker/Dockerfile'))).toBe(true);
    expect(existsSync(join(dir, 'docker/entrypoint.sh'))).toBe(true);
    expect(existsSync(join(dir, 'docker-compose.infra.yml'))).toBe(true);
    expect(existsSync(join(dir, 'docker-compose.deploy.yml'))).toBe(true);
    expect(existsSync(join(dir, 'deploy/nginx/templates/default.conf.template'))).toBe(true);
    expect(existsSync(join(dir, 'deploy/nginx/conf.d/00-upstreams.conf'))).toBe(true);
  });

  it('NUNCA sobrescreve arquivo que o operador já editou', () => {
    seed();
    const edited = '# editado à mão\n';
    writeFileSync(join(dir, DEPLOY_PATHS.nginxUpstreams), edited);
    writeFileSync(join(dir, DEPLOY_PATHS.dockerfile), '# meu Dockerfile\n');

    const created = ensureDeployFiles(dir, undefined, makeRunner());

    expect(created).toHaveLength(0);
    expect(upstreamsText()).toBe(edited);
    expect(readFileSync(join(dir, 'docker/Dockerfile'), 'utf-8')).toBe('# meu Dockerfile\n');
  });

  it('segunda chamada é no-op (idempotente)', () => {
    seed();
    expect(ensureDeployFiles(dir, undefined, makeRunner())).toEqual([]);
  });
});

describe('laneServices / laneContainers', () => {
  it('lê do compose real em vez de adivinhar', () => {
    seed();

    expect(laneServices(dir, 'green')).toEqual({
      edge: ['api-green', 'web-green', 'admin-green'],
      worker: ['worker-green'],
    });
    expect(laneContainers(dir, 'blue')).toEqual({
      edge: ['okcms-api-blue', 'okcms-web-blue', 'okcms-admin-blue'],
      worker: ['okcms-worker-blue'],
    });
  });

  it('compose apagado cai na convenção em vez de explodir', () => {
    seed();
    rmSync(join(dir, DEPLOY_PATHS.composeDeploy));

    expect(laneServices(dir, 'blue').edge).toEqual(['api-blue', 'web-blue', 'admin-blue']);
    expect(laneContainers(dir, 'blue').worker).toEqual(['okcms-worker-blue']);
  });
});

describe('preflight', () => {
  it('sem docker → recusa com instrução, não com stack trace', () => {
    const runner = ((command: string, args: string[]) =>
      args[0] === 'version'
        ? res({ ok: false, code: 127, stderr: 'docker: command not found' })
        : res({ ok: false })) as Runner;

    const result = preflight(runner);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Docker não está acessível');
    expect(result.message).toContain('--mode download');
  });

  it('compose v1/legado não conta', () => {
    const runner = ((command: string, args: string[]) =>
      args[0] === 'version'
        ? res({ stdout: '29.8.2\n' })
        : res({ ok: false, stderr: "docker: 'compose' is not a docker command" })) as Runner;

    const result = preflight(runner);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Compose v2');
  });

  it('docker + compose v2 → segue', () => {
    expect(preflight(makeRunner())).toEqual({ ok: true });
  });

  it('usa o runner padrão quando não injetado (fumaça)', () => {
    expect(typeof defaultRunner).toBe('function');
  });
});

describe('migrateInvocation', () => {
  it('reexecuta o MESMO binário da CLI, com db:migrate', () => {
    const invocation = migrateInvocation();
    expect(invocation.args).toContain('db:migrate');
    // nunca um caminho fixo de PATH: o okcms instalado é o que tem as migrations
    expect(invocation.command).not.toBe('okcms');
  });
});

// ---------------------------------------------------------------------------

describe('primeiro deploy (sem lane anterior)', () => {
  it('sobe blue, troca o proxy e NÃO derruba nada', async () => {
    const runner = makeRunner();
    const result = await deploy(runner);

    expect(result.ok).toBe(true);
    expect(result.lane).toBe('blue');
    expect(result.previousLane).toBeNull();

    const calls = runner.calls;
    expect(at(calls, 'network create --driver bridge okcms-net')).toBeGreaterThanOrEqual(0);
    expect(at(calls, '-p okcms -f docker-compose.infra.yml up -d')).toBeGreaterThanOrEqual(0);
    expect(at(calls, '-p okcms-blue -f docker-compose.deploy.yml build')).toBeGreaterThanOrEqual(0);
    expect(at(calls, 'db:migrate')).toBeGreaterThanOrEqual(0);
    expect(at(calls, 'up -d api-blue web-blue admin-blue')).toBeGreaterThanOrEqual(0);
    expect(at(calls, 'nginx -s reload')).toBeGreaterThanOrEqual(0);
    expect(at(calls, 'up -d worker-blue')).toBeGreaterThanOrEqual(0);

    expect(at(calls, ' stop ')).toBe(-1);
    expect(at(calls, ' down')).toBe(-1);
    expect(upstreamsText()).toContain('okcms-api-blue');
    expect(JSON.parse(readFileSync(join(dir, '.deploy/state.json'), 'utf-8'))).toMatchObject({
      lane: 'blue',
      previousLane: null,
      version: '0.3.0',
    });
  });

  it('ordena: build → migrate → edge → swap → worker', async () => {
    const runner = makeRunner();
    await deploy(runner);
    const calls = runner.calls;

    const build = at(calls, 'deploy.yml build');
    const migrate = at(calls, 'db:migrate');
    const edge = at(calls, 'up -d api-blue');
    const swap = at(calls, 'nginx -s reload');
    const worker = at(calls, 'up -d worker-blue');

    expect(build).toBeGreaterThanOrEqual(0);
    expect(build).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(edge);
    expect(edge).toBeLessThan(swap);
    expect(swap).toBeLessThan(worker);
  });
});

describe('deploy seguinte (blue → green)', () => {
  beforeEach(() => {
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(
      join(dir, '.deploy/state.json'),
      JSON.stringify({ lane: 'blue', previousLane: 'green', version: '0.3.0', at: 'x', history: [] })
    );
  });

  it('vai para a outra lane e derruba a antiga sem -v', async () => {
    const runner = makeRunner();
    const result = await deploy(runner);

    expect(result.ok).toBe(true);
    expect(result.lane).toBe('green');
    expect(result.previousLane).toBe('blue');

    const calls = runner.calls;
    expect(at(calls, 'up -d api-green web-green admin-green')).toBeGreaterThanOrEqual(0);

    const down = calls.find((call) => call.includes('-p okcms-blue') && call.includes('down'));
    expect(down).toBeDefined();
    // -v apagaria okcms-storage — compartilhado entre blue e green
    expect(down).not.toMatch(/\s-v(\s|$)/);
    expect(down).not.toContain('--volumes');
    expect(down).toContain('--remove-orphans');
  });

  it('DRENA o worker antigo antes de subir o novo', async () => {
    const runner = makeRunner();
    await deploy(runner);
    const calls = runner.calls;

    const drain = at(calls, 'stop worker-blue');
    const wait = calls.findIndex(
      (call) => call.startsWith('docker inspect') && call.includes('okcms-worker-blue')
    );
    const spawn = at(calls, 'up -d worker-green');
    const down = calls.findIndex(
      (call) => call.includes('-p okcms-blue') && call.includes(' down')
    );

    expect(drain).toBeGreaterThanOrEqual(0);
    expect(wait).toBeGreaterThan(drain);
    expect(spawn).toBeGreaterThan(wait);
    // derrubar a lane velha é o ÚLTIMO passo — só depois do worker novo no ar
    expect(down).toBeGreaterThan(spawn);
  });

  it('swap vem depois do healthcheck da lane nova', async () => {
    const runner = makeRunner();
    await deploy(runner);
    const calls = runner.calls;

    const edgeUp = at(calls, 'up -d api-green');
    const reload = at(calls, 'nginx -s reload');
    expect(edgeUp).toBeLessThan(reload);

    // os healthchecks são sondagens de `docker inspect` dos contêineres novos
    const inspectAfterEdge = calls
      .slice(edgeUp)
      .filter((call) => call.startsWith('docker inspect') && call.includes('green'));
    expect(inspectAfterEdge.length).toBeGreaterThan(0);
  });

  it('sem --remove-orphans, o down vem limpo', async () => {
    const runner = makeRunner();
    await deploy(runner, { noCache: false, removeOrphans: false });

    const down = runner.calls.find((call) => call.includes('-p okcms-blue') && call.includes('down'));
    expect(down).not.toContain('--remove-orphans');
    expect(down).not.toContain('-v');
  });

  it('--no-cache vira build --no-cache', async () => {
    const runner = makeRunner();
    await deploy(runner, { noCache: true, removeOrphans: true });

    expect(runner.calls.some((call) => call.includes('deploy.yml build --no-cache'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('falhas não derrubam o que está no ar', () => {
  beforeEach(() => {
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(
      join(dir, '.deploy/state.json'),
      JSON.stringify({ lane: 'blue', previousLane: null, version: '0.3.0', at: 'x', history: [] })
    );
  });

  it('healthcheck da lane nova falha → nada trocou, verde derrubado', async () => {
    const runner = makeRunner({ unhealthy: ['okcms-api-green'] });
    const result = await deploy(runner);

    expect(result.ok).toBe(false);
    expect(result.lane).toBe('blue');
    expect(result.message).toContain('não ficou saudável');

    const calls = runner.calls;
    // nunca houve swap
    expect(at(calls, 'nginx -s reload')).toBe(-1);
    expect(upstreamsText()).toContain('okcms-api-blue');
    // lane nova removida, lane velha intocada
    expect(calls.some((call) => call.includes('-p okcms-green') && call.includes(' down'))).toBe(true);
    expect(calls.some((call) => call.includes('-p okcms-blue') && call.includes(' down'))).toBe(false);
    expect(calls.some((call) => call.includes('stop worker-blue'))).toBe(false);
  });

  it('migration falha → build já feito, mas nenhum contêiner subiu', async () => {
    const runner = makeRunner({
      fail: (_command, args) => args.includes('db:migrate'),
    });
    const result = await deploy(runner);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Migrations falharam');
    expect(result.message).toContain('continua servindo');

    const calls = runner.calls;
    expect(at(calls, 'deploy.yml build')).toBeGreaterThanOrEqual(0);
    expect(at(calls, 'up -d api-green')).toBe(-1);
    expect(at(calls, 'nginx -s reload')).toBe(-1);
    expect(at(calls, 'stop worker-blue')).toBe(-1);
  });

  it('proxy não recarrega → upstreams restaurados na lane azul', async () => {
    const runner = makeRunner({
      fail: (_command, args) => args[0] === 'exec' || args[0] === 'restart',
    });
    const result = await deploy(runner);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Proxy não recarregou');
    expect(upstreamsText()).toContain('okcms-api-blue');
    expect(upstreamsText()).not.toContain('okcms-api-green');
    expect(droppedGreenLane(runner.calls)).toBe(true);
  });

  it('infra não sobe → para antes de mexer em pacote/build/migration', async () => {
    const runner = makeRunner({
      fail: (_command, args) =>
        args.some((arg) => arg.includes('infra.yml')) && args.includes('up'),
    });
    const result = await deploy(runner);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Infraestrutura não subiu');
    expect(at(runner.calls, 'deploy.yml build')).toBe(-1);
    expect(at(runner.calls, 'db:migrate')).toBe(-1);
  });
});

/** a lane verde foi derrubada depois da falha de swap */
function droppedGreenLane(calls: string[]): boolean {
  return calls.some((call) => call.includes('-p okcms-green') && call.includes('down'));
}

// ---------------------------------------------------------------------------

describe('pacotes no host', () => {
  it('instala a lista enviada pelo scan (antes do build)', async () => {
    const runner = makeRunner();
    await deployBlueGreen({
      cwd: dir,
      runner,
      choices: BASE_CHOICES,
      timeouts: FAST,
      healthProbe: async () => true,
      packages: ['@oktis-works/api@latest', '@oktis-works/core@latest'],
      log: (m) => logs.push(m),
      warn: (m) => warns.push(m),
    });

    const calls = runner.calls;
    const install = at(calls, 'bun add @oktis-works/api@latest @oktis-works/core@latest');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(at(calls, 'deploy.yml build'));
  });

  it('projeto sem node_modules roda bun install', async () => {
    const runner = makeRunner();
    await deployBlueGreen({
      cwd: dir,
      runner,
      choices: BASE_CHOICES,
      timeouts: FAST,
      healthProbe: async () => true,
      installAll: true,
      log: (m) => logs.push(m),
      warn: (m) => warns.push(m),
    });

    expect(runner.calls.some((call) => call === 'bun install')).toBe(true);
  });

  it('sem pacotes pendentes não chama instalador algum', async () => {
    const runner = makeRunner();
    await deploy(runner);
    expect(runner.calls.some((call) => call.startsWith('bun add'))).toBe(false);
    expect(runner.calls.some((call) => call === 'bun install')).toBe(false);
  });
});

describe('portas do .env alimentam o upstream', () => {
  it('portas customizadas aparecem no arquivo gravado', async () => {
    writeFileSync(join(dir, '.env'), ENV.replace('PORT=3000', 'PORT=4000'));
    const runner = makeRunner();
    await deploy(runner);

    expect(upstreamsText()).toContain('http://okcms-api-blue:4000');
    expect(upstreamsText()).toContain('http://okcms-web-blue:3001');
    expect(upstreamsText()).toContain('http://okcms-admin-blue:3011');
  });
});

describe('renderUpstreams como fonte do swap', () => {
  it('o conteúdo gravado é exatamente o da fábrica', () => {
    seed();
    expect(upstreamsText()).toBe(renderUpstreams('blue'));
  });
});
