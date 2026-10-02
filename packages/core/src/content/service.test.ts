// @oktis-works/core - Supports enforcement + Revisions (ContentService)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: {
  queries: { text: string; values: unknown[] }[];
  contentTypes: Record<string, unknown>[];
  rowsByCall: unknown[][];
  callIndex: number;
} = { queries: [], contentTypes: [], rowsByCall: [], callIndex: 0 };

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      if (text.includes('FROM content_types')) return store.contentTypes;
      const rows = store.rowsByCall[store.callIndex] ?? [];
      store.callIndex += 1;
      return rows;
    }),
  })),
}));

vi.mock('../events/bus.js', () => ({
  getEventBus: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
}));

vi.mock('../cache/index.js', () => ({
  getCache: vi.fn(() => ({ del: vi.fn(), get: vi.fn(), set: vi.fn() })),
}));

import { ContentService } from './service.js';

beforeEach(() => {
  store.queries = [];
  store.rowsByCall = [];
  store.callIndex = 0;
  store.contentTypes = [];
});

const contentTypeRow = (slug: string, supports: string[]) => ({
  id: 'ct-1',
  name: slug,
  slug,
  source: 'CORE',
  schema: JSON.stringify({ supports }),
  plural_label: slug,
  singular_label: slug,
});

const existingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'c-1',
  tenant_id: 't-1',
  type: 'post',
  title: 'Antigo',
  slug: 'antigo',
  body: { campo: 'v1' },
  excerpt: 'ex v1',
  featured_image_id: null,
  seo_title: null,
  seo_description: null,
  metadata: {},
  status: 'DRAFT',
  version: 2,
  author_id: 'u-1',
  ...overrides,
});

describe('supports enforcement — payload filtrado pelo tipo', () => {
  it('create descarta excerpt de CPT sem suporte excerpt', async () => {
    store.contentTypes = [contentTypeRow('evento', ['title', 'editor'])];
    store.rowsByCall.push([{ ...existingRow({ type: 'evento' }), version: 1 }]);

    await new ContentService().create({
      type: 'evento',
      title: 'Show',
      authorId: 'u-1',
      excerpt: 'deveria ser descartado',
      body: { local: 'SP' },
    } as never);

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO content'));
    expect(insert?.values[6]).toBeNull();
    expect(insert?.values[5]).toBe(JSON.stringify({ local: 'SP' }));
  });

  it('create mantém excerpt quando o tipo suporta (post core)', async () => {
    store.rowsByCall.push([{ ...existingRow() }]);

    await new ContentService().create({
      type: 'post',
      title: 'Post',
      authorId: 'u-1',
      excerpt: 'mantido',
    });

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO content'));
    expect(insert?.values[6]).toBe('mantido');
  });

  it('update descarta featuredImageId sem suporte thumbnail e não grava revision', async () => {
    store.contentTypes = [contentTypeRow('evento', ['title'])];
    store.rowsByCall.push([existingRow({ type: 'evento' })], [{ ...existingRow({ type: 'evento' }), version: 3 }]);

    await new ContentService().update('c-1', { featuredImageId: 'm-1', title: 'Nova' });

    const updateQuery = store.queries.find((q) => q.text.includes('UPDATE content SET'));
    expect(updateQuery?.text).not.toContain('featured_image_id');
    expect(updateQuery?.values).toContain('Nova');
    expect(store.queries.some((q) => q.text.includes('INSERT INTO content_versions'))).toBe(false);
  });
});

describe('revisions — gravação por supports e restore', () => {
  it('NÃO grava snapshot quando o tipo não suporta revisions', async () => {
    store.contentTypes = [contentTypeRow('evento', ['title', 'editor'])];
    store.rowsByCall.push([existingRow({ type: 'evento' })], [{ ...existingRow({ type: 'evento' }), version: 3 }]);

    await new ContentService().update('c-1', { title: 'Novo' });

    expect(store.queries.some((q) => q.text.includes('INSERT INTO content_versions'))).toBe(false);
  });

  it('grava snapshot completo do estado anterior quando suporta revisions', async () => {
    store.rowsByCall.push([existingRow()], [], [{ ...existingRow(), version: 3 }]);

    await new ContentService().update('c-1', { title: 'Novo' });

    const snap = store.queries.find((q) => q.text.includes('INSERT INTO content_versions'));
    expect(snap).toBeTruthy();
    expect(snap!.values[3]).toBe('Antigo');
    expect(snap!.values[2]).toBe(2);
    expect(snap!.values[6]).toBe('ex v1');
  });

  it('getRevisions retorna snapshots com aliases camelCase', async () => {
    store.rowsByCall.push([[{ id: 'r1', version: 2, title: 'Antigo' }]]);

    const revisions = await new ContentService().getRevisions('c-1');

    expect(store.queries[0]!.text).toContain('featured_image_id AS "featuredImageId"');
    expect(revisions).toHaveLength(1);
  });

  it('restoreRevision faz snapshot do atual, restaura campos e aceita id ou número', async () => {
    const revision = {
      id: 'rev-uuid',
      version: 1,
      title: 'Original',
      slug: 'original',
      body: { campo: 'v0' },
      excerpt: 'ex v0',
      featured_image_id: 'm-0',
      seo_title: 'seo v0',
      seo_description: 'desc v0',
      metadata: {},
    };
    store.rowsByCall.push(
      [existingRow()],
      [revision],
      [],
      [{ ...existingRow(), title: 'Original', slug: 'original', version: 3 }]
    );

    const restored = await new ContentService().restoreRevision('c-1', 'rev-uuid');

    const safety = store.queries.filter((q) => q.text.includes('INSERT INTO content_versions'));
    expect(safety).toHaveLength(1);
    expect(safety[0]!.values[3]).toBe('Antigo');

    const updateQuery = store.queries.find((q) => q.text.includes('WHERE id = $9'));
    expect(updateQuery!.values.slice(0, 7)).toEqual([
      'Original',
      'original',
      JSON.stringify({ campo: 'v0' }),
      'ex v0',
      'm-0',
      'seo v0',
      'desc v0',
    ]);
    expect(restored!.version).toBe(3);

    store.callIndex = 0;
    store.queries = [];
    store.rowsByCall = [[existingRow()], [], [{ id: 'rev-n', version: 1 }], [], [{ ...existingRow() }]];
    const byNumber = await new ContentService().restoreRevision('c-1', '1');
    expect(byNumber).not.toBeNull();
    expect(store.queries.some((q) => q.values?.includes(1))).toBe(true);
  });

  it('restoreRevision retorna null para revision inexistente', async () => {
    store.rowsByCall.push([existingRow()], []);

    const result = await new ContentService().restoreRevision('c-1', 'nope');

    expect(result).toBeNull();
    expect(store.queries.some((q) => q.text.includes('UPDATE content SET'))).toBe(false);
  });
});
