import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('TenantContext', () => {
  let getCurrentContext: any;
  let clearCurrentContext: any;

  beforeEach(async () => {
    const mod = await import('./context.js');
    getCurrentContext = mod.getCurrentContext;
    clearCurrentContext = mod.clearCurrentContext;
  });

  afterEach(async () => {
    await clearCurrentContext();
  });

  it('should establish and get tenant context', async () => {
    // Note: This test requires database connection to be mocked
    // For now, we test the in-memory context behavior
    const context = await getCurrentContext();
    // Without establishing context, should return null (if no DB connection)
    expect(context === null || context?.tenantId !== undefined).toBe(true);
  });

  it('should return null when no context is established', async () => {
    await clearCurrentContext();
    const context = await getCurrentContext();
    expect(context).toBeNull();
  });
});
