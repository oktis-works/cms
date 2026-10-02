import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from './index.js';

describe('Config', () => {
  beforeEach(() => {
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
    process.env['REDIS_HOST'] = 'localhost';
    process.env['REDIS_PORT'] = '6379';
    process.env['JWT_SECRET'] = 'test-secret-key';
  });

  it('should load config from environment variables', () => {
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(config.database).toBeDefined();
    expect(config.redis.host).toBe('localhost');
    expect(config.auth.jwtSecret).toBe('test-secret-key');
  });

  it('should have default values', () => {
    delete process.env['JWT_EXPIRES_IN'];
    delete process.env['REFRESH_TOKEN_EXPIRES_IN'];
    const config = loadConfig();
    expect(config.auth.jwtExpiresIn).toBeDefined();
    expect(config.auth.refreshTokenExpiresIn).toBeDefined();
  });
});
