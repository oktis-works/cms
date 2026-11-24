// `bun run dev` in the monorepo: app watchers + compiled theme artifacts.
//
// The official project flow is `okcms dev` (which already starts the theme
// watchers). This wrapper gives the same React/Solid rebuild behavior when
// developing the CMS repository itself.

import { spawn } from 'node:child_process';

let stopThemes = () => {};

try {
  const { startProjectThemeWatchers } = await import(
    '../packages/cli/src/theme-dev.ts'
  );
  stopThemes = await startProjectThemeWatchers({ cwd: process.cwd() });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[dev] compiled-theme watcher disabled: ${message}`);
  console.warn('[dev] run `bun run build` once, then restart `bun run dev`');
}

const apps = spawn('bun', ['run', '--filter', '@oktis-works/*', 'dev'], {
  stdio: 'inherit',
  env: process.env,
});

const shutdown = () => {
  stopThemes();
  apps.kill('SIGTERM');
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

apps.on('exit', (code, signal) => {
  stopThemes();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
