import { describe, expect, it } from 'vitest';
import { resolvePluginComponentPath } from './slots.js';

describe('resolvePluginComponentPath', () => {
  it('resolves only normalized plugin-owned component references', () => {
    expect(resolvePluginComponentPath('analytics:Stats')).toBe('../../../plugins/analytics/admin/components/Stats.tsx');
    expect(resolvePluginComponentPath('@/plugins/analytics/admin/components/Stats.tsx')).toContain('/analytics/admin/components/Stats.tsx');
    expect(() => resolvePluginComponentPath('../Secrets', 'analytics')).toThrow(/Invalid plugin component/);
    expect(() => resolvePluginComponentPath('Stats', '../analytics')).toThrow(/Invalid plugin name/);
  });
});
