// @oktis-works/api - rotas /metrics e /audit-logs

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@oktis-works/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oktis-works/core')>();
  return {
    ...actual,
    auditService: { list: vi.fn(async () => [{ action: 'plugin.install' }]) },
  };
});

import metricsRouter from './index.js';
import auditLogsRouter from '../audit-logs/index.js';
import { metrics } from '@oktis-works/core';

beforeEach(() => metrics.reset());

describe('GET /api/v1/metrics', () => {
  it('retorna formato Prometheus por padrão', async () => {
    metrics.inc('deployments.total', { status: 'active' });
    metrics.gauge('deployment.progress', 100, { deploymentId: 'd1' });

    const res = await metricsRouter.request('/');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('# TYPE deployments.total counter');
    expect(body).toContain('deployments.total{status="active"} 1');
    expect(body).toContain('deployment.progress{deploymentId="d1"} 100');
  });

  it('?format=json retorna snapshot estruturado', async () => {
    metrics.inc('x.y');

    const res = await metricsRouter.request('/?format=json');
    const body = (await res.json()) as { counters: { name: string; value: number }[] };

    expect(res.status).toBe(200);
    expect(body.counters[0]).toMatchObject({ name: 'x.y', value: 1 });
  });

  it('escapa aspas em labels no formato Prometheus', async () => {
    metrics.inc('events.consumed', { type: 'say "hi"' });

    const body = await (await metricsRouter.request('/')).text();
    expect(body).toContain('type="say \\"hi\\""');
  });
});

describe('GET /api/v1/audit-logs', () => {
  it('repassa filtros de query ao AuditService.list', async () => {
    const res = await auditLogsRouter.request('/?tenantId=t1&resourceType=plugin&action=plugin.install&limit=25');
    const body = (await res.json()) as { count: number };

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(vi.mocked((await import('@oktis-works/core')).auditService.list).mock.calls.at(-1)?.[0]).toEqual({
      tenantId: 't1',
      resourceType: 'plugin',
      action: 'plugin.install',
      userId: undefined,
      limit: 25,
    });
  });

  it('limit inválido usa default 100', async () => {
    await auditLogsRouter.request('/?limit=abc');

    expect(vi.mocked((await import('@oktis-works/core')).auditService.list).mock.calls.at(-1)?.[0]).toMatchObject({
      limit: 100,
    });
  });
});
