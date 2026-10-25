import { describe, expect, it } from 'vitest';
import { matchPluginRoutePath } from './matcher.js';

describe('matchPluginRoutePath', () => {
  it('matches static, parameterized, and wildcard segments', () => {
    expect(matchPluginRoutePath('/reports/:id', '/reports/42')).toBe(true);
    expect(matchPluginRoutePath('/reports/*', '/reports/42')).toBe(true);
    expect(matchPluginRoutePath('/reports/:id', '/reports/42/details')).toBe(false);
    expect(matchPluginRoutePath('/reports/list', '/reports/lists')).toBe(false);
  });
});
