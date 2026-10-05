// @oktis-works/cms - Deploy target (blue/green · simple · pm2)
//
// `okcms deploy`, `okcms update` and `okcms redeploy` all choose the SAME
// target through the same menu, and the last choice is remembered in
// `.deploy/state.json` so the next run opens with it pre-selected.
//
// A flag (`--target`) always wins — that is what CI uses — and a non-TTY run
// falls back to the saved target (or blue/green on a fresh project) instead of
// prompting, so a script never blocks waiting for an arrow key.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Prompt } from './prompt.js';

export type DeployTarget = 'blue-green' | 'simple' | 'pm2';

/** Default on a project that never deployed. */
export const DEFAULT_TARGET: DeployTarget = 'blue-green';

const STATE_PATH = '.deploy/state.json';

/** Parses `--target` (old spellings keep working). `null` = unknown value. */
export function parseTarget(value: string): DeployTarget | null {
  const normalized = value.trim().toLowerCase();
  if (['blue-green', 'bluegreen', 'blue_green', 'docker', 'lane', 'lanes'].includes(normalized)) {
    return 'blue-green';
  }
  if (['simple', 'compose', 'single', 'stack', 'container'].includes(normalized)) {
    return 'simple';
  }
  if (['pm2', 'process', 'host'].includes(normalized)) {
    return 'pm2';
  }
  return null;
}

/** Raw `.deploy/state.json` (any shape) — never throws. */
function readState(cwd: string): Record<string, unknown> {
  const path = join(cwd, STATE_PATH);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Target used by the last successful deploy, if any. */
export function savedTarget(cwd: string): DeployTarget | null {
  const value = readState(cwd)['target'];
  return value === 'blue-green' || value === 'simple' || value === 'pm2' ? value : null;
}

/** Merges the target into the state file, preserving lane/history fields. */
export function saveTarget(cwd: string, target: DeployTarget): void {
  const path = join(cwd, STATE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const state = readState(cwd);
  state['target'] = target;
  state['targetAt'] = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

/**
 * `--target` > saved target > prompt. The prompt only runs on a TTY without
 * `--yes`; everything else resolves deterministically.
 */
export async function resolveTarget(
  opts: { cwd?: string; target?: string; yes?: boolean },
  prompt: Prompt
): Promise<DeployTarget> {
  const cwd = opts.cwd ?? process.cwd();

  if (opts.target !== undefined) {
    const parsed = parseTarget(opts.target);
    if (parsed === null) {
      throw new Error(`invalid --target "${opts.target}" — use blue-green, simple or pm2`);
    }
    return parsed;
  }

  const saved = savedTarget(cwd);

  if (!prompt.interactive || opts.yes === true) return saved ?? DEFAULT_TARGET;

  return await prompt.select<DeployTarget>(
    'Deploy target',
    [
      {
        value: 'blue-green',
        label: 'Blue / green',
        hint: 'zero downtime · two lanes · instant rollback',
      },
      {
        value: 'simple',
        label: 'Simple containers',
        hint: 'one stack · quick · brief restart',
      },
      {
        value: 'pm2',
        label: 'PM2 on the host',
        hint: 'no docker build · processes on the host',
      },
    ],
    { defaultValue: saved ?? DEFAULT_TARGET }
  );
}
