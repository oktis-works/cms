// @oktis-works/plugin-runtime - ContentQueryBuilder (Item 22) + lazy field types (Item 25)

import { describe, it, expect } from 'vitest';
import { ContentQueryBuilder } from './content-query.js';

const builder = (execute: (sql: string, params?: unknown[]) => Promise<unknown[]>) =>
  new ContentQueryBuilder(execute);

describe('ContentQueryBuilder (Item 22)', () => {
  it('builds a parameterized query from declarative filters', async () => {
    const rows = [{ id: '1' }];
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const result = await builder(async (sql, params) => {
      seen.push({ sql, params: params ?? [] });
      return rows;
    })
      .where('type', 'eq', 'post')
      .where('status', 'neq', 'TRASHED')
      .orderBy('created_at', 'desc')
      .limit(10)
      .offset(5)
      .execute();

    expect(result).toEqual(rows);
    const { sql, params } = seen[0]!;
    expect(sql).toBe('SELECT * FROM content WHERE type = $1 AND status <> $2 ORDER BY created_at DESC LIMIT 10 OFFSET 5');
    expect(params).toEqual(['post', 'TRASHED']);
  });

  it('supports like and whereIn with parameterized values', () => {
    const { sql, params } = builder(async () => [])
      .where('title', 'like', '%guide%')
      .whereIn('status', ['PUBLISHED', 'DRAFT'])
      .build();

    expect(sql).toContain('title ILIKE $1');
    expect(sql).toContain('status IN ($2, $3)');
    expect(params).toEqual(['%guide%', 'PUBLISHED', 'DRAFT']);
  });

  it('rejects non-allowlisted fields (SQL injection surface)', () => {
    expect(() => builder(async () => []).where('body', 'eq', 'x')).toThrow(/not queryable/);
    expect(() => builder(async () => []).where('id; DROP TABLE content', 'eq', 'x')).toThrow(/not queryable/);
    expect(() => builder(async () => []).orderBy('password_hash')).toThrow(/not orderable/);
  });

  it('rejects unknown operators and invalid pagination', () => {
    expect(() => builder(async () => []).where('id', 'raw' as never, 'x')).toThrow(/not supported/);
    expect(() => builder(async () => []).whereIn('status', [])).toThrow(/non-empty/);
    expect(() => builder(async () => []).limit(0)).toThrow(/limit/);
    expect(() => builder(async () => []).limit(500)).toThrow(/limit/);
    expect(() => builder(async () => []).offset(-1)).toThrow(/offset/);
  });
});
