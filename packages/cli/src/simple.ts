// @oktis-works/cms - Simple container deploy (`--target simple`)
//
// One Docker project (`okcms-app`), no lanes, no swap dance:
//
//   1. preflight        → docker + compose v2 before touching anything
//   2. network + infra  → postgres, redis and the proxy come up
//   3. packages on host → db:migrate below needs the new code
//   4. build            → okcms/app image (layer cache unless --no-cache)
//   5. db:migrate       → on the host, between build and traffic
//   6. up               → recreate only the containers whose config changed
//   7. healthcheck      → gate BEFORE moving traffic: failed = nothing changes
//   8. proxy upstreams  → point nginx at the lane-less containers + reload
//   9. retire old lane  → if blue/green was running, drain it after the swap
//
// Brief restart instead of zero downtime — that is the trade for speed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { DEPLOY_PATHS, renderSimpleUpstreams, portsFromEnv } from './assets.js';
import {
  appCompose,
  detectActiveLane,
  ensureNetwork,
  infraCompose,
  isHealthy,
  laneCompose,
  reloadProxy,
  waitStopped,
  waitForContainer,
  defaultRunner,
  type Runner,
  type RunResult,
} from './docker.js';
import {
  ensureDeployFiles,
  loadDeployEnv,
  migrateInvocation,
  preflight,
  DEFAULT_TIMEOUTS,
  type DeployTimeouts,
} from './bluegreen.js';
import type { Prompt } from './prompt.js';

export interface SimpleDeployOptions {
  cwd?: string;
  runner?: Runner;
  prompt?: Prompt;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  /** `docker compose build --no-cache` (redeploy/update only). */
  noCache?: boolean;
  /** `pkg@latest` specs to install on the host before the build. */
  packages?: string[];
  /** Fresh clone: run `bun install` instead of `bun add`. */
  installAll?: boolean;
  /** Authoritative check through the proxy after the swap (test seam). */
  healthProbe?: (url: string) => Promise<boolean>;
  timeouts?: DeployTimeouts;
}

export interface SimpleDeployResult {
  ok: boolean;
  message?: string;
  /** Deploy files created during this run (existing ones are never touched). */
  created: string[];
}

async function defaultHealthProbe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Rewrites `00-upstreams.conf` for the lane-less stack. */
export function writeSimpleUpstreams(cwd: string, record: Record<string, string>): string {
  const content = renderSimpleUpstreams(portsFromEnv(record));
  const path = join(cwd, DEPLOY_PATHS.nginxUpstreams);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
  return content;
}

/** true when the upstreams file already targets the simple stack. */
export function upstreamsAreSimple(cwd: string): boolean {
  const path = join(cwd, DEPLOY_PATHS.nginxUpstreams);
  if (!existsSync(path)) return false;
  return /http:\/\/okcms-(?:api|web|admin):/.test(readFileSync(path, 'utf-8'));
}

/** `bun add <specs>` with an npm fallback when bun is missing on the host. */
function installPackages(
  cwd: string,
  packages: string[],
  runner: Runner
): RunResult {
  const bun = runner('bun', ['add', ...packages], { cwd, inherit: true, timeoutMs: 600_000 });
  if (bun.ok || !/ENOENT|not found|spawn/i.test(bun.stderr)) return bun;
  return runner('npm', ['install', ...packages], { cwd, inherit: true, timeoutMs: 600_000 });
}

export async function deploySimple(opts: SimpleDeployOptions = {}): Promise<SimpleDeployResult> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultRunner;
  const log = opts.log ?? ((message: string): void => void console.log(message));
  const warn = opts.warn ?? ((message: string): void => void console.warn(message));
  const probe = opts.healthProbe ?? defaultHealthProbe;
  const timeout: Required<DeployTimeouts> = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };
  const packages = opts.packages ?? [];

  const record = loadDeployEnv(cwd);
  const created = ensureDeployFiles(cwd, record, runner);
  const previousLane = detectActiveLane(cwd, runner);

  const plan: string[] = [
    'Preflight: docker + compose v2',
    'Network okcms-net and infra (postgres, redis, proxy)',
    'Packages on the host',
    'Build image',
    'Migrations on the host',
    'Start the stack (api, web, admin, worker)',
    'Healthcheck (gate: failed = nothing changes)',
    'Point the proxy at the stack (nginx -s reload)',
    ...(previousLane ? [`Retire lane ${previousLane}`] : []),
    'Record deploy state',
  ];

  const next = (index: number): void => log(`\n[${index}/${plan.length}] ${plan[index - 1]}`);
  const fail = (message: string): SimpleDeployResult => {
    warn(message);
    return { ok: false, message, created };
  };

  // ---- 1. preflight -------------------------------------------------------
  next(1);
  const ready = preflight(runner);
  if (!ready.ok) return fail(ready.message ?? 'Preflight failed.');

  // ---- 2. network + infra -------------------------------------------------
  next(2);
  const network = ensureNetwork(cwd, runner);
  if (!network.ok) return fail(`Could not create network okcms-net: ${network.stderr.trim()}`);

  const infra = infraCompose(cwd, ['up', '-d'], runner, true);
  if (!infra.ok) return fail(`Infra did not start:\n${infra.stderr.trim()}`);

  for (const dataContainer of ['okcms-postgres', 'okcms-redis']) {
    const healthy = await waitForContainer(runner, dataContainer, isHealthy, {
      timeoutMs: timeout.dataMs,
      intervalMs: timeout.intervalMs,
    });
    if (!healthy) {
      return fail(`${dataContainer} never became healthy — see \`docker logs ${dataContainer}\`.`);
    }
  }
  log('  ✓ infra ready (postgres, redis, proxy)');

  // ---- 3. packages on the host -------------------------------------------
  next(3);
  if (opts.installAll) {
    const installed = runner('bun', ['install'], { cwd, inherit: true, timeoutMs: 600_000 });
    if (!installed.ok) return fail(`bun install failed:\n${installed.stderr.trim()}`);
    log('  ✓ dependencies installed on the host');
  } else if (packages.length > 0) {
    const installed = installPackages(cwd, packages, runner);
    if (!installed.ok) {
      return fail(`Could not install packages (${installed.command}):\n${installed.stderr.trim()}`);
    }
    log(`  ✓ ${packages.length} package(s) updated on the host`);
  } else {
    log('  ✓ nothing to install (packages up to date)');
  }

  // ---- 4. build -----------------------------------------------------------
  next(4);
  const build = appCompose(cwd, ['build', ...(opts.noCache ? ['--no-cache'] : [])], runner, true);
  if (!build.ok) return fail(`Image build failed:\n${build.stderr.trim()}`);
  log(`  ✓ image okcms/app built${opts.noCache ? ' (no cache)' : ''}`);

  // ---- 5. migrations ------------------------------------------------------
  next(5);
  const migrate = migrateInvocation();
  const migrated = runner(migrate.command, migrate.args, { cwd, inherit: true, timeoutMs: 600_000 });
  if (!migrated.ok) return fail(`Migrations failed — nothing was switched:\n${migrated.stderr.trim()}`);

  // ---- 6. start the stack -------------------------------------------------
  next(6);
  const up = appCompose(cwd, ['up', '-d'], runner, true);
  if (!up.ok) return fail(`Stack did not start:\n${up.stderr.trim()}`);

  // ---- 7. healthcheck — BEFORE moving any traffic -------------------------
  next(7);
  for (const container of ['okcms-api', 'okcms-web', 'okcms-admin']) {
    const healthy = await waitForContainer(runner, container, isHealthy, {
      timeoutMs: timeout.edgeMs,
      intervalMs: timeout.intervalMs,
    });
    if (!healthy) {
      return fail(
        `${container} never became healthy — nothing was switched; the previous setup keeps serving. ` +
          `Check \`docker logs ${container}\`.`
      );
    }
  }
  log('  ✓ 3 container(s) healthy');

  // ---- 8. proxy upstreams -------------------------------------------------
  next(8);
  writeSimpleUpstreams(cwd, record);
  const reloaded = reloadProxy(cwd, runner);
  if (!reloaded.ok) {
    warn('  nginx -s reload failed — restarting the proxy to pick up the new upstreams.');
    const restarted = runner('docker', ['restart', 'okcms-proxy'], { cwd, timeoutMs: 60_000 });
    if (!restarted.ok) {
      return fail(
        `Proxy did not reload (${reloaded.stderr.trim() || reloaded.command}) — upstreams left pointing at the previous setup.`
      );
    }
  }
  log('  ✓ proxy now routes to the simple stack');

  // ---- 9. retire an old lane ---------------------------------------------
  if (previousLane) {
    next(9);
    // SIGTERM + stop_grace_period (30s): the queue finishes the job in hand.
    const workerService = `worker-${previousLane}`;
    laneCompose(cwd, previousLane, ['stop', workerService], runner, true);
    await waitStopped(runner, `okcms-${workerService}`, {
      timeoutMs: timeout.stopMs,
      intervalMs: Math.min(1_000, timeout.intervalMs),
    });
    const down = laneCompose(cwd, previousLane, ['down'], runner, true);
    if (!down.ok) {
      warn(`  Lane ${previousLane} did not go down cleanly: ${down.stderr.trim()}`);
      warn(`  Run it manually: docker compose -p okcms-${previousLane} down`);
    } else {
      log(`  ✓ lane ${previousLane} drained and removed`);
    }
  }

  // ---- 10. state ----------------------------------------------------------
  next(plan.length);
  const healthy = await probe('http://127.0.0.1/health');
  if (!healthy) {
    warn(
      '  Note: http://127.0.0.1/health did not answer through the proxy.\n' +
        '  Containers are healthy (internal check) — check SERVER_NAME / Host header.'
    );
  }

  log('\n  Deploy done: simple stack is live.');
  if (created.length > 0) log(`  Deploy files created: ${created.join(', ')}`);
  log('  Site: http://<host>/  ·  Admin: http://<host>:8080/');

  return { ok: true, created };
}
