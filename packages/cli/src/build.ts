// @oktis-works/cms - cms build: build do projeto via bun filters (cli-devexp-005)

import { spawnSync } from 'node:child_process';

export interface BuildStepResult {
  label: string;
  ok: boolean;
  durationMs: number;
  output: string;
}

export interface BuildOptions {
  apps?: Array<'api' | 'admin' | 'web'>;
  cwd?: string;
  /** Injetável para testes. */
  spawn?: typeof spawnSync;
}

export const DEFAULT_APPS: Array<'api' | 'admin' | 'web'> = ['api', 'admin', 'web'];

/**
 * Executa `bun run --filter <app> build` para cada app selecionado.
 * Falha em um app interrompe a sequência (exit code != 0 propagado).
 */
export function runProjectBuild(options: BuildOptions = {}): { results: BuildStepResult[]; ok: boolean } {
  const spawn = options.spawn ?? spawnSync;
  const apps = options.apps ?? DEFAULT_APPS;
  const results: BuildStepResult[] = [];

  for (const app of apps) {
    const started = Date.now();
    const result = spawn('bun', ['run', '--filter', `@oktis-works/${app}`, 'build'], {
      cwd: options.cwd ?? process.cwd(),
      encoding: 'utf-8',
    });
    const durationMs = Date.now() - started;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

    results.push({ label: app, ok: result.status === 0, durationMs, output });

    if (result.status !== 0) break;
  }

  return { results, ok: results.every((r) => r.ok) };
}
