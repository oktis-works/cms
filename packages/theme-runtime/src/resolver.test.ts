import { describe, it, expect, beforeEach } from 'vitest';

describe('ThemeResolver', () => {
  let ThemeResolver: any;

  beforeEach(async () => {
    const mod = await import('./resolver.js');
    ThemeResolver = mod.ThemeResolver;
  });

  it('should create a resolver instance', () => {
    const resolver = new ThemeResolver();
    expect(resolver).toBeDefined();
  });

  it('should have resolve method', () => {
    const resolver = new ThemeResolver();
    expect(typeof resolver.resolve).toBe('function');
  });
});
