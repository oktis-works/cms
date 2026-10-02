// @oktis-works/core - Event→AuditLog wiring (REQ-event-bus-005)

import type { EventBus } from '../events/bus.js';
import type { Event } from '@oktis-works/types';
import { auditService } from './audit.js';

/**
 * REQ-event-bus-005: todo evento de domínio emitido pelo bus é registrado
 * no AuditLog (append-only). O AuditService.record nunca lança, portanto
 * uma falha de auditoria não interrompe o fluxo do evento.
 */
export function registerEventAuditLog(eventBus: EventBus): void {
  eventBus.on('*', async (event: Event) => {
    await auditService.record({
      tenantId: event.tenantId,
      userId: event.payload['userId'] as string | undefined,
      action: event.type,
      resourceType: event.aggregateType,
      resourceId: event.aggregateId,
      changes: { eventId: event.id },
    });
  });
}
