import { describe, expect, it } from 'vitest';
import { THEME_SDK_API_VERSION, createEmptyThemeSdkBridge } from './bridge.js';

describe('ThemeSdkBridge contract', () => {
  it('creates independent request-scoped contexts', async () => {
    const first = createEmptyThemeSdkBridge({ tenantId: 'tenant-a', url: '/a' });
    const second = createEmptyThemeSdkBridge({ tenantId: 'tenant-b', url: '/b' });

    expect(first.context.apiVersion).toBe(THEME_SDK_API_VERSION);
    expect(first.context.tenantId).toBe('tenant-a');
    expect(second.context.tenantId).toBe('tenant-b');
    expect(first.context).not.toBe(second.context);
    expect(first.navigation.url('/about')).toBe('/about');
  });

  it('returns stable empty results for unavailable optional capabilities', async () => {
    const sdk = createEmptyThemeSdkBridge();

    await expect(sdk.content.query()).resolves.toMatchObject({ data: [], total: 0 });
    await expect(sdk.actions.execute('missing')).resolves.toEqual({
      ok: false,
      code: 'ACTION_UNAVAILABLE',
    });
    await expect(sdk.hooks.apply({ name: 'missing', value: { ok: true } })).resolves.toEqual({ ok: true });
    expect(sdk.media.publicUrl('/image.jpg')).toBe('/image.jpg');
  });
});
