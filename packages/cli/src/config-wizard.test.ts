// @oktis-works/cms - Wizard `okcms config` (F1)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { runConfigWizard, maskValue, parseSetArgs, planSet, displayValue } from './config-wizard.js';
import { ENV_FIELDS, ENV_SECTIONS, validateField, fieldsForSection } from './env-schema.js';
import { Prompt, type PromptIO } from './prompt.js';

let dir: string;
let logs: string[];
let errors: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-config-'));
  logs = [];
  errors = [];
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  errSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

const SEED = `# OkCMS
# Application
NODE_ENV=development
PORT=3000                     # porta da api

# Auth
JWT_SECRET=change-me-in-production
DB_PASSWORD=postgres
`;

function writeEnv(contents = SEED): void {
  writeFileSync(join(dir, '.env'), contents);
}

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

// ---------------------------------------------------------------------------

describe('ENV_FIELDS catalog', () => {
  it('every referenced section exists', () => {
    const ids = new Set(ENV_SECTIONS.map((s) => s.id));
    for (const field of ENV_FIELDS) {
      expect(ids.has(field.section)).toBe(true);
    }
  });

  it('no duplicate keys', () => {
    const keys = ENV_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every field has label = key, a description and coherent validation', () => {
    for (const field of ENV_FIELDS) {
      expect(field.label).toBe(field.key);
      expect(field.description.length).toBeGreaterThan(3);
      // o default do próprio campo precisa passar na própria validação
      if (field.default !== undefined) {
        expect(validateField(field, field.default)).toBeNull();
      }
    }
  });

  it('enum has options; required secret is enforced', () => {
    for (const field of ENV_FIELDS.filter((f) => f.type === 'enum')) {
      expect(field.options?.length).toBeGreaterThan(1);
    }
    const required = ENV_FIELDS.filter((f) => f.required);
    expect(required.map((f) => f.key)).toContain('JWT_SECRET');
    expect(required.map((f) => f.key)).toContain('DB_PASSWORD');
  });

  it('without DATABASE_URL the DB_* fields appear; with URL they vanish', () => {
    expect(fieldsForSection('database', {}).map((f) => f.key)).toContain('DB_HOST');
    expect(
      fieldsForSection('database', { DATABASE_URL: 'postgres://u:p@h:5432/db' }).map((f) => f.key)
    ).not.toContain('DB_HOST');
  });

  it('STORAGE_LOCAL_PATH only exists when the driver is local', () => {
    expect(fieldsForSection('storage', { STORAGE_DRIVER: 'local' }).map((f) => f.key)).toContain(
      'STORAGE_LOCAL_PATH'
    );
    expect(fieldsForSection('storage', { STORAGE_DRIVER: 's3' }).map((f) => f.key)).not.toContain(
      'STORAGE_LOCAL_PATH'
    );
  });
});

describe('validateField', () => {
  const byKey = (key: string): (typeof ENV_FIELDS)[number] =>
    ENV_FIELDS.find((f) => f.key === key)!;

  it('out-of-range port is rejected', () => {
    expect(validateField(byKey('PORT'), '99999')).toMatch(/range/);
    expect(validateField(byKey('PORT'), 'abc')).toMatch(/port number/);
    expect(validateField(byKey('PORT'), '8080')).toBeNull();
  });

  it('boolean locked to true/false', () => {
    expect(validateField(byKey('DB_SSL'), 'sim')).toMatch(/true or false/);
    expect(validateField(byKey('DB_SSL'), 'true')).toBeNull();
  });

  it('enum restricted to the options', () => {
    expect(validateField(byKey('NODE_ENV'), 'staging')).toMatch(/development/);
    expect(validateField(byKey('NODE_ENV'), 'production')).toBeNull();
  });

  it('duration in 15m / 7d format', () => {
    expect(validateField(byKey('JWT_EXPIRES_IN'), '15 minutos')).toMatch(/15m/);
    expect(validateField(byKey('JWT_EXPIRES_IN'), '2h')).toBeNull();
  });

  it('DATABASE_URL must be a database URL', () => {
    expect(validateField(byKey('DATABASE_URL'), 'http://x')).toMatch(/postgres:\/\//);
    expect(validateField(byKey('DATABASE_URL'), 'postgresql://u:p@h:5432/db')).toBeNull();
  });

  it('JWT_SECRET requires 16+ characters', () => {
    expect(validateField(byKey('JWT_SECRET'), 'curto')).toMatch(/16/);
    expect(validateField(byKey('JWT_SECRET'), 'x'.repeat(20))).toBeNull();
  });

  it('required field does not accept empty', () => {
    expect(validateField(byKey('DB_PASSWORD'), '')).toMatch(/is required/);
    expect(validateField(byKey('CACHE_PREFIX'), '')).toBeNull();
  });
});

describe('parseSetArgs / planSet', () => {
  it('splits pairs accumulated by the parser', () => {
    expect(parseSetArgs('A=1\nB=2')).toEqual(['A=1', 'B=2']);
    expect(parseSetArgs(undefined)).toEqual([]);
    expect(parseSetArgs('sem-igual')).toEqual([]);
  });

  it('builds the plan with valid pairs only', () => {
    const { plan, errors } = planSet(['PORT=8080', 'NODE_ENV=production']);
    expect(errors).toEqual([]);
    expect(plan.map((p) => p.key)).toEqual(['PORT', 'NODE_ENV']);
  });

  it('accumulates ALL errors (does not stop at the first)', () => {
    const { plan, errors } = planSet(['PORT=99999', 'NOPE=1', 'XYZ=1']);
    expect(plan).toEqual([]);
    expect(errors).toHaveLength(3);
    expect(errors.join(' ')).toContain('out of range');
    expect(errors.join(' ')).toContain('unknown key');
  });

  it('rejects a malformed key', () => {
    expect(planSet(['1BAD=x']).errors[0]).toMatch(/invalid key/);
  });
});

describe('maskValue / displayValue', () => {
  it('never returns the raw value', () => {
    expect(maskValue('senha-secreta')).not.toContain('senha');
    expect(maskValue('')).toBe('(not set)');
  });

  it('displayValue masks secrets only', () => {
    const secret = ENV_FIELDS.find((f) => f.key === 'DB_PASSWORD')!;
    const plain = ENV_FIELDS.find((f) => f.key === 'PORT')!;
    expect(displayValue(secret, 'hunter2')).not.toContain('hunter2');
    expect(displayValue(plain, '3000')).toBe('3000');
    expect(displayValue(plain, '')).toBe('(empty)');
  });
});

// ---------------------------------------------------------------------------

describe('runConfigWizard --set', () => {
  it('saves the keys and keeps the rest of the file', async () => {
    writeEnv();
    const code = await runConfigWizard({ set: 'PORT=8080\nNODE_ENV=production', cwd: dir });

    expect(code).toBe(0);
    const text = readFileSync(join(dir, '.env'), 'utf-8');
    expect(text).toContain('PORT=8080                     # porta da api');
    expect(text).toContain('NODE_ENV=production');
    expect(text).toContain('# OkCMS');
    expect(logs.join('\n')).toContain('2 key(s) saved');
  });

  it('leaves .env with permission 600', async () => {
    writeEnv();
    await runConfigWizard({ set: 'PORT=3001', cwd: dir });
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
  });

  it('invalid value saves nothing (validation is atomic)', async () => {
    writeEnv();
    const code = await runConfigWizard({ set: 'PORT=99999', cwd: dir });

    expect(code).toBe(1);
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toBe(SEED);
    expect(errors.join('\n')).toContain('out of range');
  });

  it('unknown key is rejected with a --list hint', async () => {
    writeEnv();
    const code = await runConfigWizard({ set: 'HACK=1', cwd: dir });

    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('--list');
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toBe(SEED);
  });

  it('does not rewrite when the value is already the same', async () => {
    writeEnv();
    const code = await runConfigWizard({ set: 'PORT=3000', cwd: dir });

    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('nothing to change');
  });

  it('secret never shows up in the CLI log', async () => {
    writeEnv();
    await runConfigWizard({ set: 'DB_PASSWORD=nova-senha-super-secreta', cwd: dir });

    expect(logs.join('\n')).not.toContain('nova-senha-super-secreta');
    expect(logs.join('\n')).toContain('DB_PASSWORD=');
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toContain('nova-senha-super-secreta');
  });

  it('creates .env from the example when it does not exist', async () => {
    writeFileSync(join(dir, '.env.example'), 'PORT=3000\nNODE_ENV=development\n');

    const code = await runConfigWizard({ set: 'PORT=4000', cwd: dir });

    expect(code).toBe(0);
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toContain('PORT=4000');
  });
});

describe('runConfigWizard --list', () => {
  it('lists by section with secrets masked', async () => {
    writeEnv();
    const code = await runConfigWizard({ list: true, cwd: dir });

    expect(code).toBe(0);
    const out = logs.join('\n');
    expect(out).toContain('# Authentication');
    expect(out).toContain('PORT=3000');
    expect(out).not.toContain('JWT_SECRET=change-me-in-production');
    expect(out).not.toContain('DB_PASSWORD=postgres');
  });

  it('--show-secrets unlocks the raw read', async () => {
    writeEnv();
    await runConfigWizard({ list: true, showSecrets: true, cwd: dir });

    expect(logs.join('\n')).toContain('JWT_SECRET=change-me-in-production');
  });

  it('--non-interactive is machine output', async () => {
    writeEnv();
    const code = await runConfigWizard({ nonInteractive: true, cwd: dir });
    expect(code).toBe(0);
  });
});

describe('runConfigWizard without flags', () => {
  it('without TTY explains the alternatives and exits with 1', async () => {
    writeEnv();
    const input = new PassThrough();
    const output = new Writable({
      write(_c, _e, cb): void {
        cb();
      },
    });
    input.end();

    const code = await runConfigWizard({ cwd: dir, io: { input, output, isTTY: false } });

    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('--set');
    expect(errors.join('\n')).toContain('--list');
  });
});

describe('runConfigWizard container guard', () => {
  it('refuses to run with the CLI inside a container', async () => {
    writeEnv();
    const previous = process.env['OKCMS_IN_CONTAINER'];
    process.env['OKCMS_IN_CONTAINER'] = '1';

    try {
      const code = await runConfigWizard({ set: 'PORT=1', cwd: dir });
      expect(code).toBe(1);
      expect(errors.join('\n')).toContain('container');
      expect(readFileSync(join(dir, '.env'), 'utf-8')).toBe(SEED);
    } finally {
      if (previous === undefined) delete process.env['OKCMS_IN_CONTAINER'];
      else process.env['OKCMS_IN_CONTAINER'] = previous;
    }
  });

  it('--force is the conscious escape hatch', async () => {
    writeEnv();
    const previous = process.env['OKCMS_IN_CONTAINER'];
    process.env['OKCMS_IN_CONTAINER'] = '1';

    try {
      const code = await runConfigWizard({ set: 'PORT=3001', cwd: dir, force: true });
      expect(code).toBe(0);
      expect(existsSync(join(dir, '.env'))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env['OKCMS_IN_CONTAINER'];
      else process.env['OKCMS_IN_CONTAINER'] = previous;
    }
  });
});

describe('runConfigWizard interactive', () => {
  it('navigates a section, changes a key and saves only after confirmation', async () => {
    writeEnv();

    // 1 = seção "Application" → 6 campos; Enter mantém; PORT vira 8080;
    // depois: não a mais seções → grava
    const lines = ['1', '', '', '8080', '', '', '', 'n', 'y'];
    const io = fakeIO(lines);

    const code = await runConfigWizard({ cwd: dir, io });

    expect(code).toBe(0);
    expect(io.out()).toContain('OkCMS config');
    expect(io.out()).toContain('Application');
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toContain('PORT=8080');
  });

  it('does not save when the operator refuses the confirmation', async () => {
    writeEnv();

    const lines = ['1', '', '', '8080', '', '', '', 'n', 'n'];
    const code = await runConfigWizard({ cwd: dir, io: fakeIO(lines) });

    expect(code).toBe(0);
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toBe(SEED);
  });

  it('unknown section in --section is rejected', async () => {
    writeEnv();
    const io = fakeIO([]);
    const code = await runConfigWizard({ cwd: dir, io, section: 'nope' });

    expect(code).toBe(1);
    expect(io.out()).toContain('unknown section');
  });

  it('generates a strong JWT_SECRET when the current one is a placeholder', async () => {
    writeEnv();

    // 4 = seção "Authentication" → JWT_SECRET placeholder → gerar → demais campos
    const authFields = fieldsForSection('auth', {});
    const lines = [
      '4', // seção Authentication
      'y', // gerar JWT_SECRET
      ...authFields
        .filter((f) => f.key !== 'JWT_SECRET')
        .map(() => ''), // Enter mantém
      'n', // não editar outra seção
      'y', // gravar
    ];

    const code = await runConfigWizard({ cwd: dir, io: fakeIO(lines) });

    expect(code).toBe(0);
    const text = readFileSync(join(dir, '.env'), 'utf-8');
    const match = /JWT_SECRET=(.+)/.exec(text);
    expect(match?.[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(text).not.toContain('change-me-in-production');
  });
});

describe('Prompt as a wizard dependency', () => {
  it('accepts an already-built Prompt (reused by update)', async () => {
    writeEnv();
    const io = fakeIO(['1', '', '', '99999', '', '', '', 'n', 'n']);
    const prompt = new Prompt(io);

    const code = await runConfigWizard({ cwd: dir, prompt });

    expect(code).toBe(0);
    // porta inválida re-consulta — o valor do arquivo não muda
    expect(io.out()).toContain('range');
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toBe(SEED);
  });
});
