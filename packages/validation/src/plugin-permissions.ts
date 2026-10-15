// @oktis-works/validation - Catálogo de permissões de plugin (WP5)
//
// Vocabulário único de permissões: o manifesto **declara** o que precisa e a
// configuração **concede** o que é permitido. O sandbox valida o manifesto
// contra a política concedida — nunca contra o próprio manifesto (isso seria
// aprovação garantida). Permissão fora do catálogo é rejeitada na
// instalação/sync (falhar cedo, não no boot).

export const PLUGIN_PERMISSIONS = [
  'content:read',
  'content:write',
  'settings:read',
  'settings:write',
  'events:emit',
  'storage:read',
  'storage:write',
  'http:outbound',
  'db:query',
  'db:write',
  'routes:register',
  'admin:ui',
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/** Política default: todo o catálogo é concedível (configuração pode restringir). */
export const PLUGIN_PERMISSION_DEFAULT: readonly string[] = PLUGIN_PERMISSIONS;

export function isKnownPluginPermission(permission: string): permission is PluginPermission {
  return (PLUGIN_PERMISSIONS as readonly string[]).includes(permission);
}

/** Permissões declaradas fora do catálogo (inválidas). */
export function unknownPluginPermissions(permissions: readonly unknown[]): string[] {
  return permissions.filter(
    (permission): permission is string => typeof permission === 'string' && !isKnownPluginPermission(permission)
  );
}

export interface PermissionPolicy {
  /** Allowlist concedida ao sandbox. */
  allowed: string[];
  /** Permissões pedidas fora do catálogo, descartadas da política. */
  ignored: string[];
}

/**
 * Resolve a política a partir da configuração (`OKCMS_PLUGIN_PERMISSIONS`,
 * lista separada por vírgula). Sem configuração → catálogo completo.
 * Nome fora do catálogo é ignorado (e reportado), nunca concedido.
 */
export function resolvePluginPermissionPolicy(configured?: string | string[] | null): PermissionPolicy {
  if (configured === undefined || configured === null || configured === '') {
    return { allowed: [...PLUGIN_PERMISSION_DEFAULT], ignored: [] };
  }

  const entries = Array.isArray(configured)
    ? configured
    : configured
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

  const allowed = new Set<string>();
  const ignored: string[] = [];
  for (const entry of entries) {
    if (isKnownPluginPermission(entry)) allowed.add(entry);
    else ignored.push(entry);
  }

  return { allowed: [...allowed], ignored };
}
