import { describe, it, expect, beforeEach } from 'vitest';

describe('RBACService', () => {
  let rbacService: any;

  beforeEach(async () => {
    const mod = await import('./index.js');
    rbacService = new mod.RBACService();
  });

  it('should check permissions for roles', () => {
    const hasPermission = rbacService.hasPermission(['admin'], 'read', 'user');
    expect(typeof hasPermission).toBe('boolean');
  });

  it('should return false for unknown roles', () => {
    const hasPermission = rbacService.hasPermission(['nonexistent'], 'read', 'user');
    expect(hasPermission).toBe(false);
  });

  it('should have getUserPermissions method', () => {
    expect(typeof rbacService.getUserPermissions).toBe('function');

    const adminPermissions = rbacService.getUserPermissions(['admin']);
    expect(Array.isArray(adminPermissions)).toBe(true);
  });

  it('TENANT_ADMIN administra qualquer recurso do tenant (inclusive a rota "roles" plural)', () => {
    expect(rbacService.hasPermission(['TENANT_ADMIN'], 'read', 'roles')).toBe(true);
    expect(rbacService.hasPermission(['TENANT_ADMIN'], 'create', 'role')).toBe(true);
    expect(rbacService.hasPermission(['TENANT_ADMIN'], 'manage', 'taxonomy')).toBe(true);
    expect(rbacService.hasPermission(['TENANT_ADMIN'], 'update', 'content-type')).toBe(true);
  });

  it('VIEWER lê conteúdo mas não escreve', () => {
    expect(rbacService.hasPermission(['VIEWER'], 'read', 'content')).toBe(true);
    expect(rbacService.hasPermission(['VIEWER'], 'delete', 'content')).toBe(false);
    expect(rbacService.hasPermission(['VIEWER'], 'update', 'user')).toBe(false);
  });
});
