// @oktis-works/cms - cms doctor: diagnóstico do ambiente (cli-devexp-003)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from 'node:net';

import type { Runner } from './docker.js';
import { parseDatabaseUrl as parseSharedDatabaseUrl, resolveDatabaseConfig } from './database-config.js';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

export function parseDatabaseUrl(url: string): { host: string; port: number; database: string } | null {
  return parseSharedDatabaseUrl(url);
}

/** TCP probe puro (injetável para testes). */
export function checkTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export interface DoctorEnv {
  nodeVersion?: string;
  bunVersion?: string;
  cwd?: string;
}

const MIN_NODE = [22, 17];
const MIN_BUN = [1, 4, 4];

function atLeastVersion(raw: string, minimum: number[]): boolean {
  const parts = raw.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < minimum.length; index += 1) {
    const actual = parts[index] ?? 0;
    if (actual > minimum[index]!) return true;
    if (actual < minimum[index]!) return false;
  }
  return true;
}

export async function runDoctorChecks(
  opts: { tcpProbe?: typeof checkTcp; env?: DoctorEnv; runner?: Runner } = {}
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const nodeVersion = opts.env?.nodeVersion ?? process.version;
  const bunVersion = opts.env ? opts.env.bunVersion : process.versions['bun'];
  const cwd = opts.env?.cwd ?? process.cwd();
  const probe = opts.tcpProbe ?? checkTcp;

  // Keep this in sync with the root package engines. Bun is accepted when the
  // CLI is running under Bun; Node must satisfy the exact minimum minor.
  const runtimeOk = bunVersion
    ? atLeastVersion(bunVersion, MIN_BUN)
    : atLeastVersion(nodeVersion, MIN_NODE);
  results.push({
    name: 'node',
    ok: runtimeOk,
    detail: bunVersion ? `Bun ${bunVersion} (Node ${nodeVersion})` : nodeVersion,
    required: true,
  });

  // .env
  const envPath = join(cwd, '.env');
  const hasEnv = existsSync(envPath);
  results.push({ name: '.env', ok: hasEnv, detail: envPath, required: true });

  const database = resolveDatabaseConfig(cwd);
  const parsedUrl = database.parsed;
  const dbVarHost = parsedUrl?.host ?? 'localhost';
  const dbVarPort = String(parsedUrl?.port ?? (database.engine === 'postgres' ? 5432 : 3306));
  const dbName = parsedUrl?.database ?? 'okcms';
  results.push({
    name: 'database-provider',
    ok: ['postgres', 'mysql', 'mariadb'].includes(database.engine),
    detail: `provider ${database.engine}; see docs/provider-matrix.md for supported server versions`,
    required: true,
  });

  let dbOk: boolean;
  let dbDetail: string;
  const unsupportedEngine = !['postgres', 'mysql', 'mariadb'].includes(database.engine);
  if (unsupportedEngine || database.error && !database.error.startsWith('Database connection is incomplete')) {
    dbOk = false;
    dbDetail = database.error ?? 'Database provider configuration is invalid.';
  } else if (parsedUrl && database.source === 'url') {
    dbOk = true;
    dbDetail = `via DATABASE_URL — ${parsedUrl.host}:${parsedUrl.port}/${parsedUrl.database}`;
  } else if (database.configured) {
    dbOk = true;
    dbDetail = `via DB_* — ${dbVarHost}:${dbVarPort}/${dbName}`;
  } else {
    dbOk = false;
    dbDetail = 'not configured — use DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER';
  }
  results.push({ name: 'database', ok: dbOk, detail: dbDetail, required: true });

  // TCP do banco (opcional — ambiente pode estar fora)
  if ((parsedUrl || dbOk) && !unsupportedEngine) {
    const host = parsedUrl?.host ?? dbVarHost;
    const port = parsedUrl?.port ?? Number(dbVarPort);
    const reachable = await probe(host, port);
    results.push({
      name: 'db-tcp',
      ok: reachable,
      detail: reachable ? `${host}:${port} reachable` : `${host}:${port} unreachable`,
      required: false,
    });
  }

  // okcms.config.json
  const configPath = join(cwd, 'okcms.config.json');
  results.push({
    name: 'okcms.config.json',
    ok: existsSync(configPath),
    detail: configPath,
    required: true,
  });

  // --- Deploy blue/green ---------------------------------------------------
  // Nada aqui é `required: true`: projeto rodando local (`okcms start`) não
  // precisa de Docker. O que importa é DIZER ao operador por que o deploy
  // não vai funcionar, em vez de ele descobrir no meio de um swap.
  //
  // O módulo entra por dynamic import porque `env-schema` importa este
  // arquivo — carregar os templates de deploy em `okcms config` seria peso
  // morto em todo start de wizard.
  const docker = await import('./docker.js');
  const runner = opts.runner ?? docker.defaultRunner;

  const dockerOk = docker.dockerAvailable(runner);
  results.push({
    name: 'docker',
    ok: dockerOk,
    detail: dockerOk
      ? 'daemon reachable'
      : 'missing or stopped — only affects `okcms update --mode deploy`',
    required: false,
  });

  const compose = docker.composeAvailable(runner);
  results.push({
    name: 'compose',
    ok: compose.ok,
    detail: compose.ok
      ? `plugin v2 (${compose.version || 'ok'})`
      : 'plugin v2 missing — `docker compose version` failed (legacy v1 not supported)',
    required: false,
  });

  // Lane ativa: o estado salvo em .deploy/state.json, senão quem está no ar.
  const lane = dockerOk ? docker.detectActiveLane(cwd, runner) : null;
  results.push({
    name: 'lane',
    ok: dockerOk,
    detail: !dockerOk
      ? 'docker unavailable'
      : lane
        ? `lane ${lane} active (rollback: ${docker.otherLane(lane)})`
        : 'no lane running — first deploy',
    required: false,
  });

  const proxy = dockerOk && docker.proxyRunning(runner);
  results.push({
    name: 'proxy',
    ok: proxy || lane === null,
    detail: proxy
      ? 'okcms-proxy running'
      : lane === null
        ? 'not deployed to Docker yet (local use does not need it)'
        : 'okcms-proxy stopped with an active lane — site unreachable',
    required: false,
  });

  return results;
}
