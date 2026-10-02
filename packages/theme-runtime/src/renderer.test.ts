import { describe, it, expect, beforeEach } from 'vitest';

describe('ThemeRenderer', () => {
  let ThemeRenderer: any;

  beforeEach(async () => {
    const mod = await import('./renderer.js');
    ThemeRenderer = mod.ThemeRenderer;
  });

  it('should create a renderer instance', () => {
    const renderer = new ThemeRenderer({ themePath: '/mock/path' });
    expect(renderer).toBeDefined();
  });

  it('should have render method', () => {
    const renderer = new ThemeRenderer({ themePath: '/mock/path' });
    expect(typeof renderer.render).toBe('function');
  });
});
