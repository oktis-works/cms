// @oktis-works/core - Fila de webhooks + invalidação cross-process de cache
//
// Listeners registrados no bootstrap (ApplicationLifecycle) para que TODO processo
// que emita eventos (API, worker) dispare o fan-out. A entrega HTTP acontece no
// worker (webhookSendHandler) com assinatura HMAC — aqui só enfileiramos.

import { getConnection } from '@oktis-works/database';
import type { Event } from '@oktis-works/types';
import type { EventBus } from './bus.js';
import { enqueueJob } from '../queue/producer.js';

/**
 * Fan-out de webhooks: para cada evento emitido, enfileira um `webhook.send`
 * por webhook ativo subscrito ao tipo exato ou a `*`.
 */
export function registerWebhookDispatch(bus: EventBus): void {
  bus.on('*', async (event: Event) => {
    const sql = getConnection();
    const rows = await sql.unsafe(
      `SELECT id FROM webhooks
       WHERE active = true
         AND (events @> $1::jsonb OR events @> '"*"'::jsonb)`,
      [JSON.stringify([event.type])]
    );

    for (const row of rows as unknown as Array<{ id: string }>) {
      await enqueueJob(
        'webhook.send',
        {
          webhookId: row.id,
          event: event.type,
          data: event.payload,
        },
        { tenantId: event.tenantId }
      );
    }
  });
}

/**
 * Invalidação cross-process: eventos de conteúdo enfileiram `cache.invalidate`
 * para que outros processos (worker, web) limpem as chaves `content*`.
 * Best-effort: fila degradada não afeta a emissão do evento.
 */
export function registerCacheInvalidation(bus: EventBus): void {
  bus.on('*', async (event: Event) => {
    if (!event.type.startsWith('content.')) return;

    await enqueueJob(
      'cache.invalidate',
      { pattern: 'content*' },
      { tenantId: event.tenantId }
    );
  });
}
