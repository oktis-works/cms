// @oktis-works/core - Bootstrap retry (core-bootstrap-002)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const connectionAttempts: number[] = [];

vi.mock('@oktis-works/database', () => ({
  createConnection: vi.fn(async () => {
    connectionAttempts.push(1);
    if (connectionAttempts.length < 3) throw new Error('ECONNREFUSED');
    return {} as never;
  }),
  closeConnection: vi.fn(async () => undefined),
  clearTenantContext: vi.fn(async () => undefined),
  getCache: vi.fn(() => ({ disconnect: vi.fn(async () => undefined) })),
  getEventBus: vi.fn(() => ({ emit: vi.fn(async () => undefined), subscribe: vi.fn() })),
}));
vi.mock('@oktis-works/config', () => ({
  loadConfig: vi.fn(() => ({
    database: { url: 'postgres://x', retries: 3 },
    cache: { driver: 'memory' },
    server: { port: 3000 },
    logging: { level: 'info' },
  })),
}));

import { ApplicationLifecycle } from './index.js';

beforeEach(() => {
  connectionAttempts.length = 0;
});

describe('ApplicationLifecycle.start — retry de conexão', () => {
  it('tenta novamente em falha transitiva e inicia após recuperar', async () => {
    const lifecycle = new ApplicationLifecycle({
      database: { url: 'postgres://x', retries: 3 },
      cache: { driver: 'memory' },
      server: { port: 3000 },
      logging: { level: 'info' },
    } as never);

    await lifecycle.start();

    expect(connectionAttempts).toHaveLength(3);
    expect(lifecycle.isStarted()).toBe(true);
    await lifecycle.stop();
  });
});
