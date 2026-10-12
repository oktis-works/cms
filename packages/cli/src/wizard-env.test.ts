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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-wizenv-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
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
  for (const section of ENV_SECTIONS) {
    // seção de banco: antes dos campos, pergunta o modo de conexão
    if (section.id === 'database') {
      // default 'individual' = opção 2 no menu numerado
      const mode = overrides['DB_MODE'] ?? '2';
      lines.push(mode);
      if (mode === '1') {
        // modo connection string: DATABASE_URL será perguntado, DB_PASSWORD gerado auto
        // sobrescreve record para que o when dos DB_* pule
        record['DATABASE_URL'] = overrides['DATABASE_URL'] ?? 'postgresql://user:pass@host:5432/db';
      } else {
        // modo individual: campos DB_* normais
      }
    }

    for (const field of ENV_FIELDS) {
      if (field.section !== section.id) continue;
      if (field.when && !field.when(record)) continue;

      // JWT_SECRET fraco/ausente ganha UM prompt extra ("gerar um forte?") ANTES
      // do campo — precisa de uma resposta própria, senão tudo desalinha.
      if (field.key === 'JWT_SECRET' && !looksLikeSecret(record['JWT_SECRET'] ?? '')) {
        const gen = overrides['JWT_SECRET_GENERATE'] ?? '';
        lines.push(gen);
        const declined = ['n', 'no'].includes(gen.trim().toLowerCase());
        if (declined) {
          lines.push(overrides['JWT_SECRET'] ?? '');
          if ((overrides['JWT_SECRET'] ?? '') !== '') record['JWT_SECRET'] = overrides['JWT_SECRET']!;
        } else {
          // aceitou o gerado: o campo em si não é perguntado e entra no plano
          record['JWT_SECRET'] = 'generated-by-interview';
        }
        continue;
      }

      const answer = overrides[field.key] ?? '';
      lines.push(answer);
      // resposta vazia não altera o record; valor sim (alimenta os `when` seguintes)
      if (answer !== '') record[field.key] = answer;
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

describe('ENV_FIELDS sizing (wizard promises all 47)', () => {
  it('has 47 fields across 10 sections', () => {
    expect(ENV_FIELDS.length).toBe(47);
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

  it('writes a changed PORT after confirming the summary', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'PORT=3000',
        'DB_PASSWORD=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const io = fakeIO(answersFor({ PORT: '4000' }, 'y'));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    prompt.close();

    expect(result.status).toBe('saved');
    expect(result.changed).toContain('PORT');
    expect(readEnv()).toContain('PORT=4000');
  });

  it('discards everything when the summary is not confirmed', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'PORT=3000',
        'DB_PASSWORD=postgres',
        'JWT_SECRET=uma-chave-segura-de-32-bytes-bem-longa',
        '',
      ].join('\n')
    );
    const io = fakeIO(answersFor({ PORT: '4000' }, 'n'));
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('en'), cwd: dir });
    prompt.close();

    expect(result.status).toBe('cancelled');
    expect(readEnv()).toContain('PORT=3000');
    expect(readEnv()).not.toContain('PORT=4000');
  });

  it('masks a secret in the review summary (never echoes the typed value)', async () => {
    writeEnv(
      [
        'NODE_ENV=development',
        'DB_PASSWORD=postgres-antiga',
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
      answersFor({ DB_PASSWORD: 'senha-forte-qualquer-123', JWT_SECRET: 'jwt-seguro-bem-longo-32-bytes-xxxx' }, 'n')
    );
    const prompt = new Prompt(io);

    const result = await runEnvInterview({ prompt, catalog: catalogFor('pt'), cwd: dir });
    prompt.close();

    expect(['saved', 'cancelled', 'nothing']).toContain(result.status);
  });
});
