// @oktis-works/validation - Catálogo e política de permissões de plugin (WP5)

import { describe, it, expect } from 'vitest';
import {
  PLUGIN_PERMISSIONS,
  PLUGIN_PERMISSION_DEFAULT,
  isKnownPluginPermission,
  unknownPluginPermissions,
  resolvePluginPermissionPolicy,
} from './plugin-permissions.js';

describe('plugin permissions catalog', () => {
  it('catálogo é a política default (tudo que existe é concedível)', () => {
    expect(PLUGIN_PERMISSION_DEFAULT).toEqual([...PLUGIN_PERMISSIONS]);
    expect(PLUGIN_PERMISSIONS.length).toBeGreaterThan(0);
  });

  it('reconhece permissões do catálogo e ignora foras dele', () => {
    expect(isKnownPluginPermission('db:query')).toBe(true);
    expect(isKnownPluginPermission('root:shell')).toBe(false);
    expect(unknownPluginPermissions(['content:read', 'root:shell', 42])).toEqual(['root:shell']);
  });

  it('sem configuração → catálogo completo', () => {
    expect(resolvePluginPermissionPolicy(undefined).allowed).toEqual([...PLUGIN_PERMISSIONS]);
    expect(resolvePluginPermissionPolicy('').allowed).toEqual([...PLUGIN_PERMISSIONS]);
  });

  it('configuração restringe e reporta entradas desconhecidas', () => {
    const policy = resolvePluginPermissionPolicy('content:read, db:query, made-up');
    expect(policy.allowed.sort()).toEqual(['content:read', 'db:query']);
    expect(policy.ignored).toEqual(['made-up']);
  });

  it('aceita lista já separada', () => {
    expect(resolvePluginPermissionPolicy(['settings:read']).allowed).toEqual(['settings:read']);
  });

  // Regressão do bug real: field-types:register não existia no catálogo →
  // o sync colocava o mermaid-field em QUARANTINED e o sandbox rejeitava no
  // boot, isolando silenciosamente todo plugin de tipo de campo.
  it('field-types:register e todas as permissões do plano de paridade estão no catálogo', () => {
    const required = [
      'field-types:register',
      'post-types:register',
      'taxonomies:register',
      'cache:read',
      'cache:write',
      'jobs:schedule',
      'http:outbound',
      'blocks:register',
      'roles:create',
      'assets:enqueue',
      'mail:send',
      'health:register',
    ];
    expect(unknownPluginPermissions(required)).toEqual([]);
  });
});
