import { describe, expect, it, afterEach } from 'vitest';
import { createThemePreviewToken, verifyThemePreviewToken } from './preview.js';

const previousSecret = process.env['THEME_PREVIEW_SECRET'];

afterEach(() => {
  if (previousSecret === undefined) delete process.env['THEME_PREVIEW_SECRET'];
  else process.env['THEME_PREVIEW_SECRET'] = previousSecret;
});

describe('theme preview tokens', () => {
  it('binds the token to tenant, theme, user, and expiration', () => {
    process.env['THEME_PREVIEW_SECRET'] = '01234567890123456789012345678901';
    const token = createThemePreviewToken({ tenantId: 'tenant-a', themeId: 'theme-a', userId: 'user-a', ttlSeconds: 60 });
    expect(verifyThemePreviewToken(token)).toMatchObject({ tenantId: 'tenant-a', themeId: 'theme-a', userId: 'user-a' });
    expect(verifyThemePreviewToken(`${token.replace(/\.[^.]+$/, '')}.invalid-signature`)).toBeNull();
  });

  it('rejects missing or weak secrets', () => {
    delete process.env['THEME_PREVIEW_SECRET'];
    expect(() => createThemePreviewToken({ tenantId: 't', themeId: 'th', userId: 'u' })).toThrow(/secret/i);
  });
});
