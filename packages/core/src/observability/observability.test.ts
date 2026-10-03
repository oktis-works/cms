// @oktis-works/core - Observability Tests (REQ-observability)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from './logger.js';
import { AuditService } from './audit.js';

const store: { lastQuery?: { text: string; values: unknown[] }; rows: Record<string, unknown>[] } = { rows: [] };

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.lastQuery = { text, values: values ?? [] };
      return store.rows;
    }),
  })),
}));


describe('createLogger — JSON estruturado', () => {
  it('emite linha JSON com time/level/msg/bindings', () => {
    const lines: string[] = [];
    const log = createLogger({ component: 'test' }, { minLevel: 'debug', sink: (l) => lines.push(l) });

    log.info('conteúdo salvo', { contentId: 'c1' });

    const entry = JSON.parse(lines[0]!);
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('conteúdo salvo');
    expect(entry.component).toBe('test');
    expect(entry.contentId).toBe('c1');
    expect(typeof entry.time).toBe('string');
  });

  it('respeita minLevel', () => {
    const lines: string[] = [];
    const log = createLogger({}, { minLevel: 'warn', sink: (l) => lines.push(l) });

    log.debug('x');
    log.info('y');
    log.warn('z');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).level).toBe('warn');
  });

  it('redige campos sensíveis recursivamente e serializa Errors', () => {
    const lines: string[] = [];
    const log = createLogger({}, { sink: (l) => lines.push(l) });

    log.error('falhou', {
      password: 'abc',
      auth: { token: 't', ok: 1 },
      err: new Error('boom'),
    });

    const entry = JSON.parse(lines[0]!);
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.auth.token).toBe('[REDACTED]');
    expect(entry.auth.ok).toBe(1);
    expect(entry.err.message).toBe('boom');
  });

  it('child acumula bindings sem mutar o pai', () => {
    const lines: string[] = [];
    const parent = createLogger({ a: 1 }, { sink: (l) => lines.push(l) });
    const child = parent.child({ b: 2 });

    child.info('oi');
    parent.info('pai');

    expect(JSON.parse(lines[0]!)).toMatchObject({ a: 1, b: 2 });
    expect(JSON.parse(lines[1]!).b).toBeUndefined();
  });
});

describe('AuditService', () => {
  beforeEach(() => {
    store.rows = [];
    delete store.lastQuery;
  });

  it('record faz INSERT append-only com campos completos', async () => {
    await new AuditService().record({
      tenantId: 't1',
      userId: 'u1',
      action: 'content.publish',
      resourceType: 'content',
      resourceId: 'c-uuid',
      changes: { status: 'PUBLISHED' },
      ipAddress: '10.0.0.1',
    });

    expect(store.lastQuery!.text).toContain('INSERT INTO audit_logs');
    expect(store.lastQuery!.values).toEqual([
      't1',
      'u1',
      'content.publish',
      'content',
      'c-uuid',
      { status: 'PUBLISHED' },
      '10.0.0.1',
      null,
    ]);
  });

  it('record nunca lança — falha de auditoria é logada, não bloqueia operação', async () => {
    vi.mocked((await import('@oktis-works/database')).getConnection as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        unsafe: vi.fn(async () => {
          throw new Error('db down');
        }),
      } as never);

    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(new AuditService().record({ action: 'x', resourceType: 'content' })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('list aplica filtros parametrizados e limit clampado', async () => {
    store.rows = [{ action: 'a' }];
    const service = new AuditService();

    await service.list({ tenantId: 't1', resourceType: 'content', limit: 9999 });
    expect(store.lastQuery!.values).toEqual(['t1', 'content', 500]);
    expect(store.lastQuery!.text).toContain('ORDER BY created_at DESC');

    await service.list({ limit: -5 });
    expect(store.lastQuery!.values).toEqual([1]);
  });
});
