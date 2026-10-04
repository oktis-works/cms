// @oktis-works/cms - Editor de .env que preserva comentários e ordem — F0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile, parseEnv, serializeEnvValue } from './env-file.js';

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
  it('não toca em nada quando nenhuma chave é alterada', () => {
    expect(parseEnv(SAMPLE).toString()).toBe(SAMPLE);
  });

  it('reconhece só as chaves reais (comentários viram linha raw)', () => {
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

  it('lê comentário final sem engolir a chave', () => {
    const env = parseEnv(SAMPLE);
    expect(env.get('PORT')).toBe('3000');
  });

  it('entende `export KEY=`', () => {
    expect(parseEnv('export TOKEN=abc\n').get('TOKEN')).toBe('abc');
  });

  it('remove aspas externas ao ler', () => {
    expect(parseEnv(SAMPLE).get('JWT_SECRET')).toBe('change-me-in-production');
  });

  it('não corta fragmento `#` de URL nem `#` dentro de aspas', () => {
    const env = parseEnv('URL=http://x/#a\nA="v # w"\n');
    expect(env.get('URL')).toBe('http://x/#a');
    expect(env.get('A')).toBe('v # w');
  });
});

describe('EnvFile.set', () => {
  it('substitui no lugar preservando indentação e comentário final', () => {
    const env = parseEnv(SAMPLE);
    expect(env.set('PORT', '8080')).toBe(true);

    const lines = env.toString().split('\n');
    expect(lines).toContain('PORT=8080                     # porta da api');
    // ordem intacta: PORT continua na seção Application, antes de Database
    const text = env.toString();
    expect(text.indexOf('# Application')).toBeLessThan(text.indexOf('PORT=8080'));
    expect(text.indexOf('PORT=8080')).toBeLessThan(text.indexOf('# Database'));
  });

  it('retorna false quando o valor já é o mesmo (sem gravação inútil)', () => {
    const env = parseEnv(SAMPLE);
    expect(env.set('PORT', '3000')).toBe(false);
  });

  it('apende chave inédita no fim', () => {
    const env = parseEnv(SAMPLE);
    env.set('REDIS_HOST', 'redis');
    expect(env.toString().trimEnd().endsWith('REDIS_HOST=redis')).toBe(true);
    expect(env.get('REDIS_HOST')).toBe('redis');
  });

  it('insere na seção certa quando existe cabeçalho de seção', () => {
    const env = parseEnv(SAMPLE);
    env.setInSection('CACHE_TTL', '3600', 'Application');

    const text = env.toString();
    expect(text.indexOf('CACHE_TTL=3600')).toBeGreaterThan(text.indexOf('# Application'));
    expect(text.indexOf('CACHE_TTL=3600')).toBeLessThan(text.indexOf('# Database'));
  });

  it('preserva o prefixo `export ` ao substituir', () => {
    const env = parseEnv('export A=1\n');
    env.set('A', '2');
    expect(env.toString()).toBe('export A=2\n');
  });

  it('remove a linha sem apagar comentários vizinhos', () => {
    const env = parseEnv('# Auth\nJWT_SECRET=x\n# fim\n');
    expect(env.delete('JWT_SECRET')).toBe(true);
    expect(env.toString()).toBe('# Auth\n# fim\n');
    expect(env.delete('INEXISTENTE')).toBe(false);
  });
});

describe('serializeEnvValue', () => {
  it('mantém cru o valor simples', () => {
    expect(serializeEnvValue('localhost')).toBe('localhost');
    expect(serializeEnvValue('3000')).toBe('3000');
    expect(serializeEnvValue('')).toBe('');
  });

  it('aspas o valor ambíguo', () => {
    expect(serializeEnvValue('a b')).toBe('"a b"');
    expect(serializeEnvValue('a#b')).toBe('"a#b"');
    expect(serializeEnvValue('a"b')).toBe('"a\\"b"');
  });

  it('round-trip de valor com aspas', () => {
    const env = parseEnv('A="x y"\n');
    expect(env.get('A')).toBe('x y');
    env.set('A', 'p q');
    expect(parseEnv(env.toString()).get('A')).toBe('p q');
  });
});

describe('loadEnvFile / save', () => {
  it('devolve arquivo vazio (sem lançar) quando o arquivo não existe', () => {
    const env = loadEnvFile(join(dir, '.env'));
    expect(env.toString()).toBe('');
    expect(env.get('PORT')).toBeUndefined();
  });

  it('persiste com permissão 600 (dono só) — .env tem senha e JWT', () => {
    const path = join(dir, '.env');
    writeFileSync(path, 'PORT=3000\n');

    const env = loadEnvFile(path);
    env.set('DB_PASSWORD', 's3nh4');
    env.save();

    expect(readFileSync(path, 'utf-8')).toContain('DB_PASSWORD=s3nh4');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('round-trip completo preserva o arquivo byte a byte', () => {
    const path = join(dir, '.env');
    writeFileSync(path, SAMPLE);
    const env = loadEnvFile(path);
    env.save();
    expect(readFileSync(path, 'utf-8')).toBe(`${SAMPLE}\n`);
    expect(existsSync(path)).toBe(true);
  });

  it('EnvFile construído sem path exige caminho no save', () => {
    expect(() => parseEnv('A=1').save()).toThrow(/sem caminho/);
  });
});
