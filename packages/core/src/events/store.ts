// @oktis-works/core - Persistent Event Store (RULE-event-idempotency)

import { getConnection } from '@oktis-works/database';
import type { Event } from '@oktis-works/types';

export interface DeadLetterEntry extends Event {
  error: string;
  attempts: number;
}

/**
 * Persistência de eventos com idempotência por id:
 * - persist é ON CONFLICT DO NOTHING (emit duplicado não reprocessa)
 * - processed marca conclusão de todos os handlers
 * - DLQ durável sobrevive a restarts (replaces fila em memória)
 */
export class EventStore {
  async isProcessed(eventId: string): Promise<boolean> {
    const sql = getConnection();
    const result = await sql<{ processed: boolean }[]>`
      SELECT processed FROM events WHERE id = ${eventId}
    `;
    return result[0]?.processed === true;
  }

  async persist(event: Event): Promise<void> {
    const sql = getConnection();
    await sql`
      INSERT INTO events (id, type, aggregate_type, aggregate_id, payload, tenant_id, processed)
      VALUES (${event.id}, ${event.type}, ${event.aggregateType}, ${event.aggregateId},
              ${JSON.stringify(event.payload)}::jsonb, ${event.tenantId ?? null}, false)
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async markProcessed(eventId: string): Promise<void> {
    const sql = getConnection();
    await sql`UPDATE events SET processed = true WHERE id = ${eventId}`;
  }

  async toDeadLetter(event: Event, error: string, attempts: number): Promise<void> {
    const sql = getConnection();
    await sql`
      INSERT INTO dead_letter_events (id, type, aggregate_type, aggregate_id, payload, tenant_id, error, attempts)
      VALUES (${event.id}, ${event.type}, ${event.aggregateType}, ${event.aggregateId},
              ${JSON.stringify(event.payload)}::jsonb, ${event.tenantId ?? null}, ${error}, ${attempts})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async listDeadLetter(limit = 100): Promise<DeadLetterEntry[]> {
    const sql = getConnection();
    const clamped = Math.min(Math.max(limit, 1), 500);
    const result = await sql<DeadLetterEntry[]>`
      SELECT id, type, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId",
             payload, tenant_id AS "tenantId", created_at AS "createdAt", error, attempts
      FROM dead_letter_events
      ORDER BY created_at DESC
      LIMIT ${clamped}
    `;
    return result;
  }
}
