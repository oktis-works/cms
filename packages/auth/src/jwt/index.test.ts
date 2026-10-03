import { describe, it, expect, beforeEach } from 'vitest';

describe('JWTService', () => {
  let jwtService: any;

  beforeEach(async () => {
    const mod = await import('./index.js');
    jwtService = new mod.JWTService({
      jwtSecret: process.env['JWT_TEST_SECRET'] || 'unit-test-only-secret-not-for-production',
      jwtExpiresIn: '1h',
      refreshTokenExpiresIn: '7d',
      bcryptRounds: 10,
      cookie: {
        sameSite: 'lax',
        secure: false,
        accessTokenMaxAge: 900,
        refreshTokenMaxAge: 2592000,
      },
      csrf: {
        enabled: true,
        headerName: 'x-csrf-token',
        cookieName: 'csrf_token',
      },
    });
  });

  it('should generate a valid access token', async () => {
    const pair = await jwtService.generateTokenPair({
      sub: 'user-123',
      email: 'test@example.com',
      tenantId: 'tenant-1',
      roles: ['admin'],
    });
    expect(pair.accessToken).toBeDefined();
    expect(typeof pair.accessToken).toBe('string');
    expect(pair.accessToken.split('.')).toHaveLength(3); // JWT has 3 parts
  });

  it('should verify a valid token', async () => {
    const pair = await jwtService.generateTokenPair({
      sub: 'user-123',
      email: 'test@example.com',
      tenantId: 'tenant-1',
      roles: ['admin'],
    });
    const payload = await jwtService.verifyToken(pair.accessToken);
    expect(payload).toBeDefined();
    expect(payload?.sub).toBe('user-123');
    expect(payload?.email).toBe('test@example.com');
  });

  it('should return null for invalid token', async () => {
    const payload = await jwtService.verifyToken('invalid.token.here');
    expect(payload).toBeNull();
  });

  it('should generate refresh token and rotate via refreshAccessToken', async () => {
    const first = await jwtService.generateTokenPair({
      sub: 'user-123',
      email: 'test@example.com',
      tenantId: 'tenant-1',
      roles: ['admin'],
    });
    expect(first.refreshToken).toBeDefined();
    expect(typeof first.refreshToken).toBe('string');

    const rotated = await jwtService.refreshAccessToken(first.refreshToken);
    expect(rotated).toBeDefined();
    expect(rotated?.accessToken).toBeDefined();

    const payload = await jwtService.verifyToken(rotated!.refreshToken);
    expect(payload?.sub).toBe('user-123');
  });
});
