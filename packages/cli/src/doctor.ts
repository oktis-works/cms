// @oktis-works/cms - cms doctor: diagnóstico do ambiente (cli-devexp-003)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from 'node:net';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

export function parseDatabaseUrl(url: string): { host: string; port: number; database: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return null;
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      database: parsed.pathname.replace(/^\//, ''),
    };
  } catch {
    return null;
  }
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
  opts: { tcpProbe?: typeof checkTcp; env?: DoctorEnv } = {}
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
  if (!dbUrl && hasEnv) {
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      if (line.startsWith('DATABASE_URL=')) {
        dbUrl = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }

  // DATABASE_URL parseável
  const parsedUrl = dbUrl ? parseDatabaseUrl(dbUrl) : null;
  results.push({
    name: 'DATABASE_URL',
    ok: Boolean(parsedUrl),
    detail: parsedUrl ? `${parsedUrl.host}:${parsedUrl.port}/${parsedUrl.database}` : 'não configurado',
    required: true,
  });

  // TCP Postgres (opcional — ambiente pode estar fora)
  if (parsedUrl) {
    const reachable = await probe(parsedUrl.host, parsedUrl.port);
    results.push({
      name: 'postgres-tcp',
      ok: reachable,
      detail: reachable ? `${parsedUrl.host}:${parsedUrl.port} acessível` : `${parsedUrl.host}:${parsedUrl.port} inacessível`,
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

  return results;
}
