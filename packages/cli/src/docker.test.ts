// @oktis-works/cms - Camada Docker/Compose (F2)
//
// Nada aqui toca um Docker real: blue/green tem ordem de comandos que não
// pode ser "testada tentando". Todo teste injeta um runner que registra o
// que foi montado e devolve o que quisermos.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMPOSE_INFRA_FILE,
  INFRA_PROJECT,
  STOPPED,
  composeArgs,
  composeAvailable,
  classifyServices,
  detectActiveLane,
  dockerAvailable,
  ensureNetwork,
  failure,
  inspectContainer,
  infraCompose,
  isServing,
  isStopped,
  laneCompose,
  laneProject,
  otherLane,
  parseComposeServices,
  proxyRunning,
  pushLaneState,
  readLaneState,
  readUpstreamsLane,
  reloadProxy,
  restartProxy,
  runCompose,
  waitStopped,
  waitForContainer,
  writeLaneState,
  writeUpstreams,
  edgeContainers,
  type Runner,
} from './docker.js';

// ---------------------------------------------------------------------------
// Runner falso
// ---------------------------------------------------------------------------

type Handler = (command: string, args: string[]) => Partial<import('./docker.js').RunResult>;

function fakeRunner(handler: Handler = () => ({})): Runner & { calls: string[] } {
  const calls: string[] = [];
  const runner = ((command: string, args: string[]) => {
    const commandLine = [command, ...args].join(' ');
    calls.push(commandLine);
    const partial = handler(command, args);
    return {
      ok: partial.ok ?? true,
      code: partial.code ?? 0,
      stdout: partial.stdout ?? '',
      stderr: partial.stderr ?? '',
      command: partial.command ?? commandLine,
    };
  }) as Runner & { calls: string[] };
  runner.calls = calls;
  return runner;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-docker-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('montagem de comando', () => {
  it('composeArgs sempre passa -p e -f quando informados', () => {
    expect(composeArgs({ project: 'okcms-blue', file: 'x.yml', args: ['up', '-d'] })).toEqual([
      'compose',
      '-p',
      'okcms-blue',
      '-f',
      'x.yml',
      'up',
      '-d',
    ]);
    expect(composeArgs({ args: ['version'] })).toEqual(['compose', 'version']);
  });

  it('infraCompose e laneCompose fixam projeto e arquivo', () => {
    const runner = fakeRunner();
    infraCompose('/p', ['up', '-d'], runner);
    laneCompose('/p', 'green', ['down'], runner);

    expect(runner.calls[0]).toBe(`docker compose -p ${INFRA_PROJECT} -f ${COMPOSE_INFRA_FILE} up -d`);
    expect(runner.calls[1]).toBe('docker compose -p okcms-green -f docker-compose.deploy.yml down');
  });

  it('runCompose propaga cwd e inherit', () => {
    const seen: Array<Record<string, unknown>> = [];
    const runner = ((command: string, args: string[], opts?: Record<string, unknown>) => {
      seen.push(opts ?? {});
      return { ok: true, code: 0, stdout: '', stderr: '', command: `${command} ${args.join(' ')}` };
    }) as Runner;

    runCompose('/projeto', { args: ['build'], inherit: true, timeoutMs: 123 }, runner);

    expect(seen[0]?.['cwd']).toBe('/projeto');
    expect(seen[0]?.['inherit']).toBe(true);
    expect(seen[0]?.['timeoutMs']).toBe(123);
  });

  it('failure() devolve o comando para o log do wizard', () => {
    const result = failure('docker', ['up'], 'timeout');
    expect(result.ok).toBe(false);
    expect(result.command).toBe('docker up');
    expect(result.stderr).toBe('timeout');
  });

  it('nomes de projeto de lane', () => {
    expect(laneProject('blue')).toBe('okcms-blue');
    expect(laneProject('green')).toBe('okcms-green');
    expect(otherLane('blue')).toBe('green');
    expect(otherLane('green')).toBe('blue');
  });
});

describe('disponibilidade', () => {
  it('docker responde → disponível', () => {
    expect(dockerAvailable(fakeRunner(() => ({ stdout: '29.8.2\n' })))).toBe(true);
  });

  it('docker ausente → indisponível (sem exceção)', () => {
    expect(
      dockerAvailable(fakeRunner(() => ({ ok: false, code: 127, stderr: 'command not found' })))
    ).toBe(false);
  });

  it('compose v2 via plugin, com versão', () => {
    const probe = composeAvailable(fakeRunner((c, args) =>
      args.join(' ') === 'compose version --short' ? { stdout: '5.6.0\n' } : {}
    ));
    expect(probe).toEqual({ ok: true, version: '5.6.0' });
  });

  it('docker-compose legado (v1) não conta', () => {
    expect(
      composeAvailable(fakeRunner(() => ({ ok: false, code: 1, stderr: 'compose is not a docker command' })))
    ).toEqual({ ok: false, version: '' });
  });
});

// ---------------------------------------------------------------------------

describe('parseComposeServices', () => {
  const YAML = `name: demo
x-app: &app
  image: demo:1
  environment:
    A: b

services:
  api-blue:
    <<: *app
    container_name: okcms-api-blue
    labels:
      okcms.role: edge
      okcms.lane: blue
      com.okcms.managed: "true"
  worker-blue:
    <<: *app
    container_name: okcms-worker-blue
    labels:
      okcms.role: worker
      okcms.lane: "blue"

networks: {}
`;

  it('extrai nome, container, papel e lane', () => {
    const services = parseComposeServices(YAML);
    expect(services).toEqual([
      { name: 'api-blue', containerName: 'okcms-api-blue', role: 'edge', lane: 'blue' },
      { name: 'worker-blue', containerName: 'okcms-worker-blue', role: 'worker', lane: 'blue' },
    ]);
  });

  it('campos ausentes viram unknown/null em vez de quebrar', () => {
    const services = parseComposeServices('services:\n  api:\n    image: x\n');
    expect(services).toEqual([{ name: 'api', containerName: '', role: 'unknown', lane: null }]);
  });

  it('não confunde chaves internas com serviços', () => {
    const services = parseComposeServices(YAML);
    expect(services.map((service) => service.name)).not.toContain('environment');
    expect(services.map((service) => service.name)).not.toContain('labels');
    expect(services.map((service) => service.name)).not.toContain('x-app');
  });

  it('sem bloco services devolve lista vazia', () => {
    expect(parseComposeServices('name: nada\n')).toEqual([]);
  });

  it('aspas são removidas do valor', () => {
    const services = parseComposeServices(
      'services:\n  x:\n    container_name: "okcms-x"\n    labels:\n      okcms.role: "edge"\n'
    );
    expect(services[0]).toMatchObject({ containerName: 'okcms-x', role: 'edge' });
  });
});

describe('classifyServices', () => {
  it('separa edge da lane, worker da lane e o que é intocável', () => {
    const services = [
      { name: 'api-blue', containerName: 'a', role: 'edge' as const, lane: 'blue' as const },
      { name: 'worker-blue', containerName: 'w', role: 'worker' as const, lane: 'blue' as const },
      { name: 'api-green', containerName: 'g', role: 'edge' as const, lane: 'green' as const },
      { name: 'postgres', containerName: 'p', role: 'data' as const, lane: null },
      { name: 'proxy', containerName: 'x', role: 'proxy' as const, lane: null },
    ];

    const result = classifyServices(services, 'blue');
    expect(result.edge.map((service) => service.name)).toEqual(['api-blue']);
    expect(result.worker.map((service) => service.name)).toEqual(['worker-blue']);
    expect(result.untouched.map((service) => service.name)).toEqual(['postgres', 'proxy']);
  });

  it('a outra lane NÃO entra em nenhuma lista da lane atual', () => {
    const services = [
      { name: 'api-green', containerName: 'g', role: 'edge' as const, lane: 'green' as const },
      { name: 'worker-green', containerName: 'wg', role: 'worker' as const, lane: 'green' as const },
    ];
    expect(classifyServices(services, 'blue')).toEqual({ edge: [], worker: [], untouched: [] });
  });
});

// ---------------------------------------------------------------------------

describe('estado da lane', () => {
  it('round-trip de estado', () => {
    expect(readLaneState(dir)).toBeNull();

    writeLaneState(dir, {
      lane: 'blue',
      previousLane: 'green',
      version: '0.2.0',
      at: '2026-10-04T00:00:00.000Z',
      history: [],
    });

    expect(readLaneState(dir)?.lane).toBe('blue');
    expect(existsSync(join(dir, '.deploy/state.json'))).toBe(true);
  });

  it('state.json corrompido não derruba o fluxo (fallback docker)', () => {
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(join(dir, '.deploy/state.json'), '{ nao e json');

    expect(readLaneState(dir)).toBeNull();
    const runner = fakeRunner((c, args) =>
      args.join(' ').includes('label=okcms.lane=green') ? { stdout: 'okcms-api-green-1\n' } : {}
    );
    expect(detectActiveLane(dir, runner)).toBe('green');
  });

  it('state.json tem precedência sobre o docker (transição em andamento)', () => {
    writeLaneState(dir, {
      lane: 'blue',
      previousLane: 'green',
      version: '1.0.0',
      at: 'now',
      history: [],
    });

    // as duas lanes no ar durante o swap: o arquivo diz quem serve
    const runner = fakeRunner((c, args) =>
      args.join(' ').includes('label=okcms.lane=green') ? { stdout: 'okcms-api-green-1\n' } : {}
    );
    expect(detectActiveLane(dir, runner)).toBe('blue');
  });

  it('sem estado, detecta pela lane com containers edge rodando', () => {
    const blue = fakeRunner((c, args) =>
      args.join(' ').includes('label=okcms.lane=blue') ? { stdout: 'okcms-api-blue-1\n' } : {}
    );
    expect(detectActiveLane(dir, blue)).toBe('blue');

    const none = fakeRunner(() => ({ stdout: '' }));
    expect(detectActiveLane(dir, none)).toBeNull();
  });

  it('edgeContainers limpa linhas vazias e falhas', () => {
    expect(edgeContainers(fakeRunner(() => ({ stdout: 'a\n\n b \n' })), 'blue')).toEqual(['a', 'b']);
    expect(edgeContainers(fakeRunner(() => ({ ok: false, stderr: 'daemon down' })), 'blue')).toEqual([]);
  });

  it('pushLaneState guarda a lane anterior e corta o histórico infinito', () => {
    const first = pushLaneState(null, 'green', '0.2.0');
    expect(first.lane).toBe('green');
    expect(first.previousLane).toBeNull();

    const second = pushLaneState(first, 'blue', '0.3.0');
    expect(second.lane).toBe('blue');
    expect(second.previousLane).toBe('green');
    expect(second.history).toHaveLength(1);
    expect(second.history[0]).toMatchObject({ lane: 'green', version: '0.2.0' });

    let state = second;
    for (let i = 0; i < 30; i++) state = pushLaneState(state, i % 2 ? 'blue' : 'green', `${i}`);
    expect(state.history.length).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------

describe('inspeção de container', () => {
  it('sem healthcheck → health none, ainda servindo', () => {
    const runner = fakeRunner(() => ({ stdout: 'running|none\n' }));
    expect(inspectContainer(runner, 'okcms-api-blue')).toEqual({
      exists: true,
      running: true,
      health: 'none',
    });
    expect(isServing(inspectContainer(runner, 'x'))).toBe(true);
  });

  it('unhealthy não serve', () => {
    const runner = fakeRunner(() => ({ stdout: 'running|unhealthy\n' }));
    expect(isServing(inspectContainer(runner, 'x'))).toBe(false);
  });

  it('container inexistente é STOPPED (exit != 0 do docker inspect)', () => {
    const runner = fakeRunner(() => ({ ok: false, code: 1, stderr: 'No such object' }));
    expect(inspectContainer(runner, 'nope')).toEqual(STOPPED);
    expect(isStopped(STOPPED)).toBe(true);
  });

  it('starting ainda conta como não-pronto, mas não como falha', () => {
    const runner = fakeRunner(() => ({ stdout: 'running|starting\n' }));
    const state = inspectContainer(runner, 'x');
    expect(state.health).toBe('starting');
    expect(isServing(state)).toBe(true);
  });

  it('proxyRunning usa o nome fixo do container', () => {
    const calls: string[] = [];
    const runner = ((command: string, args: string[]) => {
      calls.push([command, ...args].join(' '));
      return { ok: true, code: 0, stdout: 'running|none\n', stderr: '', command: '' };
    }) as Runner;
    expect(proxyRunning(runner)).toBe(true);
    expect(calls[0]).toContain('okcms-proxy');
  });
});

describe('waitForContainer', () => {
  it('resolve true quando o predicado passa', async () => {
    const runner = fakeRunner(() => ({ stdout: 'running|healthy\n' }));
    const ok = await waitForContainer(runner, 'x', (state) => state.health === 'healthy', {
      timeoutMs: 500,
      intervalMs: 5,
    });
    expect(ok).toBe(true);
  });

  it('resolve false no timeout (deploy não pendura para sempre)', async () => {
    const runner = fakeRunner(() => ({ stdout: 'running|unhealthy\n' }));
    const ticks: number[] = [];
    const ok = await waitForContainer(runner, 'x', (state) => state.health === 'healthy', {
      timeoutMs: 60,
      intervalMs: 10,
      onTick: (elapsed) => ticks.push(elapsed),
    });

    expect(ok).toBe(false);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.at(-1)).toBeLessThan(1000);
  });

  it('waitStopped cai no STOPPED correto', async () => {
    const runner = fakeRunner(() => ({ ok: false, code: 1, stderr: 'No such' }));
    expect(await waitStopped(runner, 'okcms-worker-blue')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('ensureNetwork', () => {
  it('rede já existe → nenhuma criação', () => {
    const runner = fakeRunner(() => ({ stdout: '[]' }));
    expect(ensureNetwork('/p', runner).ok).toBe(true);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toContain('network inspect okcms-net');
  });

  it('rede ausente → cria com nome fixo', () => {
    const runner = fakeRunner((c, args) =>
      args[1] === 'inspect' ? { ok: false, code: 1, stderr: 'no such network' } : {}
    );
    ensureNetwork('/p', runner);

    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1]).toBe('docker network create --driver bridge okcms-net');
  });
});

describe('proxy', () => {
  it('recarrega em vez de reiniciar (reload mantém conexões vivas)', () => {
    const reload = fakeRunner();
    reloadProxy('/p', reload);
    expect(reload.calls[0]).toBe('docker exec okcms-proxy nginx -s reload');

    const restart = fakeRunner();
    restartProxy('/p', restart);
    expect(restart.calls[0]).toBe('docker restart okcms-proxy');
  });

  it('reload é usado primeiro no swap', () => {
    // guarda contra regressão: trocar restartPor reload derruba o TLS no meio
    expect(reloadProxy.toString).toBeDefined();
    const runner = fakeRunner();
    reloadProxy('/p', runner);
    expect(runner.calls[0]).not.toContain('restart');
  });
});

// ---------------------------------------------------------------------------

describe('upstreams em disco', () => {
  it('grava apontando para a lane e relê a lane atual', () => {
    expect(readUpstreamsLane(dir)).toBeNull();

    writeUpstreams(dir, 'green', { PORT: '4000' });
    const text = readFileSync(join(dir, 'deploy/nginx/conf.d/00-upstreams.conf'), 'utf-8');

    expect(text).toContain('http://okcms-api-green:4000');
    expect(readUpstreamsLane(dir)).toBe('green');

    writeUpstreams(dir, 'blue', {});
    expect(readUpstreamsLane(dir)).toBe('blue');
  });

  it('cria o diretório se não existir (clone limpo)', () => {
    writeUpstreams(join(dir, 'nested'), 'blue');
    expect(existsSync(join(dir, 'nested/deploy/nginx/conf.d/00-upstreams.conf'))).toBe(true);
  });

  it('arquivo sem nenhuma lane conhecida devolve null (não chuta)', () => {
    mkdirSync(join(dir, 'deploy/nginx/conf.d'), { recursive: true });
    writeFileSync(join(dir, 'deploy/nginx/conf.d/00-upstreams.conf'), '# vazio\n');
    expect(readUpstreamsLane(dir)).toBeNull();
  });
});
