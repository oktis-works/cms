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
});
