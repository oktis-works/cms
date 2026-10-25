import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type UpdateStep = 'scan' | 'packages' | 'migrations' | 'deploy';
export type UpdateStepStatus = 'running' | 'completed' | 'failed';

export interface UpdateProgress {
  runId: string;
  startedAt: string;
  updatedAt: string;
  steps: Partial<Record<UpdateStep, { status: UpdateStepStatus; error?: string; updatedAt: string }>>;
}

function progressPath(cwd: string): string {
  return join(cwd, '.deploy', 'update-progress.json');
}

export function readUpdateProgress(cwd: string): UpdateProgress | null {
  const path = progressPath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as UpdateProgress;
  } catch {
    return null;
  }
}

export function beginUpdateProgress(cwd: string, runId = `${Date.now()}-${process.pid}`): UpdateProgress {
  const now = new Date().toISOString();
  const current: UpdateProgress = { runId, startedAt: now, updatedAt: now, steps: {} };
  persist(cwd, current);
  return current;
}

export function recordUpdateStep(
  cwd: string,
  step: UpdateStep,
  status: UpdateStepStatus,
  error?: string
): UpdateProgress {
  const current = readUpdateProgress(cwd) ?? beginUpdateProgress(cwd);
  const updatedAt = new Date().toISOString();
  current.updatedAt = updatedAt;
  current.steps[step] = error ? { status, error, updatedAt } : { status, updatedAt };
  persist(cwd, current);
  return current;
}

function persist(cwd: string, progress: UpdateProgress): void {
  mkdirSync(join(cwd, '.deploy'), { recursive: true });
  writeFileSync(progressPath(cwd), `${JSON.stringify(progress, null, 2)}\n`, 'utf-8');
}
