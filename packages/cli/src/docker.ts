// @oktis-works/cms - Camada Docker/Compose da CLI
//
// Toda a execução passa por um `Runner` injetável. Isso não é "teste por
// teste": blue/green tem passos que NÃO podem ser re-executados às cegas
// (migrar duas vezes, derrubar a lane certa), então os testes precisam
// inspecionar exatamente qual comando foi montado — e um runner falso é a
// única forma de fazer isso sem subir containers.
//
// Superfície de rede desta camada: `docker` e `docker compose` no socket
// local. Nenhuma URL é aberta aqui (o `bun add` do update fica isolado em
// `guards.ts` + allowlist do registry).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEPLOY_PATHS, renderUpstreams, portsFromEnv, type Lane, type UpstreamPorts } from './assets.js';

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** Ecoa stdout/stderr no terminal — para passos longos (build/up). */
  inherit?: boolean;
}

export interface RunResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  /** Comando montado, para asserções de teste e para o log do wizard. */
  command: string;
}

export type Runner = (command: string, args: string[], opts?: RunOptions) => RunResult;

function format(command: string, args: string[]): string {
  return [command, ...args].join(' ');
}

export const defaultRunner: Runner = (command, args, opts = {}) => {
  const result = spawnSync(command, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    encoding: 'utf-8',
    timeout: opts.timeoutMs,
    stdio: opts.inherit ? 'inherit' : 'pipe',
    maxBuffer: 32 * 1024 * 1024,
  });

  return {
    ok: result.status === 0 && !result.error,
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.error ? `${result.stderr ?? ''}\n${result.error.message}` : (result.stderr ?? ''),
    command: format(command, args),
  };
};

/** Comando que falhou por timeout (o spawnSync devolve error, não mensagem legível). */
export function failure(command: string, args: string[], reason: string): RunResult {
  return { ok: false, code: null, stdout: '', stderr: reason, command: format(command, args) };
}

// ---------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------

export function dockerAvailable(runner: Runner = defaultRunner): boolean {
  return runner('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 }).ok;
}

export interface ComposeProbe {
  ok: boolean;
  /** Versão curta (ex.: `5.6.0`), vazia quando não há compose. */
  version: string;
}

/**
 * `docker compose` (v2, plugin) — o `docker-compose` legado (v1, Python) não
 * é suportado: os arquivos usam `x-` extensions, `name:` e healthcheck
 * `condition`, que só o v2 entende.
 */
export function composeAvailable(runner: Runner = defaultRunner): ComposeProbe {
  const result = runner('docker', ['compose', 'version', '--short'], { timeoutMs: 15_000 });
  if (!result.ok) return { ok: false, version: '' };
  return { ok: true, version: result.stdout.trim() };
}

// ---------------------------------------------------------------------------
// Serviços do compose (papéis via label okcms.role)
// ---------------------------------------------------------------------------

export type ServiceRole = 'edge' | 'worker' | 'data' | 'proxy' | 'unknown';

export interface ComposeServiceInfo {
  /** Nome da chave em `services:`. */
  name: string;
  containerName: string;
  role: ServiceRole;
  lane: Lane | null;
}

const SERVICE_KEYS = ['container_name', 'okcms.role', 'okcms.lane'] as const;

/**
 * Parser por indentação — não um YAML completo.
 *
 * O compose que a CLI lê é gerada por ela mesma; um parser de verdade
 * (js-yaml) seria uma dependência nova num pacote que hoje não tem nenhuma,
 * para extrair três campos. A restrição (chave em `services:` com indent 2,
 * campos com indent maior) é verificada pelos testes contra o arquivo real.
 */
export function parseComposeServices(yaml: string): ComposeServiceInfo[] {
  const services: ComposeServiceInfo[] = [];
  const lines = yaml.split(/\r?\n/);

  let inServices = false;
  let current: ComposeServiceInfo | null = null;

  for (const line of lines) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    // fim do bloco services: chave de nível 0 (networks:, volumes:, x-*)
    if (inServices && /^[A-Za-z_-][\w-]*:\s*$/.test(line)) {
      if (current) services.push(current);
      current = null;
      inServices = false;
      continue;
    }
    if (!inServices) continue;

    const serviceMatch = /^ {2}([A-Za-z0-9][\w.-]*):\s*$/.exec(line);
    if (serviceMatch) {
      if (current) services.push(current);
      current = {
        name: serviceMatch[1]!,
        containerName: '',
        role: 'unknown',
        lane: null,
      };
      continue;
    }
    if (!current) continue;

    for (const key of SERVICE_KEYS) {
      const match = new RegExp(`^\\s+${key.replace('.', '\\.')}:\\s*(\\S+)\\s*$`).exec(line);
      if (!match) continue;
      const value = match[1]!.replace(/^["']|["']$/g, '');
      if (key === 'container_name') current.containerName = value;
      else if (key === 'okcms.role') current.role = value as ServiceRole;
      else current.lane = value as Lane;
    }
  }
  if (current) services.push(current);

  return services;
}

export function classifyServices(services: ComposeServiceInfo[], lane: Lane): {
  edge: ComposeServiceInfo[];
  worker: ComposeServiceInfo[];
  untouched: ComposeServiceInfo[];
} {
  return {
    edge: services.filter((service) => service.role === 'edge' && service.lane === lane),
    worker: services.filter((service) => service.role === 'worker' && service.lane === lane),
    untouched: services.filter((service) => service.role === 'data' || service.role === 'proxy'),
  };
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

export const INFRA_PROJECT = 'okcms';
export const infraProject = (): string => INFRA_PROJECT;
export const laneProject = (lane: Lane): string => `okcms-${lane}`;
export const otherLane = (lane: Lane): Lane => (lane === 'blue' ? 'green' : 'blue');

export const COMPOSE_INFRA_FILE = 'docker-compose.infra.yml';
export const COMPOSE_DEPLOY_FILE = 'docker-compose.deploy.yml';
/** Simple (lane-less) stack — `okcms deploy --target simple`. */
export const COMPOSE_APP_FILE = 'docker-compose.app.yml';

export const APP_PROJECT = 'okcms-app';
/** Container names of the simple stack (no lane suffix). */
export const SIMPLE_CONTAINERS = ['okcms-api', 'okcms-web', 'okcms-admin'] as const;
export const SIMPLE_WORKER_CONTAINER = 'okcms-worker';

export interface ComposeCall {
  project?: string;
  file?: string;
  args: string[];
  inherit?: boolean;
  timeoutMs?: number;
}

/** `docker compose -p <projeto> -f <arquivo> ...` — a única forma montada aqui. */
export function composeArgs(call: ComposeCall): string[] {
  const args: string[] = ['compose'];
  if (call.project) args.push('-p', call.project);
  if (call.file) args.push('-f', call.file);
  args.push(...call.args);
  return args;
}

export function runCompose(
  cwd: string,
  call: ComposeCall,
  runner: Runner = defaultRunner
): RunResult {
  return runner('docker', composeArgs(call), {
    cwd,
    inherit: call.inherit ?? false,
    timeoutMs: call.timeoutMs,
  });
}

export const infraCompose = (cwd: string, args: string[], runner?: Runner, inherit?: boolean): RunResult =>
  runCompose(cwd, { project: INFRA_PROJECT, file: COMPOSE_INFRA_FILE, args, inherit }, runner);

export const laneCompose = (
  cwd: string,
  lane: Lane,
  args: string[],
  runner?: Runner,
  inherit?: boolean
): RunResult =>
  runCompose(cwd, { project: laneProject(lane), file: COMPOSE_DEPLOY_FILE, args, inherit }, runner);

/** `docker compose -p okcms-app -f docker-compose.app.yml ...` (simple mode). */
export const appCompose = (
  cwd: string,
  args: string[],
  runner?: Runner,
  inherit?: boolean
): RunResult => runCompose(cwd, { project: APP_PROJECT, file: COMPOSE_APP_FILE, args, inherit }, runner);

/**
 * `okcms-net` é declarada como `external: true` no compose das lanes — se ela
 * não existir, o `up` falha com um erro obscuro. Criar antes torna o fluxo
 * independente da ordem em que o operador rodou a infra.
 */
export function ensureNetwork(cwd: string, runner: Runner = defaultRunner): RunResult {
  const inspect = runner('docker', ['network', 'inspect', 'okcms-net'], { timeoutMs: 15_000 });
  if (inspect.ok) return inspect;
  return runner('docker', ['network', 'create', '--driver', 'bridge', 'okcms-net'], {
    cwd,
    timeoutMs: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Estado da lane
// ---------------------------------------------------------------------------

export const LANE_STATE_PATH = '.deploy/state.json';

export interface LaneEntry {
  lane: Lane;
  version: string;
  at: string;
}

export interface LaneState {
  /** Lane que está no ar agora (donadora do tráfego). */
  lane: Lane;
  /** Lane anterior — é para cá que um rollback volta. */
  previousLane: Lane | null;
  version: string;
  at: string;
  history: LaneEntry[];
}

export function readLaneState(cwd: string): LaneState | null {
  const path = join(cwd, LANE_STATE_PATH);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as LaneState;
    if (parsed.lane !== 'blue' && parsed.lane !== 'green') return null;
    return parsed;
  } catch {
    // arquivo corrompido não pode derrubar o deploy: o fallback é o docker
    return null;
  }
}

export function writeLaneState(cwd: string, state: LaneState): void {
  const path = join(cwd, LANE_STATE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

export function pushLaneState(
  previous: LaneState | null,
  lane: Lane,
  version: string
): LaneState {
  const now = new Date().toISOString();
  const history = [...(previous?.history ?? [])];
  if (previous) history.push({ lane: previous.lane, version: previous.version, at: previous.at });
  return {
    lane,
    previousLane: previous?.lane ?? null,
    version,
    at: now,
    // histórico é diagnóstico, não log infinito
    history: history.slice(-20),
  };
}

/**
 * Containers de uma lane com `okcms.role=edge` em execução.
 * Usado quando não há `.deploy/state.json` (primeira execução / clone limpo).
 */
export function edgeContainers(runner: Runner, lane: Lane): string[] {
  const result = runner(
    'docker',
    [
      'ps',
      '--filter', `label=okcms.lane=${lane}`,
      '--filter', 'label=okcms.role=edge',
      '--format', '{{.Names}}',
    ],
    { timeoutMs: 15_000 }
  );
  if (!result.ok) return [];
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** Estado do file é a fonte de verdade; o docker é o fallback. */
export function detectActiveLane(cwd: string, runner: Runner = defaultRunner): Lane | null {
  const state = readLaneState(cwd);
  if (state) return state.lane;

  if (edgeContainers(runner, 'blue').length > 0) return 'blue';
  if (edgeContainers(runner, 'green').length > 0) return 'green';
  return null;
}

/**
 * Is the lane-less simple stack running?
 *
 * Its containers carry `okcms.service` but no `okcms.lane`, so the name is
 * matched exactly — `docker ps --filter name=okcms-api` would also match
 * `okcms-api-blue` and retire the wrong thing.
 */
export function simpleStackRunning(runner: Runner): boolean {
  const result = runner(
    'docker',
    ['ps', '--filter', 'label=okcms.service', '--format', '{{.Names}}'],
    { timeoutMs: 15_000 }
  );
  if (!result.ok) return false;
  const names = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return names.some(
    (name) =>
      (SIMPLE_CONTAINERS as readonly string[]).includes(name) || name === SIMPLE_WORKER_CONTAINER
  );
}

// ---------------------------------------------------------------------------
// Inspeção / espera
// ---------------------------------------------------------------------------

export interface ContainerState {
  exists: boolean;
  running: boolean;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none' | null;
}

export const STOPPED: ContainerState = { exists: false, running: false, health: null };

export function inspectContainer(runner: Runner, name: string): ContainerState {
  const result = runner(
    'docker',
    [
      'inspect',
      '--format',
      '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
      name,
    ],
    { timeoutMs: 15_000 }
  );
  if (!result.ok) return STOPPED;

  const [status, health] = result.stdout.trim().split('|');
  return {
    exists: true,
    running: status === 'running',
    health: (health as ContainerState['health']) ?? 'none',
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Chamado a cada rodada — é onde o wizard imprime a contagem. */
  onTick?: (elapsedMs: number) => void;
}

/** Aguarda um predicado sobre o estado do container; false = timeout. */
export async function waitForContainer(
  runner: Runner,
  name: string,
  predicate: (state: ContainerState) => boolean,
  opts: WaitOptions = {}
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const started = Date.now();

  for (;;) {
    const state = inspectContainer(runner, name);
    if (predicate(state)) return true;
    const elapsed = Date.now() - started;
    if (elapsed >= timeoutMs) return false;
    opts.onTick?.(elapsed);
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}

/** Container destruído ou sem healthcheck = "não está servindo". */
export const isServing = (state: ContainerState): boolean =>
  state.running && state.health !== 'unhealthy';

/**
 * Pronto para receber tráfego: rodando e (quando tem healthcheck) healthy.
 * `none` = serviço sem healthcheck definido — não dá para esperar mais nada.
 */
export const isHealthy = (state: ContainerState): boolean =>
  state.running && (state.health === 'healthy' || state.health === 'none');

export const isStopped = (state: ContainerState): boolean => !state.running;

/**
 * Espera ativa: o processo saiu da lista (`docker ps` não o mostra mais).
 * `docker stop` já bloqueia até o `stop_grace_period`, então isto é um
 * cinto e suspensório para o caso de o dreno estourar o tempo.
 */
export const waitStopped = (runner: Runner, name: string, opts: WaitOptions = {}): Promise<boolean> =>
  waitForContainer(runner, name, isStopped, { timeoutMs: 60_000, ...opts });

// ---------------------------------------------------------------------------
// Upstreams do proxy
// ---------------------------------------------------------------------------

export function upstreamsPath(cwd: string): string {
  return join(cwd, DEPLOY_PATHS.nginxUpstreams);
}

/** Grava os upstreams apontando para `lane` e devolve o texto. */
export function writeUpstreams(
  cwd: string,
  lane: Lane,
  record: Record<string, string> = {}
): string {
  const ports: UpstreamPorts = portsFromEnv(record);
  const content = renderUpstreams(lane, ports);
  const path = upstreamsPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  return content;
}

/** Lane que os upstreams atuais apontam — usada em doctor/rollback. */
export function readUpstreamsLane(cwd: string): Lane | null {
  const path = upstreamsPath(cwd);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf-8');
  if (/okcms-(?:api|web|admin)-blue\b/.test(text)) return 'blue';
  if (/okcms-(?:api|web|admin)-green\b/.test(text)) return 'green';
  return null;
}

export const PROXY_CONTAINER = 'okcms-proxy';

export function proxyRunning(runner: Runner = defaultRunner): boolean {
  return inspectContainer(runner, PROXY_CONTAINER).running;
}

/**
 * `nginx -s reload` é o coração do swap: re-lê a configuração nova com as
 * conexões existentes vivas. Nunca `restart` — isso derrubaria o proxy (e o
 * TLS/rotas junto) no meio do deploy.
 */
export function reloadProxy(cwd: string, runner: Runner = defaultRunner): RunResult {
  return runner('docker', ['exec', PROXY_CONTAINER, 'nginx', '-s', 'reload'], {
    cwd,
    timeoutMs: 30_000,
  });
}

/** Sobrescrita total da config do proxy (só quando `reload` falha). */
export function restartProxy(cwd: string, runner: Runner = defaultRunner): RunResult {
  return runner('docker', ['restart', PROXY_CONTAINER], { cwd, timeoutMs: 60_000 });
}
