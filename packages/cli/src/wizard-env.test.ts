// @oktis-works/cms - Wizard: entrevista de env (47 campos, explicativa)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { runEnvInterview } from './wizard-env.js';
import { catalogFor } from './wizard-i18n.js';
import { ENV_FIELDS, ENV_SECTIONS } from './env-schema.js';
import { looksLikeSecret } from './guards.js';
import { Prompt, type PromptIO } from './prompt.js';

let dir: string;
/** A entrevista sincroniza process.env ao salvar — restaura entre testes. */
let envSnapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-wizenv-'));
  envSnapshot = { ...process.env };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
});

function fakeIO(lines: string[]): PromptIO & { out: () => string } {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(String(chunk));
      cb();
    },
  });
  setImmediate(() => input.end(`${lines.join('\n')}\n`));
  return { input, output, isTTY: true, out: () => chunks.join('') };
}

function writeEnv(contents: string): void {
  writeFileSync(join(dir, '.env'), contents);
}

function readEnv(): string {
  return readFileSync(join(dir, '.env'), 'utf-8');
}

/**
 * Monta as respostas linha a linha NA ORDEM EXATA em que a entrevista pergunta.
 * Reimplementa o mesmo filtro `when` da entrevista, partindo do MESMO record
 * inicial (o conteúdo do .env que o teste acabou de escrever) — senão uma
 * resposta desalinha quando um campo condicional é pulado.
 */
function answersFor(overrides: Record<string, string>, finalConfirm?: 'y' | 'n'): string[] {
  const record: Record<string, string> = {};
  let seed = '';
  try {
    seed = readFileSync(join(dir, '.env'), 'utf-8');
  } catch {
    // sem .env ainda: entrevista parte de um registro vazio
  }
  for (const line of seed.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) record[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const lines: string[] = [];

  // O wizard agora só pergunta campos ESSENCIAIS (essential: true) + os
  // selects de engine e mode. Restante é configurado com okcms config.

  for (const section of ENV_SECTIONS) {
    if (section.id === 'database') {
      // 1. Engine select (1 resposta: '1'=postgres, '2'=mysql, '3'=mariadb)
      const engine = overrides['DB_ENGINE'] ?? '1';
      lines.push(engine);
      record['DB_ENGINE'] = engine === '1' ? 'postgres' : engine === '2' ? 'mysql' : 'mariadb';

      // 2. Mode select (1 resposta: '1'=connectionString, '2'=individual)
      const mode = overrides['DB_MODE'] ?? '2';
      lines.push(mode);
      if (mode === '1') {
        record['DATABASE_URL'] = overrides['DATABASE_URL'] ?? 'postgresql://user:pass@host:5432/db';
        record['__db_mode'] = 'connectionString';
      } else {
        record['__db_mode'] = 'individual';
      }

      // 3. Campos database ESSENCIAIS (DB_ENGINE e DATABASE_URL excluídos)
      for (const field of ENV_FIELDS) {
        if (field.section !== 'database') continue;
        if (!field.essential) continue;
        if (field.when && !field.when(record)) continue;
        if (field.key === 'DB_ENGINE') continue; // já tratado pelo engine select
        if (field.key === 'DATABASE_URL') continue; // filtrado no modo individual

        const answer = overrides[field.key] ?? '';
        lines.push(answer);
        if (answer !== '') record[field.key] = answer;
      }
    } else {
      for (const field of ENV_FIELDS) {
        if (field.section !== section.id) continue;
        if (!field.essential) continue;
        if (field.when && !field.when(record)) continue;

        if (field.key === 'JWT_SECRET' && !looksLikeSecret(record['JWT_SECRET'] ?? '')) {
          const gen = overrides['JWT_SECRET_GENERATE'] ?? '';
          lines.push(gen);
          const declined = ['n', 'no'].includes(gen.trim().toLowerCase());
          if (declined) {
            lines.push(overrides['JWT_SECRET'] ?? '');
            if ((overrides['JWT_SECRET'] ?? '') !== '') record['JWT_SECRET'] = overrides['JWT_SECRET']!;
          } else {
            record['JWT_SECRET'] = 'generated-by-interview';
          }
          continue;
        }

        const answer = overrides[field.key] ?? '';
        lines.push(answer);
        if (answer !== '') record[field.key] = answer;
      }
    }
  }

  if (finalConfirm) lines.push(finalConfirm);
  return lines;
}

// ---------------------------------------------------------------------------

describe('catalog completeness', () => {
  it('pt and en catalogs define the same keys', () => {
    const en = catalogFor('en') as unknown as Record<string, unknown>;
    const pt = catalogFor('pt') as unknown as Record<string, unknown>;
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });
});

describe('ENV_FIELDS sizing (wizard promises all fields)', () => {
  it('has 48 fields across 10 sections (DB_ENGINE added)', () => {
    expect(ENV_FIELDS.length).toBe(48);
    expect(ENV_SECTIONS.length).toBe(10);
  });
});

describe('runEnvInterview', () => {
  it('offers the skip option when used inside a guided flow', async () => {
    writeEnv('NODE_ENV=development\n');
    const io = fakeIO(['2']); // 2ª opção do menu = skip
    const prompt = new Prompt(io);

    const result = await runEnvInterview(
      { prompt, catalog: catalogFor('en'), cwd: dir },
      { skipOption: true }
    );
    prompt.close();

    expect(result.status).toBe('nothing');
    expect(readEnv()).toBe('NODE_ENV=development\n');
  });

  it('keeps everything when the user presses Enter on a complete .env', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'DB_PASSWORD=postgres',
        'DB_ENGINE=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const io = fakeIO(answersFor({}));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    prompt.close();

    expect(result.status).toBe('nothing');
    expect(readEnv()).toContain('DB_PASSWORD=postgres');
  });

  it('writes a changed DB_HOST after confirming the summary', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'DB_HOST=db.local',
        'DB_PASSWORD=postgres',
        'DB_ENGINE=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const io = fakeIO(answersFor({ DB_HOST: 'db.remoto' }, 'y'));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    prompt.close();

    expect(result.status).toBe('saved');
    expect(result.changed).toContain('DB_HOST');
    expect(readEnv()).toContain('DB_HOST=db.remoto');
    // salvar NÃO deixa o processo com snapshot antigo: os filhos spawnados
    // pelo menu (okcms dev) herdam o valor recém-gravado da .env da raiz
    expect(process.env['DB_HOST']).toBe('db.remoto');
  });

  it('discards everything when the summary is not confirmed', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'DB_HOST=db.local',
        'DB_PASSWORD=postgres',
        'DB_ENGINE=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const io = fakeIO(answersFor({ DB_HOST: 'db.remoto' }, 'n'));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    prompt.close();

    expect(result.status).toBe('cancelled');
    expect(readEnv()).toContain('DB_HOST=db.local');
    expect(readEnv()).not.toContain('DB_HOST=db.remoto');
  });

  it('masks a secret in the review summary (never echoes the typed value)', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'DB_PASSWORD=postgres-antiga',
        'DB_ENGINE=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const typed = 'nova-senha-em-producao-123';
    const io = fakeIO(answersFor({ DB_PASSWORD: typed }, 'y'));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    const output = io.out();
    prompt.close();

    expect(result.status).toBe('saved');
    expect(result.changed).toContain('DB_PASSWORD');
    // o valor digitado de um secret NUNCA aparece no eco (mascarado no summary)
    expect(output).not.toContain(typed);
    expect(readEnv()).toContain('DB_PASSWORD=');
  });

  it('does not materialize a key when the default is accepted (Enter on empty)', async () => {
    // obrigatórios semeados (senão a entrevista re-pergunta); REDIS_PORT tem
    // default e não é obrigatório: Enter não deve gravar a chave
    writeEnv(
      [
        'NODE_ENV=development',
        'DB_PASSWORD=postgres',
        'DB_ENGINE=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const io = fakeIO(answersFor({}));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    prompt.close();

    expect(result.status).toBe('nothing');
    expect(readEnv()).not.toContain('REDIS_PORT=');
  });

  it('runs from a missing .env without crashing (starts empty)', async () => {
    // sem .env: respondemos os 2 obrigatórios e descartamos no fim
    const io = fakeIO(
      answersFor({ DB_ENGINE: '1', DB_PASSWORD: 'senha-forte-qualquer-123', JWT_SECRET: 'jwt-seguro-bem-longo-32-bytes-xxxx' }, 'n')
    );
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('pt'), cwd: dir });
    prompt.close();

    expect(['saved', 'cancelled', 'nothing']).toContain(result.status);
  });
});
