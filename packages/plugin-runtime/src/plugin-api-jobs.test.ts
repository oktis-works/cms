// @oktis-works/plugin-runtime - PluginAPI: api.jobs (cron/fila por plugin)
//
// Item 3 do plugin-parity-plan (paridade WP-Cron / Action Scheduler). Cobre:
//   - handlers via jobs.on (visible in getLoadedPluginJobHandlers for the worker);
//   - schedule with a valid spec (exactly one of every | cron);
//   - jobs:schedule permission;
//   - teto de agendas por plugin;
//   - agenda declarativa no manifesto (scheduleJobs[] v2);
//   - enqueue/cancel;
//   - degradation without a backend (returns false, never throws).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins, getLoadedPluginJobHandlers } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import type { PluginApiDependencies } from './plugin-api.js';

let pluginsDir: string;
let registry: HookRegistry;

function writePlugin(
  name: string,
  registerJs: string,
  manifest?: Record<string, unknown>
): void {
  const dir = join(pluginsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest })
  );
  writeFileSync(join(dir, 'index.js'), registerJs);
}

function sqlWith(rows: unknown[]) {
  return { unsafe: vi.fn(async (_text: string, _params?: unknown[]) => rows) };
}

function createMockDeps(jobs?: PluginApiDependencies['jobs']) {
  return {
    hooks: {
      addAction: vi.fn(),
      addFilter: vi.fn(),
      removeAction: vi.fn(() => false),
      removeFilter: vi.fn(() => false),
      hasAction: vi.fn(() => false),
      hasFilter: vi.fn(() => false),
      didAction: vi.fn(() => 0),
      getCurrentHook: vi.fn(() => null),
    },
    manifest: { name: 'jobs-plugin', version: '1.0.0' } as any,
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    getUserById: vi.fn(async (id: string) => ({ id, email: 't@t.c', name: 'U', roles: ['ADMIN'] })),
    registerRoutes: vi.fn(),
    registerContentFields: vi.fn(),
    registerFieldTypes: vi.fn(),
    jobs,
  } satisfies Partial<PluginApiDependencies>;
}

function createMockJobs() {
  return {
    schedule: vi.fn(async () => true),
    cancel: vi.fn(async () => true),
    enqueue: vi.fn(async () => true),
  };
}

const JOBS_PERM = ['jobs:schedule'];
const TENANT_SCOPE = 'tenant:tenant-abc';

async function bootstrap(
  deps: Partial<PluginApiDependencies>,
  options?: { policy?: string[] }
) {
  return bootstrapPlugins({
    pluginsDir,
    sql: sqlWith([{ name: 'jobs-plugin' }]),
    registry,
    tenantId: 'tenant-abc',
    permissionPolicy: options?.policy ?? [...JOBS_PERM],
    apiDeps: deps,
  });
}

beforeEach(() => {
  pluginsDir = mkdtempSync(join(tmpdir(), 'bl-jobs-'));
  registry = new HookRegistry();
  registry.setDevMode(false);
  resetLoadedPlugins(registry);
});

afterEach(() => {
  resetLoadedPlugins(registry);
  rmSync(pluginsDir, { recursive: true, force: true });
});

describe('api.jobs (Item 3)', () => {
  it('registers job handlers via jobs.on and exposes them to the worker dispatch', async () => {
    const jobs = createMockJobs();
    writePlugin(
      'jobs-plugin',
      `
        export default {
          async register(api) {
            api.jobs.on('daily-sync', async () => { /* work */ });
          }
        };
      `,
      { permissions: JOBS_PERM }
    );

    const result = await bootstrap(createMockDeps(jobs));
    expect(result.failed).toEqual([]);

    const entries = getLoadedPluginJobHandlers(TENANT_SCOPE);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.pluginName).toBe('jobs-plugin');
    expect(entries[0]!.handlers.has('daily-sync')).toBe(true);
  });

  it('schedules recurring jobs (every and cron) through the queue backend', async () => {
    const jobs = createMockJobs();
    writePlugin(
      'jobs-plugin',
      `
        export default {
          async register(api) {
            await api.jobs.schedule('hourly', { every: 3600000 });
            await api.jobs.schedule('nightly', { cron: '0 3 * * *' });
            await api.jobs.enqueue('kick', { reason: 'manual' });
          }
        };
      `,
      { permissions: JOBS_PERM }
    );

    const result = await bootstrap(createMockDeps(jobs));
    expect(result.failed).toEqual([]);

    expect(jobs.schedule).toHaveBeenCalledTimes(2);
    expect(jobs.schedule).toHaveBeenNthCalledWith(1, 'hourly', { every: 3600000 }, { pluginName: 'jobs-plugin', tenantId: 'tenant-abc' });
    expect(jobs.schedule).toHaveBeenNthCalledWith(2, 'nightly', { cron: '0 3 * * *' }, { pluginName: 'jobs-plugin', tenantId: 'tenant-abc' });
    expect(jobs.enqueue).toHaveBeenCalledWith('kick', { reason: 'manual' }, { pluginName: 'jobs-plugin', tenantId: 'tenant-abc' });
  });

  it('rejects schedule without jobs:schedule (isolated failure)', async () => {
    const jobs = createMockJobs();
    writePlugin(
      'jobs-plugin',
      `
        export default {
          async register(api) {
            await api.jobs.schedule('hourly', { every: 1000 });
          }
        };
      `,
      { permissions: [] }
    );

    const result = await bootstrap(createMockDeps(jobs), { policy: [] });
    expect(result.failed[0]!.error).toContain('Plugin permission denied: jobs:schedule');
    expect(jobs.schedule).not.toHaveBeenCalled();
  });

  it('rejects invalid specs (both or neither of every/cron)', async () => {
    const jobs = createMockJobs();
    writePlugin(
      'jobs-plugin',
      `
        export default {
          async register(api) {
            await api.jobs.schedule('bad', { every: 1000, cron: '* * * * *' });
          }
        };
      `,
      { permissions: JOBS_PERM }
    );

    const result = await bootstrap(createMockDeps(jobs));
    expect(result.failed[0]!.error).toContain('exactly one of: every | cron');
    expect(jobs.schedule).not.toHaveBeenCalled();
  });

  it('enforces the 10-schedule-per-plugin cap but allows re-scheduling', async () => {
    const jobs = createMockJobs();
    let registerJs = `export default { async register(api) {\n`;
    for (let i = 0; i < 10; i += 1) {
      registerJs += `  await api.jobs.schedule('job${i}', { every: ${1000 + i} });\n`;
    }
    // re-scheduling an existing name is always allowed (does not count toward the ceiling)
    registerJs += `  await api.jobs.schedule('job0', { every: 2000 });\n`;
    // 11º nome distinto estoura o teto
    registerJs += `  await api.jobs.schedule('job10', { every: 3000 });\n`;
    registerJs += `} };`;
    writePlugin('jobs-plugin', registerJs, { permissions: JOBS_PERM });

    const result = await bootstrap(createMockDeps(jobs));
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.error).toContain('Job schedule limit reached (10 per plugin)');
    expect(jobs.schedule).toHaveBeenCalledTimes(11); // 10 novas + re-schedule de job0
  });

  it('schedules jobs declared in the manifest (v2 declarative path)', async () => {
    const jobs = createMockJobs();
    writePlugin(
      'jobs-plugin',
      `export default { async register() {} };`,
      {
        permissions: JOBS_PERM,
        scheduleJobs: [
          { name: 'cleanup', every: 3600000 },
          { name: 'report', cron: '0 6 * * 1' },
        ],
      }
    );

    const result = await bootstrap(createMockDeps(jobs));
    expect(result.failed).toEqual([]);
    expect(jobs.schedule).toHaveBeenCalledTimes(2);
    expect(jobs.schedule).toHaveBeenNthCalledWith(1, 'cleanup', { every: 3600000 }, { pluginName: 'jobs-plugin', tenantId: 'tenant-abc' });
    expect(jobs.schedule).toHaveBeenNthCalledWith(2, 'report', { cron: '0 6 * * 1' }, { pluginName: 'jobs-plugin', tenantId: 'tenant-abc' });
  });

  it('cancel removes a schedule through the backend', async () => {
    const jobs = createMockJobs();
    writePlugin(
      'jobs-plugin',
      `
        export default {
          async register(api) {
            await api.jobs.schedule('temp', { every: 5000 });
            await api.jobs.cancel('temp');
          }
        };
      `,
      { permissions: JOBS_PERM }
    );

    const result = await bootstrap(createMockDeps(jobs));
    expect(result.failed).toEqual([]);
    expect(jobs.cancel).toHaveBeenCalledWith('temp', { pluginName: 'jobs-plugin', tenantId: 'tenant-abc' });
  });

  it('degrades to false (never throws) when no queue backend is wired', async () => {
    writePlugin(
      'jobs-plugin',
      `
        export default {
          async register(api) {
            const scheduled = await api.jobs.schedule('x', { every: 1000 });
            const enqueued = await api.jobs.enqueue('x', {});
            const cancelled = await api.jobs.cancel('x');
            if (scheduled !== false || enqueued !== false || cancelled !== false) {
              throw new Error('expected degraded false without backend');
            }
          }
        };
      `,
      { permissions: JOBS_PERM }
    );

    const result = await bootstrap(createMockDeps(undefined));
    expect(result.failed).toEqual([]);
  });
});
