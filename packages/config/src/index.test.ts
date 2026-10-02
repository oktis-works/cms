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

  it('DATABASE_URL tem precedência sobre DB_*', () => {
    process.env['DATABASE_URL'] = 'postgresql://urluser:urlpw@db.local:5433/urldb';
    process.env['DB_HOST'] = 'ignorado.local';
    process.env['DB_PORT'] = '9999';
    process.env['DB_NAME'] = 'ignorado';
    process.env['DB_USER'] = 'ignorado';
    process.env['DB_PASSWORD'] = 'ignorado';
    try {
      const config = loadConfig();
      expect(config.database).toMatchObject({
        driver: 'postgres',
        host: 'db.local',
        port: 5433,
        database: 'urldb',
        user: 'urluser',
        password: 'urlpw',
      });
    } finally {
      for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
        delete process.env[key];
      }
    }
  });

  it('sem DATABASE_URL usa as variáveis separadas DB_*', () => {
    delete process.env['DATABASE_URL'];
    process.env['DB_HOST'] = 'vars.local';
    process.env['DB_PORT'] = '5434';
    process.env['DB_NAME'] = 'varsdb';
    process.env['DB_USER'] = 'varsuser';
    process.env['DB_PASSWORD'] = 'varspw';
    try {
      const config = loadConfig();
      expect(config.database).toMatchObject({
        host: 'vars.local',
        port: 5434,
        database: 'varsdb',
        user: 'varsuser',
        password: 'varspw',
      });
    } finally {
      for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
        delete process.env[key];
      }
      process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
    }
  });

  it('mysql:// detecta driver mysql e porta 3306 default', () => {
    process.env['DATABASE_URL'] = 'mysql://root:pw@mysql.local/mydb';
    const config = loadConfig();
    expect(config.database.driver).toBe('mysql');
    expect(config.database.port).toBe(3306);
    expect(config.database.database).toBe('mydb');
  });

  it('DATABASE_URL inválida lança erro claro (falha barulhenta)', () => {
    process.env['DATABASE_URL'] = 'não-é-url';
    expect(() => loadConfig()).toThrow(/DATABASE_URL inválida/);
    process.env['DATABASE_URL'] = 'ftp://h/db';
    expect(() => loadConfig()).toThrow(/não suportado/);
    process.env['DATABASE_URL'] = 'postgresql://user:pass@host:5432/';
    expect(() => loadConfig()).toThrow(/falta o nome do banco/);
  });
});
