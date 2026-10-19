// @oktis-works/plugin-sdk - Constantes ergonômicas do catálogo de permissões
//
// A fonte ÚNICA é `@oktis-works/validation` (`PLUGIN_PERMISSIONS`): é ela que
// governa instalação (QUARANTINED fora do catálogo), sync, política do
// sandbox e policy do PluginAPI. Aqui só expomos constantes nomeadas para o
// código e `satisfies` garante que NENHUMA constante exista fora do catálogo
// (o drift que colocou `field-types:register` fora da política e trancou o
// mermaid-field em quarentena não se repete).

import {
  PLUGIN_PERMISSIONS,
  isKnownPluginPermission,
  unknownPluginPermissions,
  type PluginPermission,
} from '@oktis-works/validation';

/**
 * Constantes nomeadas de permissão. Valores tipados como `Permission`
 * (união do catálogo de validation) — um typo não compila.
 *
 * Uso no manifesto:  { "permissions": ["db:query", "cache:read"] }
 * Uso no código:     allowedPermissions.includes(PERMISSIONS.DB_QUERY)
 */
export const PERMISSIONS = {
  // ── Core ──
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',
  EVENTS_EMIT: 'events:emit',
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  HTTP_OUTBOUND: 'http:outbound',
  DB_QUERY: 'db:query',
  DB_WRITE: 'db:write',
  ROUTES_REGISTER: 'routes:register',
  ADMIN_UI: 'admin:ui',
  // ── Field types ──
  FIELD_TYPES_REGISTER: 'field-types:register',
  // ── Fase 1: CPTs / taxonomias / cache / jobs ──
  POST_TYPES_REGISTER: 'post-types:register',
  TAXONOMIES_REGISTER: 'taxonomies:register',
  CACHE_READ: 'cache:read',
  CACHE_WRITE: 'cache:write',
  JOBS_SCHEDULE: 'jobs:schedule',
  // ── Fase 2: editor de blocos ──
  BLOCKS_REGISTER: 'blocks:register',
  PATTERNS_REGISTER: 'patterns:register',
  // ── Fase 3/4: roles, assets, mail, health ──
  ROLES_CREATE: 'roles:create',
  ASSETS_ENQUEUE: 'assets:enqueue',
  MAIL_SEND: 'mail:send',
  HEALTH_REGISTER: 'health:register',
} as const satisfies Record<string, PluginPermission>;

/** Valor de permissão (string canônica do catálogo). */
export type Permission = PluginPermission;

/** Array com TODAS as permissões conhecidas (catálogo de validation). */
export const ALL_PERMISSIONS: readonly Permission[] = PLUGIN_PERMISSIONS;

/**
 * Valida uma lista de permissões declaradas em manifesto.
 * Retorna as desconhecidas (vazia = tudo válido).
 */
export function validatePermissions(declared: string[]): string[] {
  return unknownPluginPermissions(declared);
}

/** Checa se uma permissão faz parte do catálogo. */
export function isKnownPermission(permission: string): permission is Permission {
  return isKnownPluginPermission(permission);
}
