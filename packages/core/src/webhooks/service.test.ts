// @oktis-works/core - WebhookSecretService tests (Item 19)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: { queries: Array<{ text: string; values: unknown[] }>; results: unknown[][] } = {
  queries: [],
  results: [],
};

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      return store.results.shift() ?? [];
    }),
  })),
}));

import { WebhookSecretService } from './service.js';

beforeEach(() => {
  store.queries = [];
  store.results = [];
});

describe('WebhookSecretService.rotate (Item 19)', () => {
  it('creates the next version, deactivates the previous and returns the secret once', async () => {
    const service = new WebhookSecretService();
    store.results = [
      [{ id: 'w-1' }], // webhook exists
      [{ max_version: 2 }], // current max version
      [], // deactivate previous
      [], // insert new
    ];

    const rotated = await service.rotate('w-1');

    expect(rotated?.version).toBe(3);
    expect(rotated?.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(rotated?.isActive).toBe(true);

    const deactivate = store.queries.find((query) => query.text.includes('is_active = false'));
    expect(deactivate?.values[0]).toBe('w-1');
    const insert = store.queries.find((query) => query.text.includes('INSERT INTO webhook_secrets'));
    expect(insert?.values[3]).toBe(3);
    // listing versions never includes the secret column
    expect(store.queries.every((query) => !query.text.includes('SELECT secret') || query.text.includes('SELECT secret, version'))).toBe(true);
  });

  it('starts at version 1 when the webhook has no secrets yet', async () => {
    const service = new WebhookSecretService();
    store.results = [[{ id: 'w-1' }], [{ max_version: 0 }], [], []];

    const rotated = await service.rotate('w-1');
    expect(rotated?.version).toBe(1);
  });

  it('returns null for unknown webhooks', async () => {
    const service = new WebhookSecretService();
    store.results = [[]];
    await expect(service.rotate('missing')).resolves.toBeNull();
  });
});

describe('WebhookSecretService.listVersions / getActiveSecret', () => {
  it('lists version history without secret values', async () => {
    const service = new WebhookSecretService();
    store.results = [[
      { id: 's2', webhook_id: 'w-1', version: 2, is_active: true, rotated_at: null, created_at: new Date() },
      { id: 's1', webhook_id: 'w-1', version: 1, is_active: false, rotated_at: new Date(), created_at: new Date() },
    ]];

    const versions = await service.listVersions('w-1');

    expect(versions).toHaveLength(2);
    expect('secret' in versions[0]!).toBe(false);
  });

  it('returns the newest active secret with its version', async () => {
    const service = new WebhookSecretService();
    store.results = [[{ secret: 'abc', version: 3 }]];

    const active = await service.getActiveSecret('w-1');
    expect(active).toEqual({ secret: 'abc', version: 3 });
  });
});

describe('WebhookSecretService.recordDeadLetter (Item 19)', () => {
  it('inserts one dead-letter row per failed delivery', async () => {
    const service = new WebhookSecretService();
    store.results = [[]];

    await service.recordDeadLetter('w-1', 'content.published', { id: 'p1' }, 'ECONNREFUSED');

    const insert = store.queries.find((query) => query.text.includes('INSERT INTO webhook_dead_letters'));
    expect(insert?.values[1]).toBe('content.published');
    expect(insert?.values[3]).toBe('ECONNREFUSED');
  });
});
