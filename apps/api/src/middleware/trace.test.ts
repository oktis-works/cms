// @oktis-works/api - REQ-observability-005: request rastreável via X-Trace-ID

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { traceMiddleware } from './trace.js';

const app = () => {
  const a = new Hono();
  a.use('*', traceMiddleware);
  return a;
};

describe('traceMiddleware — REQ-observability-005', () => {
  it('gera X-Trace-ID quando o request não traz', async () => {
    const a = app();
    a.get('/', (c) => c.json({ ok: true }));

    const res = await a.request('/');
    expect(res.headers.get('X-Trace-ID')).toBeTruthy();
    expect(res.headers.get('X-Trace-ID')).toHaveLength(36); // UUID
  });

  it('propaga X-Trace-ID recebido do cliente', async () => {
    const a = app();
    a.get('/', (c) => c.json({ traceId: c.get('traceId' as never) }));

    const res = await a.request('/', { headers: { 'X-Trace-ID': 'my-trace-123' } });
    const body = (await res.json()) as { traceId: string };
    expect(body.traceId).toBe('my-trace-123');
    expect(res.headers.get('X-Trace-ID')).toBe('my-trace-123');
  });
});
