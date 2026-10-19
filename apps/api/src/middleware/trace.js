// @oktis-works/api - Trace ID middleware (REQ-observability-005)
import { randomUUID } from 'node:crypto';
/**
 * REQ-observability-005: todo request pode ser rastreado via trace ID.
 * Propaga X-Trace-ID recebido ou gera um novo; devolve na resposta.
 */
export async function traceMiddleware(c, next) {
    const incoming = c.req.header('X-Trace-ID');
    const traceId = incoming && incoming.length <= 128 ? incoming : randomUUID();
    c.set('traceId', traceId);
    await next();
    c.header('X-Trace-ID', traceId);
}
//# sourceMappingURL=trace.js.map