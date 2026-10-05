// @oktis-works/cms - cms doctor: diagnóstico do ambiente (cli-devexp-003)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from 'node:net';

import type { Runner } from './docker.js';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

export function parseDatabaseUrl(url: string): { host: string; port: number; database: string } | null {
  try {
    const parsed = new URL(url);
    const isPg = parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
    const isMysql = parsed.protocol === 'mysql:';
    if (!isPg && !isMysql) return null;
    return {
      host: parsed.hostname,
      port: Number(parsed.port || (isMysql ? 3306 : 5432)),
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
}

/** Chaves KEY=VALUE de um .env (sem sobrescrever process.env). */
function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) {
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
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
  cwd?: string;
}

export async function runDoctorChecks(
  opts: { tcpProbe?: typeof checkTcp; env?: DoctorEnv; runner?: Runner } = {}
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const nodeVersion = opts.env?.nodeVersion ?? process.version;
  const cwd = opts.env?.cwd ?? process.cwd();
  const probe = opts.tcpProbe ?? checkTcp;

  // Node >= 20
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
  results.push({
    name: 'node',
    ok: major >= 20,
    detail: nodeVersion,
    required: true,
  });

  // .env
  const envPath = join(cwd, '.env');
  const hasEnv = existsSync(envPath);
  results.push({ name: '.env', ok: hasEnv, detail: envPath, required: true });

  let dbUrl = process.env['DATABASE_URL'] ?? '';
  const fileEnv = hasEnv ? parseEnvFile(envPath) : {};
  const resolveEnv = (key: string): string => process.env[key] ?? fileEnv[key] ?? '';
  if (!dbUrl) dbUrl = resolveEnv('DATABASE_URL');

  // Banco: DATABASE_URL OU variáveis separadas DB_* — o usuário escolhe o formato.
  const parsedUrl = dbUrl ? parseDatabaseUrl(dbUrl) : null;
  const dbVarHost = resolveEnv('DB_HOST') || 'localhost';
  const dbVarPort = resolveEnv('DB_PORT') || '5432';
  const dbName = resolveEnv('DB_NAME') || 'okcms';
  const hasDbVars = Boolean(
    resolveEnv('DB_HOST') || resolveEnv('DB_PORT') || resolveEnv('DB_NAME') || resolveEnv('DB_USER')
  );

  let dbOk: boolean;
  let dbDetail: string;
  if (dbUrl && !parsedUrl) {
    dbOk = false;
    dbDetail = 'Invalid DATABASE_URL (expected postgres://user:pass@host:5432/db)';
  } else if (parsedUrl) {
    dbOk = true;
    dbDetail = `via DATABASE_URL — ${parsedUrl.host}:${parsedUrl.port}/${parsedUrl.database}`;
  } else if (hasDbVars) {
    dbOk = true;
    dbDetail = `via DB_* — ${dbVarHost}:${dbVarPort}/${dbName}`;
  } else {
    dbOk = false;
    dbDetail = 'not configured — use DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER';
  }
  results.push({ name: 'database', ok: dbOk, detail: dbDetail, required: true });

  // TCP do banco (opcional — ambiente pode estar fora)
  if (parsedUrl || dbOk) {
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
