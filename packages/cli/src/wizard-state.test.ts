// @oktis-works/cms - Wizard: sondagem de estado (adaptativa) — 100% hermético

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { probeState, suggestNext } from './wizard-state.js';
import type { Runner, RunResult } from './docker.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-wizstate-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Runner de mentira: `docker version` e `docker inspect` respondem por tabela. */
function runnerFor(opts: { dockerOk: boolean; containers?: Record<string, string> }): Runner {
  return (command, args) => {
    const line = `${command} ${args.join(' ')}`;
    const fail = (stderr: string): RunResult => ({ ok: false, code: 1, stdout: '', stderr, command: line });
    const pass = (stdout: string): RunResult => ({ ok: true, code: 0, stdout, stderr: '', command: line });

    if (args[0] === 'version') {
      return opts.dockerOk ? pass('27.0.1') : fail('Cannot connect to the Docker daemon');
    }
    if (args[0] === 'inspect') {
      const name = args[args.length - 1]!;
      const state = opts.containers?.[name];
      return state ? pass(state) : fail('No such container');
    }
    return fail('unexpected command');
  };
}

const COMPLETE_ENV = [
  'NODE_ENV=development',
  'DB_PASSWORD=postgres',
  'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
  '',
].join('\n');

const noApps = (): Array<{ label: string; alive: boolean }> => [];
const apiRunning = (): Array<{ label: string; alive: boolean }> => [
  { label: 'api', alive: true },
];

function writeProjectEnv(contents: string): void {
  writeFileSync(join(dir, '.env'), contents);
  writeFileSync(join(dir, 'okcms.config.json'), JSON.stringify({ name: 'test-project' }));
}

const INFRA_UP: Record<string, string> = {
  'okcms-postgres': 'running|healthy',
  'okcms-redis': 'running|healthy',
};

// ---------------------------------------------------------------------------

describe('probeState', () => {
  it('flags an empty directory as "not a project"', () => {
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: false }), appsFn: noApps });
    expect(state.isProject).toBe(false);
    expect(state.envComplete).toBe(false);
    expect(suggestNext(state)).toBe('init');
  });

  it('detects a project by .env / okcms.config.json', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: false }), appsFn: noApps });
    expect(state.isProject).toBe(true);
  });

  it('does not treat an unrelated .env as an OkCMS project', () => {
    writeFileSync(join(dir, '.env'), COMPLETE_ENV);
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: false }), appsFn: noApps });
    expect(state.isProject).toBe(false);
  });

  it('counts the required fields missing from .env', () => {
    writeProjectEnv('NODE_ENV=development\n');
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: true }), appsFn: noApps });
    expect(state.envComplete).toBe(false);
    expect(state.envMissing).toBe(2); // DB_PASSWORD + JWT_SECRET
    expect(suggestNext(state)).toBe('env');
  });

  it('honours the `when` rule: DATABASE_URL replaces DB_PASSWORD', () => {
    writeProjectEnv(
      ['DATABASE_URL=postgres://u:p@localhost:5432/okcms', 'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa', ''].join('\n')
    );
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: true }), appsFn: noApps });
    expect(state.envComplete).toBe(true);
    expect(state.envMissing).toBe(0);
  });

  it('reports docker down without touching containers', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: false }), appsFn: noApps });
    expect(state.dockerUp).toBe(false);
    expect(state.infraRunning).toBe(false);
    expect(suggestNext(state)).toBe('apps'); // sem docker, sugere subir os apps locais
  });

  it('suggests infra when the database containers are down', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: true, containers: {} }), appsFn: noApps });
    expect(state.infraRunning).toBe(false);
    expect(suggestNext(state)).toBe('infra');
  });

  it('detects the infra containers running', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({
      cwd: dir,
      runner: runnerFor({ dockerOk: true, containers: INFRA_UP }),
      appsFn: noApps,
    });
    expect(state.infraRunning).toBe(true);
    expect(suggestNext(state)).toBe('apps');
  });

  it('does not report infrastructure ready while a required service is starting', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({
      cwd: dir,
      runner: runnerFor({
        dockerOk: true,
        containers: { ...INFRA_UP, 'okcms-redis': 'running|starting' },
      }),
      appsFn: noApps,
    });
    expect(state.infraRunning).toBe(false);
  });

  it('reports alive apps with their labels (dead pids ignored)', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({
      cwd: dir,
      runner: runnerFor({ dockerOk: true, containers: INFRA_UP }),
      appsFn: () => [
        { label: 'api', alive: true },
        { label: 'web', alive: false },
      ],
    });
    expect(state.appsRunning).toBe(true);
    expect(state.appsLabels).toEqual(['api']);
    expect(suggestNext(state)).toBe('deploy');
  });

  it('suggests apps when nothing is running yet', () => {
    writeProjectEnv(COMPLETE_ENV);
    const state = probeState({ cwd: dir, runner: runnerFor({ dockerOk: true, containers: INFRA_UP }), appsFn: noApps });
    expect(suggestNext(state)).toBe('apps');
  });
});

describe('suggestNext priority order', () => {
  it('project > env > infra > apps > deploy', () => {
    // projeto novo SEM .env → init mesmo com docker e apps prontos
    const fresh = probeState({ cwd: dir, runner: runnerFor({ dockerOk: true, containers: INFRA_UP }), appsFn: apiRunning });
    expect(suggestNext(fresh)).toBe('init');
  });
});
