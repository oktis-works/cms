// @oktis-works/core - CommentService tests (Item 11)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: { queries: Array<{ text: string; values: unknown[] }>; results: unknown[][] } = {
  queries: [],
  results: [],
};

const hooks = {
  filters: [] as Array<{ hook: string; value: unknown }>,
  actions: [] as Array<{ hook: string; payload: unknown; context: unknown }>,
  filterImpl: null as null | ((hook: string, value: unknown) => unknown),
};

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      return store.results.shift() ?? [];
    }),
  })),
}));

vi.mock('@oktis-works/plugin-runtime', () => ({
  getHookRegistry: vi.fn(() => ({
    applyFiltersAsync: vi.fn(async (hook: string, value: unknown) => {
      hooks.filters.push({ hook, value });
      return hooks.filterImpl ? hooks.filterImpl(hook, value) : value;
    }),
    doAction: vi.fn(async (hook: string, payload: unknown, context?: unknown) => {
      hooks.actions.push({ hook, payload, context });
    }),
  })),
}));

import { CommentService } from './service.js';

beforeEach(() => {
  store.queries = [];
  store.results = [];
  hooks.filters = [];
  hooks.actions = [];
  hooks.filterImpl = null;
});

const commentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-1',
  tenant_id: 't-1',
  content_id: 'post-1',
  parent_id: null,
  author_name: 'Ada',
  author_email: 'ada@example.com',
  author_url: null,
  author_id: null,
  body: 'Great post!',
  status: 'PENDING',
  ip_address: null,
  user_agent: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe('CommentService.create (Item 11)', () => {
  it('defaults to the PENDING moderation queue and fires comment hooks', async () => {
    const service = new CommentService();
    store.results = [[commentRow()]];

    const created = await service.create({ contentId: 'post-1', authorName: 'Ada', body: 'Great post!' });

    expect(created.status).toBe('PENDING');
    expect(hooks.filters[0]?.hook).toBe('comment:before_save');
    expect(hooks.actions.map((action) => action.hook)).toEqual(['comment:after_save']);
    const insert = store.queries.find((query) => query.text.includes('INSERT INTO comments'));
    expect(insert?.values[8]).toBe('PENDING');
  });

  it('lets an antispam filter flip the status to SPAM before persisting', async () => {
    const service = new CommentService();
    store.results = [[commentRow({ status: 'SPAM' })]];
    hooks.filterImpl = (_hook, value) => ({ ...(value as Record<string, unknown>), status: 'SPAM' });

    await service.create({ contentId: 'post-1', authorName: 'Bot', body: 'buy now' });

    const insert = store.queries.find((query) => query.text.includes('INSERT INTO comments'));
    expect(insert?.values[8]).toBe('SPAM');
    expect(hooks.actions[0]?.payload).toMatchObject({ status: 'SPAM' });
  });

  it('strips status overrides that are not moderation states', async () => {
    const service = new CommentService();
    store.results = [[commentRow()]];
    hooks.filterImpl = (_hook, value) => ({ ...(value as Record<string, unknown>), status: undefined });

    await service.create({ contentId: 'post-1', authorName: 'Ada', body: 'Hi' });
    expect(store.queries.find((query) => query.text.includes('INSERT INTO comments'))?.values[8]).toBe('PENDING');
  });
});

describe('CommentService.setStatus (Item 11)', () => {
  it('fires comment:approved only on transitions into APPROVED', async () => {
    const service = new CommentService();
    store.results = [[commentRow({ status: 'PENDING' })], [commentRow({ status: 'APPROVED' })]];

    const updated = await service.setStatus('c-1', 'APPROVED');

    expect(updated?.status).toBe('APPROVED');
    expect(hooks.actions.map((action) => action.hook)).toEqual(['comment:approved']);
    expect(hooks.actions[0]?.context).toMatchObject({ previousStatus: 'PENDING' });
  });

  it('fires comment:spammed on transitions into SPAM and nothing on no-op', async () => {
    const service = new CommentService();
    store.results = [[commentRow({ status: 'PENDING' })], [commentRow({ status: 'SPAM' })]];
    await service.setStatus('c-1', 'SPAM');
    expect(hooks.actions.map((action) => action.hook)).toEqual(['comment:spammed']);

    hooks.actions = [];
    store.results = [[commentRow({ status: 'SPAM' })], [commentRow({ status: 'SPAM' })]];
    await service.setStatus('c-1', 'SPAM');
    expect(hooks.actions).toEqual([]);
  });

  it('returns null for unknown comments', async () => {
    const service = new CommentService();
    store.results = [[]];
    await expect(service.setStatus('missing', 'APPROVED')).resolves.toBeNull();
  });
});

describe('CommentService.delete (Item 11)', () => {
  it('fires before/after hooks and deletes', async () => {
    const service = new CommentService();
    store.results = [[commentRow()], []];

    const deleted = await service.delete('c-1');

    expect(deleted).toBe(true);
    expect(hooks.actions.map((action) => action.hook)).toEqual(['comment:before_delete', 'comment:deleted']);
  });
});

describe('CommentService.list / countByStatus / meta', () => {
  it('applies moderation filters (status + search)', async () => {
    const service = new CommentService();
    store.results = [[commentRow()]];

    await service.list({ status: 'PENDING', search: 'great', limit: 10, offset: 5 });

    const select = store.queries[0];
    expect(select?.text).toContain('status = $1');
    expect(select?.text).toContain('ILIKE');
    expect(select?.values[0]).toBe('PENDING');
    expect(select?.values[1]).toBe('%great%');
  });

  it('counts comments per moderation status', async () => {
    const service = new CommentService();
    store.results = [[
      { status: 'PENDING', count: 3 },
      { status: 'APPROVED', count: 9 },
    ]];

    const counts = await service.countByStatus();

    expect(counts).toEqual({ PENDING: 3, APPROVED: 9, SPAM: 0, TRASHED: 0 });
  });

  it('upserts and reads meta (comment_meta)', async () => {
    const service = new CommentService();
    store.results = [[{ value: { score: 0.9 } }], [], []];

    const value = await service.getMeta('c-1', 'antispam');
    await service.setMeta('c-1', 'antispam', { score: 0.8 });
    await service.deleteMeta('c-1', 'antispam');

    expect(value).toEqual({ score: 0.9 });
    const upsert = store.queries.find((query) => query.text.includes('ON CONFLICT'));
    expect(upsert).toBeDefined();
  });
});
