import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beginUpdateProgress, readUpdateProgress, recordUpdateStep } from './update-progress.js';

describe('update progress journal', () => {
  it('records step state and survives a retry after an interrupted run', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'okcms-update-progress-'));
    beginUpdateProgress(cwd, 'run-1');
    recordUpdateStep(cwd, 'packages', 'running');
    recordUpdateStep(cwd, 'packages', 'failed', 'network timeout');
    recordUpdateStep(cwd, 'packages', 'completed');
    const progress = readUpdateProgress(cwd);
    expect(progress?.runId).toBe('run-1');
    expect(progress?.steps.packages).toMatchObject({ status: 'completed' });
    rmSync(cwd, { recursive: true, force: true });
  });
});
