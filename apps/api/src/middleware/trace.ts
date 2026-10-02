// @oktis-works/api - Trace ID middleware (REQ-observability-005)

import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';

/**
 * REQ-observability-005: todo request pode ser rastreado via trace ID.
 * Propaga X-Trace-ID recebido ou gera um novo; devolve na resposta.
 */
export async function traceMiddleware(c: Context, next: Next): Promise<Response | void> {
  const incoming = c.req.header('X-Trace-ID');
  const traceId = incoming && incoming.length <= 128 ? incoming : randomUUID();

  c.set('traceId' as never, traceId as never);
  await next();
  c.header('X-Trace-ID', traceId);
}
