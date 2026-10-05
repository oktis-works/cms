// @oktis-works/cms - Dependency install with a live loader (init)
//
// `okcms init` used to shell out to `bun install` (spawnSync) and print a
// single "✓ dependencies installed with bun" line — a minute of silence on a
// fresh project. This module replaces it with a small animated loader:
//
//   ⠹ Installing dependencies with bun
//     ✓ @oktis-works/api@0.3.2
//     ✓ @oktis-works/cms@0.3.2
//     • @oktis-works/web
//
// Packages flip to ✓ with their REAL version as the tool reports them (bun
// streams `+ name@version` lines); anything the stream does not report is
// reconciled from `node_modules/<name>/package.json` when the install ends —
// npm prints no per-package lines at all, so the reconcile is what makes the
// list honest for both package managers.
//
// Zero dependencies, like the rest of the CLI: the spinner is a setInterval
// that repaints a block with the same ANSI erase trick used by the menus in
// prompt.ts. Without a TTY (CI, pipes) there is no animation: the same block
// is printed once, statically.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { style, symbol } from './prompt.js';

export type PackageManager = 'bun' | 'npm';

export interface DirectDep {
  name: string;
  /** Installed version — null when the tool never reported it. */
  version: string | null;
}

export interface InstallLiveResult {
  ok: boolean;
  tool: PackageManager;
  /** Total packages reported by the tool (null when it printed no summary). */
  total: number | null;
  /** Wall-clock duration in seconds. */
  seconds: number;
  /** Direct dependencies with the versions actually installed. */
  direct: DirectDep[];
  /** Combined stdout+stderr tail (for failure reporting). */
  output: string;
}

export interface InstallLiveOptions {
  /** Animate the spinner + per-package list (TTY only in practice). */
  interactive?: boolean;
  /** Injectable for tests. */
  spawn?: typeof spawn;
  /** Injectable for tests (bun detection). */
  probe?: typeof spawnSync;
}

/** Braille spinner — single-cell glyphs that render on every terminal. */
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** CSI without escape literals in source (same trick as prompt.ts). */
const ESC = String.fromCharCode(27);

/** Minimal surface of the child's stdio we use — keeps the test fake tiny. */
interface StreamLike {
  on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
}

/** `+ @scope/name@1.2.3` — bun's line for every package it installs. */
const ADDED_LINE = /^\s*\+\s*(.+?)@([^\s@]+)\s*$/gm;

/**
 * Detects whether `bun` is usable. Any failure to probe (ENOENT, non-zero
 * status, crash) means npm — never a half-working bun.
 */
export function detectPackageManager(probe: typeof spawnSync = spawnSync): PackageManager {
  const check = probe('bun', ['--version'], { encoding: 'utf-8', timeout: 5_000 });
  return !check.error && check.status === 0 ? 'bun' : 'npm';
}

/** Direct dependencies of the project, @oktis-works/* first (the headline act). */
export function readDirectDeps(root: string): string[] {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = new Set<string>([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);
    return [...names].sort((a, b) => {
      const aOk = a.startsWith('@oktis-works/');
      const bOk = b.startsWith('@oktis-works/');
      if (aOk !== bOk) return aOk ? -1 : 1;
      return a.localeCompare(b);
    });
  } catch {
    return [];
  }
}

/** Extracts `+ name@version` pairs from a tool output chunk. */
export function parseAddedVersions(output: string): Array<{ name: string; version: string }> {
  const found: Array<{ name: string; version: string }> = [];
  for (const match of output.matchAll(ADDED_LINE)) {
    const name = match[1];
    const version = match[2];
    if (name && version) found.push({ name, version });
  }
  return found;
}

/** Package count from either tool's summary line. */
export function parseInstallTotal(output: string): number | null {
  const bun = output.match(/(\d+)\s+packages?\s+installed/);
  if (bun?.[1]) return Number(bun[1]);
  const npm = output.match(/added\s+(\d+)\s+packages?/);
  if (npm?.[1]) return Number(npm[1]);
  return null;
}

/** Real installed version, straight from the package that landed on disk. */
export function installedVersion(root: string, name: string): string | null {
  try {
    const manifest = JSON.parse(
      readFileSync(join(root, 'node_modules', ...name.split('/'), 'package.json'), 'utf-8')
    ) as { version?: string };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

/** Repaintable terminal block (moves up, clears, rewrites). */
class LiveBlock {
  private painted = 0;

  render(lines: string[]): void {
    if (this.painted > 0) process.stdout.write(`${ESC}[${this.painted}A${ESC}[0J`);
    process.stdout.write(`${lines.join('\n')}\n`);
    this.painted = lines.length;
  }
}

/**
 * Installs the project dependencies with the best available tool (bun when
 * installed, npm otherwise) and renders the live loader. Never throws: a
 * failed install returns `ok: false` with the output tail — the project files
 * are already on disk and the Next steps still apply.
 */
export async function installProjectDepsLive(
  root: string,
  options: InstallLiveOptions = {}
): Promise<InstallLiveResult> {
  const spawnFn = options.spawn ?? spawn;
  const interactive = options.interactive ?? Boolean(process.stdout.isTTY);

  const tool = detectPackageManager(options.probe);
  const versions = new Map<string, string | null>(readDirectDeps(root).map((name) => [name, null]));

  const startedAt = Date.now();
  let output = '';
  let frame = 0;

  const rows = (): string[] =>
    [...versions].map(([name, version]) =>
      version !== null
        ? `    ${style.green(symbol.ok)} ${style.cyan(`${name}@${version}`)}`
        : `    ${style.gray(symbol.bullet)} ${style.gray(name)}`
    );

  const runningHeader = (): string =>
    `  ${style.cyan(FRAMES[frame % FRAMES.length]!)} ${style.bold(`Installing dependencies with ${tool}`)}`;

  const block = new LiveBlock();
  const repaint = (): void => {
    if (interactive) block.render([runningHeader(), ...rows()]);
  };

  const onChunk = (chunk: string | Buffer): void => {
    const text = String(chunk);
    output += text;
    for (const { name, version } of parseAddedVersions(text)) {
      if (versions.has(name)) versions.set(name, version);
    }
    repaint();
  };

  // npm's own per-line output is noise (and its progress bar fights the
  // spinner): keep it quiet and let the loader narrate. bun has no such flag —
  // its `+ name@version` lines are exactly what we parse.
  const args =
    tool === 'bun'
      ? ['install']
      : ['install', '--no-fund', '--no-audit', '--loglevel=error'];

  const child = spawnFn(tool, args, {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  (child.stdout as unknown as StreamLike | null)?.on('data', onChunk);
  (child.stderr as unknown as StreamLike | null)?.on('data', onChunk);

  let timer: ReturnType<typeof setInterval> | null = null;
  if (interactive) {
    timer = setInterval(() => {
      frame += 1;
      repaint();
    }, 80);
    repaint();
  }

  const onSigint = (): void => {
    if (timer) clearInterval(timer);
    try {
      child.kill('SIGTERM');
    } catch {
      // child already gone
    }
    process.exit(130);
  };
  process.on('SIGINT', onSigint);

  try {
    const status = await new Promise<number | null>((resolve) => {
      child.once('close', (code) => resolve(typeof code === 'number' ? code : null));
      child.once('error', (error: Error) => {
        output += `${error.message}\n`;
        resolve(-1);
      });
    });

    const ok = status === 0;
    const seconds = (Date.now() - startedAt) / 1000;

    if (ok) {
      // Reconcile: bun reported most packages on the stream; npm reported
      // none. The installed package.json is the ground truth for both.
      for (const [name, version] of versions) {
        if (version === null) {
          const resolved = installedVersion(root, name);
          if (resolved !== null) versions.set(name, resolved);
        }
      }
      for (const [name, version] of [...versions]) {
        if (version === null) versions.delete(name); // never fabricate a version
      }
    }

    const total = parseInstallTotal(output);
    const finalLines: string[] = [];
    if (ok) {
      const count = total !== null ? `${total} packages` : `${versions.size} packages`;
      finalLines.push(
        `  ${style.green(symbol.ok)} ${style.bold(`Installed ${count} with ${tool}`)} ${style.gray(`in ${seconds.toFixed(1)}s`)}`,
        ...rows()
      );
    } else {
      const tail = output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(-3);
      finalLines.push(
        `  ${style.red(symbol.fail)} ${style.bold(`Install failed with ${tool}`)}`,
        `    ${style.gray('→ run it manually: bun install (or: npm install)')}`,
        ...tail.map((line) => `    ${style.gray(line.length > 76 ? `${line.slice(0, 75)}…` : line)}`)
      );
    }

    if (interactive) block.render(finalLines);
    else for (const line of finalLines) console.log(line);

    return {
      ok,
      tool,
      total,
      seconds,
      direct: [...versions].map(([name, version]) => ({ name, version })),
      output: output.trim(),
    };
  } finally {
    if (timer) clearInterval(timer);
    process.off('SIGINT', onSigint);
  }
}
