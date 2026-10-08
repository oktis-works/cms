// @oktis-works/types - Eventos disponíveis para inscrições de webhooks

/**
 * Catálogo estável para a UI e para integrações. O wildcard continua aceito
 * para instalações que precisam receber qualquer evento futuro.
 */
export const WEBHOOK_EVENT_TYPES = [
  'content.created',
  'content.updated',
  'content.deleted',
  'content.published',
  'content.unpublished',
  'taxonomy.created',
  'taxonomy.updated',
  'taxonomy.deleted',
  'plugin.activated',
  'plugin.deactivated',
  'theme.activated',
  'theme.deactivated',
  'deployment.completed',
  'deployment.failed',
  '*',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];
