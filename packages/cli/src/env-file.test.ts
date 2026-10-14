// @oktis-works/cms - Editor de .env que preserva comentários e ordem — F0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile, parseEnv, projectProcessEnv, serializeEnvValue, syncProcessEnv } from './env-file.js';

const SAMPLE = `# OkCMS - Environment
# Copie para .env e ajuste.

# Application
NODE_ENV=development
PORT=3000                     # porta da api

# Database
DB_HOST=localhost
DB_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:secret@localhost:5432/okcms

# Auth
JWT_SECRET="change-me-in-production"
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-env-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseEnv / round-trip', () => {
  it('touches nothing when no key changes', () => {
    expect(parseEnv(SAMPLE).toString()).toBe(SAMPLE);
  });

  it('recognizes only real keys (comments become raw lines)', () => {
    const env = parseEnv(SAMPLE);
    expect(env.keys()).toEqual([
      'NODE_ENV',
      'PORT',
      'DB_HOST',
      'DB_PASSWORD',
      'DATABASE_URL',
      'JWT_SECRET',
    ]);
    expect(env.has('COMENTARIO')).toBe(false);
  });

  it('reads a trailing comment without swallowing the key', () => {
    const env = parseEnv(SAMPLE);
    expect(env.get('PORT')).toBe('3000');
  });

  it('understands `export KEY=`', () => {
    expect(parseEnv('export TOKEN=abc\n').get('TOKEN')).toBe('abc');
  });

  it('strips outer quotes when reading', () => {
    expect(parseEnv(SAMPLE).get('JWT_SECRET')).toBe('change-me-in-production');
  });

  it('keeps URL `#` fragments and `#` inside quotes', () => {
    const env = parseEnv('URL=http://x/#a\nA="v # w"\n');
    expect(env.get('URL')).toBe('http://x/#a');
    expect(env.get('A')).toBe('v # w');
  });
});

describe('EnvFile.set', () => {
  it('replaces in place, keeping indentation and the trailing comment', () => {
    const env = parseEnv(SAMPLE);
    expect(env.set('PORT', '8080')).toBe(true);

    const lines = env.toString().split('\n');
    expect(lines).toContain('PORT=8080                     # porta da api');
    // ordem intacta: PORT continua na seção Application, antes de Database
    const text = env.toString();
    expect(text.indexOf('# Application')).toBeLessThan(text.indexOf('PORT=8080'));
    expect(text.indexOf('PORT=8080')).toBeLessThan(text.indexOf('# Database'));
  });

  it('returns false when the value is already the same (no useless write)', () => {
    const env = parseEnv(SAMPLE);
    expect(env.set('PORT', '3000')).toBe(false);
  });

  it('appends a brand-new key at the end', () => {
    const env = parseEnv(SAMPLE);
    env.set('REDIS_HOST', 'redis');
    expect(env.toString().trimEnd().endsWith('REDIS_HOST=redis')).toBe(true);
    expect(env.get('REDIS_HOST')).toBe('redis');
  });

  it('inserts in the right section when a section header exists', () => {
    const env = parseEnv(SAMPLE);
    env.setInSection('CACHE_TTL', '3600', 'Application');

    const text = env.toString();
    expect(text.indexOf('CACHE_TTL=3600')).toBeGreaterThan(text.indexOf('# Application'));
    expect(text.indexOf('CACHE_TTL=3600')).toBeLessThan(text.indexOf('# Database'));
  });

  it('keeps the `export ` prefix when replacing', () => {
    const env = parseEnv('export A=1\n');
    env.set('A', '2');
    expect(env.toString()).toBe('export A=2\n');
  });

  it('removes the line without erasing neighbor comments', () => {
    const env = parseEnv('# Auth\nJWT_SECRET=x\n# fim\n');
    expect(env.delete('JWT_SECRET')).toBe(true);
    expect(env.toString()).toBe('# Auth\n# fim\n');
    expect(env.delete('INEXISTENTE')).toBe(false);
  });
});

describe('serializeEnvValue', () => {
  it('keeps a simple value raw', () => {
    expect(serializeEnvValue('localhost')).toBe('localhost');
    expect(serializeEnvValue('3000')).toBe('3000');
    expect(serializeEnvValue('')).toBe('');
  });

  it('quotes an ambiguous value', () => {
    expect(serializeEnvValue('a b')).toBe('"a b"');
    expect(serializeEnvValue('a#b')).toBe('"a#b"');
    expect(serializeEnvValue('a"b')).toBe('"a\\"b"');
  });

  it('round-trips a quoted value', () => {
    const env = parseEnv('A="x y"\n');
    expect(env.get('A')).toBe('x y');
    env.set('A', 'p q');
    expect(parseEnv(env.toString()).get('A')).toBe('p q');
  });
});

describe('loadEnvFile / save', () => {
  it('returns an empty file (no throw) when the file does not exist', () => {
    const env = loadEnvFile(join(dir, '.env'));
    expect(env.toString()).toBe('');
    expect(env.get('PORT')).toBeUndefined();
  });

  it('persists with permission 600 (owner only) — .env holds secrets and JWT', () => {
    const path = join(dir, '.env');
    writeFileSync(path, 'PORT=3000\n');

    const env = loadEnvFile(path);
    env.set('DB_PASSWORD', 's3nh4');
    env.save();

    expect(readFileSync(path, 'utf-8')).toContain('DB_PASSWORD=s3nh4');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('full round-trip preserves the file byte for byte', () => {
    const path = join(dir, '.env');
    writeFileSync(path, SAMPLE);
    const env = loadEnvFile(path);
    env.save();
    expect(readFileSync(path, 'utf-8')).toBe(`${SAMPLE}\n`);
    expect(existsSync(path)).toBe(true);
  });

  it('EnvFile built without a path requires one on save', () => {
    expect(() => parseEnv('A=1').save()).toThrow(/no path/);
  });
});

// ---------------------------------------------------------------------------
// O processo nasce com um snapshot do .env (bun carrega `.env` no start e não
// sobrescreve o que já está definido). Quando o arquivo manda depois — ou o
// shell exporta o placeholder vazio do init — é aqui que o snapshot é curado.
// ---------------------------------------------------------------------------

describe('syncProcessEnv / projectProcessEnv', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('sync: placeholder vazio no processo é substituído pelo valor do arquivo', () => {
    process.env['DB_PASSWORD'] = '';

    const applied = syncProcessEnv(parseEnv('DB_PASSWORD=okcms777\n'));

    expect(process.env['DB_PASSWORD']).toBe('okcms777');
    expect(applied).toContain('DB_PASSWORD');
  });

  it('sync: segredo exportado pelo shell vence quando o arquivo está vazio', () => {
    process.env['DB_PASSWORD'] = 'do-shell';

    const applied = syncProcessEnv(parseEnv('DB_PASSWORD=\n'));

    expect(process.env['DB_PASSWORD']).toBe('do-shell');
    expect(applied).not.toContain('DB_PASSWORD');
  });

  it('sync: arquivo não-vazio vence valor desatualizado no processo', () => {
    process.env['DB_PASSWORD'] = 'senha-velha';

    syncProcessEnv(parseEnv('DB_PASSWORD=nova-senha\n'));

    expect(process.env['DB_PASSWORD']).toBe('nova-senha');
  });

  it('projectProcessEnv: devolve cópia com o arquivo por cima, sem mutar o processo', () => {
    writeFileSync(join(dir, '.env'), 'DB_PASSWORD=okcms777\nJWT_SECRET=\n');
    process.env['DB_PASSWORD'] = '';

    const merged = projectProcessEnv(dir);

    expect(merged['DB_PASSWORD']).toBe('okcms777');
    // arquivo vazio não toca nada: exportação do shell continua valendo
    expect(merged['JWT_SECRET']).toBe(process.env['JWT_SECRET']);
    expect(process.env['DB_PASSWORD']).toBe('');
  });

  it('projectProcessEnv: sem .env na raiz devolve o processo como está', () => {
    process.env['DB_PASSWORD'] = 'do-shell';
    const merged = projectProcessEnv(join(dir, 'inexistente'));
    expect(merged['DB_PASSWORD']).toBe('do-shell');
  });
});
