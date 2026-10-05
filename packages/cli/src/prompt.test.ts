// @oktis-works/cms - Primitivas de prompt (wizard TTY) — F0

import { describe, it, expect, afterEach } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { Prompt, select, confirm, style, symbol, type PromptIO } from './prompt.js';

/** Writable que acumula tudo para as asserções. */
function collector(): { output: Writable; out: () => string } {
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback): void {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { output, out: () => chunks.join('') };
}

/** Cria um par input/output sintético. `lines` chega como um pipe fechado. */
function fakeIO(lines: string[], isTTY = false): PromptIO & { out: () => string } {
  const input = new PassThrough();
  const { output, out } = collector();

  // entrega tudo de uma vez — o buffer interno enfileira as linhas
  setImmediate(() => input.end(lines.join('\n') + (lines.length ? '\n' : '')));

  return { input, output, isTTY, out };
}

/** TTY falso: `isTTY` + `setRawMode` para exercitar a máscara de segredo. */
class FakeTTY extends PassThrough {
  isTTY = true;
  raw = false;
  setRawMode(mode: boolean): this {
    this.raw = mode;
    return this;
  }
}

function ttyIO(chunks: string[]): PromptIO & { out: () => string; stream: FakeTTY } {
  const stream = new FakeTTY();
  const { output, out } = collector();

  setImmediate(() => stream.write(chunks.join('')));

  return { input: stream, output, isTTY: true, out, stream };
}

describe('Prompt.select', () => {
  it('escolhe pela numeração digitada', async () => {
    const io = fakeIO(['2'], true);
    const prompt = new Prompt(io);
    const value = await prompt.select('Modo', [
      { value: 'download', label: 'Download' },
      { value: 'deploy', label: 'Deploy' },
      { value: 'exit', label: 'Sair' },
    ]);
    prompt.close();

    expect(value).toBe('deploy');
    expect(io.out()).toContain('1)');
    expect(io.out()).toContain('3)');
    expect(io.out()).toContain(symbol.ask);
  });

  it('Enter aceita o default', async () => {
    const io = fakeIO([''], true);
    const prompt = new Prompt(io);
    const value = await prompt.select('Modo', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], {
      defaultValue: 'b',
    });
    prompt.close();
    expect(value).toBe('b');
  });

  it('re-consulta em opção inválida e reporta o erro', async () => {
    const io = fakeIO(['9', '1'], true);
    const prompt = new Prompt(io);
    const value = await prompt.select('Modo', [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }]);
    prompt.close();

    expect(value).toBe('x');
    expect(io.out()).toContain('invalid option');
  });

  it('modo não-interativo devolve o default (CI nunca escolhe sozinho)', async () => {
    const io = fakeIO([], false);
    const prompt = new Prompt(io);
    const value = await prompt.select('Modo', [{ value: 'download', label: 'D' }], {
      defaultValue: 'download',
    });
    prompt.close();
    expect(value).toBe('download');
  });

  it('modo não-interativo SEM default lança erro (não dispara deploy por acidente)', async () => {
    const prompt = new Prompt(fakeIO([], false));
    await expect(
      prompt.select('Deploy?', [{ value: 'yes', label: 'Sim' }], {
        nonInteractiveError: 'use --mode',
      })
    ).rejects.toThrow('use --mode');
    prompt.close();
  });

  it('EOF antes de resposta cai no default em vez de pendurar', async () => {
    const prompt = new Prompt(fakeIO([], true));
    const value = await prompt.select('Modo', [{ value: 'z', label: 'Z' }], { defaultValue: 'z' });
    prompt.close();
    expect(value).toBe('z');
  });
});

describe('Prompt.select (arrow keys em TTY)', () => {
  // Sequências montadas sem literais de escape: ESC = charCode 27.
  const ESC = String.fromCharCode(27);
  const UP = `${ESC}[A`;
  const DOWN = `${ESC}[B`;
  const RIGHT = `${ESC}[C`;
  const ENTER = '\r';

  const MODES = [
    { value: 'download', label: 'Download' },
    { value: 'deploy', label: 'Deploy' },
    { value: 'exit', label: 'Exit' },
  ];

  it('setas cima/baixo movem o cursor e Enter confirma', async () => {
    const io = ttyIO([DOWN, DOWN, ENTER]);
    const prompt = new Prompt(io);
    const value = await prompt.select('Mode', MODES);
    prompt.close();

    expect(value).toBe('exit');
    expect(io.out()).toContain('↑↓ move · enter confirm');
    expect(io.out()).toContain(symbol.cursor);
  });

  it('seta cima a partir do primeiro item volta para o último', async () => {
    const io = ttyIO([UP, ENTER]);
    const prompt = new Prompt(io);
    const value = await prompt.select('Mode', MODES, { defaultValue: 'download' });
    prompt.close();

    expect(value).toBe('exit');
  });

  it('o default já nasce selecionado — Enter sozinho aceita', async () => {
    const io = ttyIO([ENTER]);
    const prompt = new Prompt(io);
    const value = await prompt.select('Mode', MODES, { defaultValue: 'deploy' });
    prompt.close();
    expect(value).toBe('deploy');
  });

  it('confirm usa setas esquerda/direita e aceita y/n', async () => {
    const right = new Prompt(ttyIO([RIGHT, ENTER]));
    expect(await right.confirm('Deploy?', { defaultValue: true })).toBe(false);
    right.close();

    const shortcut = new Prompt(ttyIO(['y']));
    expect(await shortcut.confirm('Deploy?')).toBe(true);
    shortcut.close();

    const no = new Prompt(ttyIO(['n']));
    expect(await no.confirm('Deploy?', { defaultValue: true })).toBe(false);
    no.close();
  });

  it('sai do raw mode ao terminar (o próximo prompt lê linha normal)', async () => {
    const io = ttyIO([ENTER]);
    const prompt = new Prompt(io);
    await prompt.select('Mode', MODES, { defaultValue: 'deploy' });
    prompt.close();
    expect(io.stream.raw).toBe(false);
  });
});

describe('Prompt.confirm', () => {
  it('accepts y/yes and n/no', async () => {
    const yes = new Prompt(fakeIO(['y'], true));
    expect(await yes.confirm('Backup?')).toBe(true);
    yes.close();

    const no = new Prompt(fakeIO(['no'], true));
    expect(await no.confirm('Backup?')).toBe(false);
    no.close();
  });

  it('Enter usa o default declarado', async () => {
    const prompt = new Prompt(fakeIO([''], true));
    expect(await prompt.confirm('Backup?', { defaultValue: true })).toBe(true);
    prompt.close();
  });

  it('modo não-interativo devolve o default sem ler stdin', async () => {
    const prompt = new Prompt(fakeIO(['sim'], false));
    expect(await prompt.confirm('Backup?', { defaultValue: false })).toBe(false);
    prompt.close();
  });
});

describe('Prompt.ask', () => {
  it('valida e re-consulta até aceitar', async () => {
    const prompt = new Prompt(fakeIO(['abc', '42'], true));
    const value = await prompt.ask('Porta', {
      validate: (v) => (Number.isNaN(Number(v)) ? 'digite um número' : null),
    });
    prompt.close();

    expect(value).toBe('42');
  });

  it('Enter mantém o valor default', async () => {
    const prompt = new Prompt(fakeIO([''], true));
    expect(await prompt.ask('Host', { default: 'localhost' })).toBe('localhost');
    prompt.close();
  });

  it('não-interativo exige default ou falha com mensagem clara', async () => {
    const ok = new Prompt(fakeIO([], false));
    expect(await ok.ask('Host', { default: 'db' })).toBe('db');
    ok.close();

    const bad = new Prompt(fakeIO([], false));
    await expect(bad.ask('Host')).rejects.toThrow(/non-interactive/);
    bad.close();
  });
});

describe('Prompt.secret (máscara)', () => {
  it('em TTY lê sem ecoar o valor e imprime * por caractere', async () => {
    const io = ttyIO(['minha-senha-secreta\r']);
    const prompt = new Prompt(io);
    const value = await prompt.secret('JWT_SECRET');

    expect(value).toBe('minha-senha-secreta');
    expect(io.out()).toContain('*');
    expect(io.out()).not.toContain('minha-senha-secreta');
    prompt.close();
  });

  it('sem TTY cai para a leitura normal de linha (pipe)', async () => {
    const prompt = new Prompt(fakeIO(['senha-vinda-do-pipe'], false));
    expect(await prompt.secret('DB_PASSWORD')).toBe('senha-vinda-do-pipe');
    prompt.close();
  });

  it('Enter no segredo devolve o default (manter o valor atual)', async () => {
    const io = ttyIO(['\r']);
    const prompt = new Prompt(io);
    expect(await prompt.secret('DB_PASSWORD', { default: 'atual' })).toBe('atual');
    prompt.close();
  });
});

describe('helpers one-shot', () => {
  it('select e confirm funcionam sem instanciar a classe', async () => {
    expect(
      await select('X', [{ value: 1, label: 'um' }], { defaultValue: 1 }, fakeIO([], false))
    ).toBe(1);

    expect(await confirm('Ok?', { defaultValue: true }, fakeIO([], false))).toBe(true);
  });
});

describe('estilo', () => {
  afterEach(() => {
    delete process.env['NO_COLOR'];
  });

  it('NO_COLOR desliga o ANSI (log limpo em CI e em pipe)', () => {
    process.env['NO_COLOR'] = '1';
    expect(style.red('x')).toBe('x');
    expect(style.bold('x')).toBe('x');
    expect(style.dim('x')).toBe('x');
  });

  it('com cor habilitada pinta o texto (sem TTY o ANSI fica desligado)', () => {
    delete process.env['NO_COLOR'];
    const original = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      const painted = style.red('x');
      expect(painted).not.toBe('x');
      expect(painted).toContain('x');
      expect(painted).toContain('31m');
      expect(style.bold('x')).toContain('1m');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
    }
  });

  it('símbolos são os mesmos usados pelos demais comandos', () => {
    expect(symbol.ok).toBe('✓');
    expect(symbol.fail).toBe('✗');
    expect(symbol.ask).toBe('?');
  });
});
