// @oktis-works/cms - Wizard interativo: menu principal, troca de idioma,
// catálogo de comandos e espelho de automação. Tudo hermético: IO falso,
// sonda de estado injetada e spawn falso (nenhum processo é criado).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { filterCommandNames, runWizard } from './wizard.js';
import type { WizardState } from './wizard-state.js';
import type { SpawnFn } from './wizard-run.js';
import type { PromptIO } from './prompt.js';

let dir: string;
let logs: string[];
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-wizard-'));
  logs = [];
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  logSpy.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

function fakeIO(lines: string[], isTTY = true): PromptIO & { out: () => string } {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(String(chunk));
      cb();
    },
  });
  setImmediate(() => input.end(lines.length > 0 ? `${lines.join('\n')}\n` : ''));
  return { input, output, isTTY, out: () => chunks.join('') };
}

function stateOf(overrides: Partial<WizardState> = {}): WizardState {
  return {
    isProject: true,
    envComplete: true,
    envMissing: 0,
    dockerUp: true,
    infraRunning: true,
    appsRunning: true,
    appsLabels: ['api'],
    ...overrides,
  };
}

function spawnRecorder(): { spawn: SpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  const spawn: SpawnFn = async (_exe, args) => {
    calls.push(args);
    return { code: 0, interrupted: false };
  };
  return { spawn, calls };
}

// ---------------------------------------------------------------------------

describe('runWizard entry rules', () => {
  it('falls back to the static help without a TTY (never a menu)', async () => {
    const io = fakeIO([], false);
    const code = await runWizard({ cwd: dir, io, stateFn: () => stateOf() });

    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('init'); // help estático, não o wizard
    expect(io.out()).not.toContain('OKCMS wizard');
  });
});

describe('main menu', () => {
  it('prints the banner with the language badge and exits cleanly', async () => {
    const io = fakeIO(['7']);
    const code = await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf() });

    expect(code).toBe(0);
    expect(io.out()).toContain('OKCMS wizard');
    expect(io.out()).toContain('language: en');
    expect(io.out()).toContain('bye');
  });

  it('switches the interface language mid-session (en → pt)', async () => {
    const io = fakeIO(['5', '2', '7']); // idioma → Português → sair
    const code = await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf() });

    expect(code).toBe(0);
    expect(io.out()).toContain('idioma: pt');
    expect(io.out()).toContain('Fluxos guiados'); // menu redesenhado em pt
    expect(io.out()).toContain('Sair');
  });

  it('prints the adaptive status from the probe (env incomplete)', async () => {
    const io = fakeIO(['4', '', '7']); // status → Enter para voltar → sair
    await runWizard({
      cwd: dir,
      io,
      lang: 'en',
      stateFn: () => stateOf({ envComplete: false, envMissing: 2 }),
    });

    const all = logs.join('\n');
    expect(all).toContain('Project status');
    expect(all).toContain('2 required variable(s) missing');
    expect(all).toContain('infrastructure: running');
  });

  it('warns when the directory is not an OkCMS project', async () => {
    const io = fakeIO(['7']);
    await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf({ isProject: false }) });

    expect(io.out()).toContain('no OkCMS project in this directory');
  });

  it('navigates flows → back → exit without running anything', async () => {
    const io = fakeIO(['1', '7', '7']); // fluxos → voltar → sair
    const { spawn, calls } = spawnRecorder();
    const code = await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf(), spawn });

    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(io.out()).toContain('Guided flows');
  });
});

describe('command catalog', () => {
  it('filters commands by name or description', () => {
    expect(filterCommandNames('System', 'status')).toContain('system:status');
    expect(filterCommandNames('System', 'does-not-exist')).toEqual([]);
  });

  it('runs a command through a subprocess and prints the automation mirror', async () => {
    // comando → grupo System → system:status (2º) → confirmar → sair
    // Groups: 1=Project, 2=Database, 3=Migration, 4=Extensions, 5=Deploy, 6=System
    const io = fakeIO(['2', '6', '2', 'y', '7']);
    const { spawn, calls } = spawnRecorder();

    await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf(), spawn });

    expect(io.out()).toContain('$ okcms system:status');
    expect(io.out()).toContain('finished with success');
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toBe('system:status');
  });

  it('marks destructive commands and demands an extra confirmation', async () => {
    // comando → Database → db:rollback (2º) → sem opcionais → aceita o perigo → sair
    const io = fakeIO(['2', '2', '2', 'n', 'y', '7']);
    const { spawn, calls } = spawnRecorder();

    await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf(), spawn });

    expect(io.out()).toContain('DESTRUCTIVE');
    expect(io.out()).toContain('can destroy data');
    expect(io.out()).toContain('$ okcms db:rollback');
    expect(calls[0]![1]).toBe('db:rollback');
  });

  it('does not spawn when the dangerous command is declined', async () => {
    const io = fakeIO(['2', '2', '2', 'n', 'n', '7']); // recusa no confirm final
    const { spawn, calls } = spawnRecorder();

    await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf(), spawn });

    expect(calls).toEqual([]);
    expect(io.out()).toContain('cancelled — nothing was executed');
  });

  it('refuses the env interview outside a project', async () => {
    const io = fakeIO(['3', '7']); // env → sair
    await runWizard({ cwd: dir, io, lang: 'en', stateFn: () => stateOf({ isProject: false }) });

    expect(io.out()).toContain('no .env to edit');
  });
});
