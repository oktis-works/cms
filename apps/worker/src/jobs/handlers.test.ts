const deploymentStore: { queries: { text: string; values?: unknown[] }[] } = { queries: [] };

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      deploymentStore.queries.push({ text, values });
      if (text.includes('SELECT d.id FROM deployments')) return [{ id: 'prev-uuid' }];
      return [];
    }),
  })),
}));

// @oktis-works/worker - Build Pipeline Tests (RULE-docker-layer-optimization, RULE-build-immutability)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { generateDockerfile, computeBuildChecksum, deploymentCreateHandler } from './handlers.js';

describe('generateDockerfile — RULE-docker-layer-optimization', () => {
  const dockerfile = generateDockerfile(
    { seo: '1.0.0', analytics: '2.1.0' },
    { 'theme-loja': '0.3.0' }
  );

  it('ordena camadas: runtime → core deps → core → plugin deps → plugins → theme deps → theme', () => {
    const idx = (needle: string) => dockerfile.indexOf(needle);
    expect(idx('# ── 1/5 core dependencies')).toBeGreaterThan(idx('FROM oven/bun:1-alpine'));
    expect(idx('COPY packages/core/dist')).toBeGreaterThan(idx('# ── 1/5 core dependencies'));
    expect(idx('# ── 2/5 plugin dependencies')).toBeGreaterThan(idx('COPY packages/core/dist'));
    expect(idx('# ── 3/5 plugins ──')).toBeGreaterThan(idx('# ── 2/5 plugin dependencies'));
    expect(idx('# ── 4/5 theme dependencies')).toBeGreaterThan(idx('# ── 3/5 plugins ──'));
    expect(idx('# ── 5/5 theme')).toBeGreaterThan(idx('# ── 4/5 theme dependencies'));
  });

  it('copia plugins em ordem determinística (alfabética)', () => {
    const analytics = dockerfile.indexOf('COPY plugins/analytics ./plugins/analytics');
    const seo = dockerfile.indexOf('COPY plugins/seo ./plugins/seo');
    expect(analytics).toBeGreaterThan(-1);
    expect(seo).toBeGreaterThan(analytics);
  });

  it('sem plugins/theme, gera apenas runtime+core', () => {
    const minimal = generateDockerfile({}, {});
    expect(minimal).not.toContain('plugins/');
    expect(minimal).not.toContain('themes/');
    expect(minimal).toContain('EXPOSE 3000');
  });

  it('é determinística para a mesma entrada (base do cache)', () => {
    expect(generateDockerfile({ a: '1' }, {})).toBe(generateDockerfile({ a: '1' }, {}));
  });
});

describe('computeBuildChecksum — RULE-build-immutability', () => {
  it('gera sha256 determinístico e sensível ao conteúdo', () => {
    const df = generateDockerfile({ a: '1' }, {});
    expect(computeBuildChecksum(df)).toBe(createHash('sha256').update(df).digest('hex'));
    expect(computeBuildChecksum(df)).toHaveLength(64);
    expect(computeBuildChecksum(df + '\n# x')).not.toBe(computeBuildChecksum(df));
  });
});

describe('deploymentCreateHandler — RULE-health-check-protocol', () => {
  beforeEach(() => {
    deploymentStore.queries = [];
    delete process.env['HEALTH_CHECK_URL'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('health OK → deployment ACTIVE/HEALTHY', async () => {
    process.env['HEALTH_CHECK_URL'] = 'http://app:3000/ready';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    const result = await deploymentCreateHandler({
      id: 'j1', type: 'deployment.create', payload: { deploymentId: 'd1', buildId: 'b1' },
      tenantId: 't1', createdAt: new Date(),
    });

    expect(result.success).toBe(true);
    const final = deploymentStore.queries.find(q => q.text.includes("status = 'ACTIVE'"));
    expect(final?.values).toEqual(['d1']);
  });

  it('health falha após retries → FAILED + rollback automático do anterior', async () => {
    process.env['HEALTH_CHECK_URL'] = 'http://app:3000/ready';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('conn refused'); }));
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
      cb(); return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as never);

    const result = await deploymentCreateHandler({
      id: 'j2', type: 'deployment.create', payload: { deploymentId: 'd2', buildId: 'b2' },
      tenantId: 't1', createdAt: new Date(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('health check failed');
    expect(fetch).toHaveBeenCalledTimes(3);
    const failed = deploymentStore.queries.find(q => q.text.includes("'FAILED'") && q.text.includes("health_check_status = 'FAILED'"));
    expect(failed?.values?.[0]).toContain('Health check failed');
    const rollback = deploymentStore.queries.find(q => q.text.includes("SET status = 'ACTIVE' WHERE id = $1"));
    expect(rollback?.values).toEqual(['prev-uuid']);
  });
});
