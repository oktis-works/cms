// @oktis-works/cms - Runtime State (pidfile dos apps iniciados por `start`)

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface PidEntry {
  label: string;
  pid: number;
  startedAt: string;
}

export interface ProcessStatus extends PidEntry {
  alive: boolean;
}

function stateDir(cwd = process.cwd()): string {
  return join(cwd, '.okcms');
}

function pidsFile(cwd = process.cwd()): string {
  return join(stateDir(cwd), 'pids.json');
}

export function readPids(cwd = process.cwd()): PidEntry[] {
  const file = pidsFile(cwd);
  if (!existsSync(file)) return [];

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as PidEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePids(entries: PidEntry[], cwd = process.cwd()): void {
  mkdirSync(stateDir(cwd), { recursive: true });
  writeFileSync(pidsFile(cwd), JSON.stringify(entries, null, 2));
}

export function recordPid(label: string, pid: number, cwd = process.cwd()): void {
  if (!Number.isFinite(pid) || pid <= 1) return;
  const entries = readPids(cwd).filter((entry) => entry.label !== label);
  entries.push({ label, pid, startedAt: new Date().toISOString() });
  writePids(entries, cwd);
}

export function clearPids(cwd = process.cwd()): void {
  const file = pidsFile(cwd);
  if (existsSync(file)) rmSync(file);
}

export function isAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 1) return false;
  try {
    // sinal 0 não mata: apenas verifica permissão/existência do processo
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    return code === 'EPERM';
  }
}

export function statusAll(cwd = process.cwd()): ProcessStatus[] {
  return readPids(cwd).map((entry) => ({ ...entry, alive: isAlive(entry.pid) }));
}

export function stopAll(
  signal: NodeJS.Signals = 'SIGTERM',
  cwd = process.cwd()
): Array<{ label: string; pid: number; stopped: boolean }> {
  return statusAll(cwd).map(({ label, pid, alive }) => {
    if (!alive) return { label, pid, stopped: false };

    try {
      process.kill(pid, signal);
      return { label, pid, stopped: true };
    } catch {
      return { label, pid, stopped: false };
    }
  });
}

/** Fallback para ambientes sem pidfile: localiza processos filhos conhecidos. */
export function findRunningApps(): Array<{ label: string; pid: number }> {
  const found: Array<{ label: string; pid: number }> = [];
  const patterns: Array<{ label: string; match: string }> = [
    { label: 'api', match: '@oktis-works/api' },
    { label: 'admin', match: '@oktis-works/admin' },
    { label: 'web', match: '@oktis-works/web' },
  ];

  try {
    const result = spawnSync('ps', ['-eo', 'pid,args'], { encoding: 'utf-8' });
    const output = result.stdout ?? '';

    for (const line of output.split('\n')) {
      for (const pattern of patterns) {
        if (!line.includes(pattern.match)) continue;

        const pid = Number.parseInt(line.trim().split(/\s+/)[0] ?? '', 10);
        const selfPid = process.pid;

        if (Number.isFinite(pid) && pid > 1 && pid !== selfPid && !found.some((entry) => entry.pid === pid)) {
          found.push({ label: pattern.label, pid });
        }
      }
    }
  } catch {
    // ps indisponível: retorna vazio
  }

  return found;
}
