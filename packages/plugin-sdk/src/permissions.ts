// @oktis-works/plugin-sdk - Catálogo centralizado de permissões de plugin
//
// Fonte ÚNICA das permissões que um manifesto pode declarar. O sandbox, a
// PluginAPI e a validação de manifesto consultam este catálogo — nunca strings
// espalhadas pelo código. Toda permissão nova entra aqui primeiro (F0.1 do
// plugin-parity-plan).

/**
 * Catálogo de permissões. Chave = constante, valor = string canônica.
 *
 * Uso no manifesto:  { "permissions": ["db:query", "cache:read"] }
 * Uso no código:     allowedPermissions.includes(PERMISSIONS.DB_QUERY)
 */
export const PERMISSIONS = {
  // ── Existente ──────────────────────────────────────────────────────────
  /** Executa SQL no schema do plugin com RLS do tenant. */
  DB_QUERY: 'db:query',
  /** Lê settings do tenant. */
  SETTINGS_READ: 'settings:read',
  /** Escreve settings do tenant. */
  SETTINGS_WRITE: 'settings:write',
  /** Emite eventos no barramento interno. */
  EVENTS_EMIT: 'events:emit',
  /** Registra tipos de campo customizados. */
  FIELD_TYPES_REGISTER: 'field-types:register',

  // ── Fase 1 (Plugin API ALTA) ───────────────────────────────────────────
  /** Registra Custom Post Types via api.addPostType. */
  POST_TYPES_REGISTER: 'post-types:register',
  /** Registra Custom Taxonomies via api.addTaxonomy. */
  TAXONOMIES_REGISTER: 'taxonomies:register',
  /** Lê cache/transient do plugin. */
  CACHE_READ: 'cache:read',
  /** Escreve cache/transient do plugin. */
  CACHE_WRITE: 'cache:write',
  /** Agenda jobs/cron via api.jobs. */
  JOBS_SCHEDULE: 'jobs:schedule',
  /** Faz requisições HTTP externas via api.http. */
  HTTP_FETCH: 'http:fetch',

  // ── Fase 2 (Editor de blocos) ──────────────────────────────────────────
  /** Registra blocos customizados para o editor. */
  BLOCKS_REGISTER: 'blocks:register',

  // ── Fase 3 (Paridade média) ────────────────────────────────────────────
  /** Cria/gerencia roles dentro do escopo do tenant. */
  ROLES_CREATE: 'roles:create',
  /** Enfileira assets (CSS/JS) no front-end. */
  ASSETS_ENQUEUE: 'assets:enqueue',

  // ── Fase 4 (nice-to-have) ──────────────────────────────────────────────
  /** Envia emails transacionais via api.mail. */
  MAIL_SEND: 'mail:send',
  /** Registra health checks próprios. */
  HEALTH_REGISTER: 'health:register',
} as const;

/** Valor de permissão (string canônica). */
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Array com TODAS as permissões conhecidas (para validação de manifesto). */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/**
 * Valida uma lista de permissões declaradas em manifesto.
 * Retorna as permissões desconhecidas (vazia = tudo válido).
 */
export function validatePermissions(declared: string[]): string[] {
  const known = new Set<string>(ALL_PERMISSIONS);
  return declared.filter((permission) => !known.has(permission));
}

/** Checa se uma permissão faz parte do catálogo. */
export function isKnownPermission(permission: string): permission is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(permission);
}
