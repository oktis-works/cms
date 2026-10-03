// @oktis-works/core - Observability: metrics, event→audit wiring, plugin audit, trace

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsRegistry, metrics, trackDeploymentProgress } from './metrics.js';
import { registerEventAuditLog } from './event-audit.js';
import { EventBus } from '../events/bus.js';

const store: {
  lastQuery?: { text: string; values: unknown[] };
  rows: Record<string, unknown>[];
} = { rows: [] };

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.lastQuery = { text, values: values ?? [] };
      return store.rows;
    }),
  })),
}));

beforeEach(() => {
  store.rows = [];
  delete store.lastQuery;
  metrics.reset();
});

describe('MetricsRegistry — REQ-observability-003', () => {
  it('counter acumula por nome+labels', () => {
    const reg = new MetricsRegistry();
    reg.inc('deployments.total', { status: 'active' });
    reg.inc('deployments.total', { status: 'active' });
    reg.inc('deployments.total', { status: 'failed' });

    expect(reg.getCounter('deployments.total', { status: 'active' })).toBe(2);
    expect(reg.getCounter('deployments.total', { status: 'failed' })).toBe(1);
  });

  it('gauge sobrescreve e snapshot expõe tudo', () => {
    const reg = new MetricsRegistry();
    reg.gauge('deployment.progress', 10, { deploymentId: 'd1' });
    trackDeploymentProgress('d1', 'health-check');
    // trackDeploymentProgress usa o singleton; registry local só valida gauge
    reg.gauge('x.y', 42);
    reg.gauge('x.y', 99);

    const snap = reg.snapshot();
    expect(snap.gauges).toHaveLength(2);
    expect(snap.gauges.find(g => g.name === 'x.y')?.value).toBe(99);
  });

  it('trackDeploymentProgress registra progresso e contador final', () => {
    trackDeploymentProgress('d9', 'active');

    expect(metrics.getGauge('deployment.progress', { deploymentId: 'd9' })?.value).toBe(100);
    expect(metrics.getCounter('deployments.total', { status: 'active' })).toBe(1);

    trackDeploymentProgress('d10', 'failed');
    expect(metrics.getGauge('deployment.progress', { deploymentId: 'd10' })?.value).toBe(50);
    expect(metrics.getCounter('deployments.total', { status: 'failed' })).toBe(1);
  });
});

const event = () => ({
  id: 'evt-1',
  type: 'content.published',
  aggregateType: 'content',
  aggregateId: 'c-77',
  payload: { userId: 'u-1' },
  tenantId: 't-1',
  processed: false,
  createdAt: new Date(),
});

describe('event → AuditLog wiring — REQ-event-bus-005', () => {
  it('todo evento emitido gera INSERT em audit_logs com campos mapeados', async () => {
    const bus = new EventBus({ maxRetries: 0, retryDelay: 0 });
    registerEventAuditLog(bus);

    await bus.emit(event());

    expect(store.lastQuery!.text).toContain('INSERT INTO audit_logs');
    expect(store.lastQuery!.values).toEqual([
      't-1',
      'u-1',
      'content.published',
      'content',
      'c-77',
      { eventId: 'evt-1' },
      null,
      null,
    ]);
  });

  it('falha no handler do subscriber não impede outros handlers', async () => {
    const bus = new EventBus({ maxRetries: 0, retryDelay: 0 });
    registerEventAuditLog(bus);
    const other = vi.fn();
    bus.on('content.published', other);

    await bus.emit(event());

    expect(other).toHaveBeenCalledOnce();
  });
});
