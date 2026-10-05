// @oktis-works/cms - Interactive prompt primitives (TTY wizard, zero deps)
//
// The CLI parser has no TUI dependency and we are not adding one: a small
// `readline` of our own resolves select/confirm/input/mask with three
// guarantees a third-party library would not give for free here:
//   1. deterministic non-interactive fallback (CI/pipes) → flags;
//   2. secret mask with NO echo (raw mode only when stdin is a real TTY);
//   3. injectable IO → testable without a real terminal.
//
// Menus are ARROW-KEY driven (↑/↓ + Enter) whenever the terminal supports raw
// mode. Terminals that cannot do raw mode (SSH without TTY, pipes, tests) get
// the numbered menu (1/2/3) — same code path, same semantics — and CI always
// falls back to the flag/default instead of guessing.

import type { Readable, Writable } from 'node:stream';

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

type RawStream = Readable & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
};

export interface PromptIO {
  input: Readable;
  output: Writable;
  /** true somente quando há terminal nos DOIS lados (TTY de verdade). */
  isTTY: boolean;
}

export function defaultIO(): PromptIO {
  const input = process.stdin as RawStream;
  const output = process.stdout;
  return { input, output, isTTY: Boolean(input.isTTY && output.isTTY) };
}

// ---------------------------------------------------------------------------
// Estilo (ANSI condicional — sem cor quando NO_COLOR ou sem TTY)
// ---------------------------------------------------------------------------

const colorEnabled = (): boolean =>
  !process.env['NO_COLOR'] && Boolean(process.stdout.isTTY);

function wrap(open: number, close: number): (text: string) => string {
  return (text: string): string =>
    colorEnabled() ? `\u001b[${open}m${text}\u001b[${close}m` : text;
}

export const style = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

/** Canonical glyphs — the same ones every command prints. */
export const symbol = {
  ask: '?',
  ok: '✓',
  fail: '✗',
  arrow: '→',
  bullet: '•',
  warn: '⚠',
  cursor: '❯',
} as const;

// ---------------------------------------------------------------------------
// Buffered input: line mode + raw mode (arrow keys / secret mask)
// ---------------------------------------------------------------------------

type LineWaiter = (line: string | null) => void;
type SecretWaiter = (value: string) => void;
type KeyWaiter = (key: string) => void;

/** Named keys the menus understand. Printable characters are their own token. */
export type KeyToken = string;

/** ASCII codes used in raw mode — kept numeric to stay readable in source. */
const CODE_ESC = 27;
const CODE_ETX = 3;
const CODE_EOT = 4;
const CODE_DEL = 127;
const CODE_BS = 8;

/** ESC as a string (redraw sequences, built without escape literals). */
const ESC = String.fromCharCode(CODE_ESC);

/**
 * Turns one terminal chunk into key tokens.
 *
 * Arrow keys arrive as a single chunk (`ESC [ A`), so the CSI introducer is
 * matched first and the rest of the sequence swallowed; a lone ESC becomes
 * `escape`. Everything else is the character itself.
 */
export function decodeKeys(chunk: string): KeyToken[] {
  const keys: KeyToken[] = [];
  const named: Record<string, string> = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };

  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i]!;
    const code = chunk.charCodeAt(i);

    if (code === CODE_ESC) {
      const next = chunk[i + 1];
      if (next === '[' || next === 'O') {
        const final = chunk[i + 2];
        if (final && named[final]) {
          keys.push(named[final]!);
          i += 2;
          continue;
        }
        // other CSI/SS3 sequences (function keys, mouse…): swallow to the end
        let j = i + 2;
        while (j < chunk.length) {
          const c = chunk.charCodeAt(j);
          if (c >= 0x40 && c <= 0x7e) break;
          j++;
        }
        i = j;
        continue;
      }
      keys.push('escape');
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      keys.push('enter');
      continue;
    }
    if (code === CODE_ETX) {
      keys.push('ctrl-c');
      continue;
    }
    if (code === CODE_EOT) {
      keys.push('ctrl-d');
      continue;
    }
    if (code === CODE_DEL || code === CODE_BS) {
      keys.push('backspace');
      continue;
    }
    keys.push(ch);
  }

  return keys;
}

/** Ctrl+C — cancela a leitura de um segredo sem derrubar o processo. */
const ETX = '\u0003';
/** DEL/backspace. */
const DEL = '\u007f';

class BufferedInput {
  private readonly stream: RawStream;
  private readonly echo: (text: string) => void;
  private buffer = '';
  private queue: string[] = [];
  private waiters: LineWaiter[] = [];
  private ended = false;

  // raw mode state — secret mask (existing) and key reading (new)
  private raw = false;
  private rawValue = '';
  private rawWaiter: SecretWaiter | null = null;
  private keyMode = false;
  private keyQueue: KeyToken[] = [];
  private keyWaiters: KeyWaiter[] = [];

  constructor(stream: RawStream, echo: (text: string) => void) {
    this.stream = stream;
    this.echo = echo;

    stream.setEncoding('utf8');
    stream.on('data', (chunk: string | Buffer) => this.onData(String(chunk)));
    const end = (): void => this.onEnd();
    stream.on('end', end);
    stream.on('close', end);
    stream.on('error', end);
  }

  /** true when the terminal can switch to raw mode (arrow keys + secret mask). */
  get canRaw(): boolean {
    return Boolean(this.stream.isTTY && this.stream.setRawMode);
  }

  private onEnd(): void {
    if (this.ended) return;
    this.ended = true;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter(null);
    if (this.rawWaiter) {
      const waiter = this.rawWaiter;
      this.rawWaiter = null;
      this.raw = false;
      waiter('');
    }
    const keyWaiters = this.keyWaiters.splice(0);
    for (const waiter of keyWaiters) waiter('eof');
  }

  private onData(chunk: string): void {
    if (this.raw) {
      this.onRawData(chunk);
      return;
    }
    if (this.keyMode) {
      this.dispatchKeys(chunk);
      return;
    }
    this.buffer += chunk;
    this.drain();
  }

  private drain(): void {
    for (;;) {
      const index = this.buffer.indexOf('\n');
      if (index < 0) break;
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.queue.push(line);
    }
  }

  /** Volta ao modo normal e entrega o valor lido. */
  private finishRaw(value: string): void {
    this.rawValue = '';
    this.raw = false;
    this.setRawMode(false);
    this.echo('\n');
    const waiter = this.rawWaiter;
    this.rawWaiter = null;
    waiter?.(value);
  }

  private onRawData(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]!;

      if (ch === '\r' || ch === '\n') {
        const value = this.rawValue;
        this.finishRaw(value);
        // resto do chunk (raro em raw mode) volta para o leitor normal
        const rest = chunk.slice(i + 1);
        if (rest) {
          this.buffer += rest;
          this.drain();
        }
        return;
      }

      if (ch === ETX) {
        this.finishRaw('');
        return;
      }

      if (ch === DEL || ch === '\b') {
        this.rawValue = this.rawValue.slice(0, -1);
        this.echo('\b \b');
        continue;
      }

      this.rawValue += ch;
      this.echo('*');
    }
  }

  private setRawMode(enabled: boolean): void {
    try {
      this.stream.setRawMode?.(enabled);
      if (enabled) this.stream.resume();
    } catch {
      // stdin sem raw mode — a leitura seguinte cai no modo linha
    }
  }

  /** Lê uma linha. Devolve `null` em EOF (pipe fechado). */
  readLine(): Promise<string | null> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Reads a secret. No echo on a TTY (raw mode + `*`); without a TTY the input
   * IS the pipe — `echo password | okcms config` is a real flow — and the
   * default covers a closed stdin in CI.
   */
  async readSecret(): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return queued;
    if (this.ended) return '';
    if (!this.canRaw) return (await this.readLine()) ?? '';

    return new Promise((resolve) => {
      this.rawValue = '';
      this.raw = true;
      this.rawWaiter = resolve;
      this.setRawMode(true);
    });
  }

  /**
   * Reads one key token (`up`, `down`, `enter`, a printable character…).
   * Returns `eof` when the terminal cannot do raw mode or stdin closed — the
   * caller falls back to the numbered menu instead of hanging.
   */
  readKey(): Promise<KeyToken> {
    const queued = this.keyQueue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.ended || !this.canRaw) return Promise.resolve('eof');

    return new Promise((resolve) => {
      this.keyMode = true;
      this.keyWaiters.push(resolve);
      this.setRawMode(true);
    });
  }

  /** Queues decoded keys to whoever is waiting (or buffers them for later). */
  private dispatchKeys(chunk: string): void {
    for (const key of decodeKeys(chunk)) {
      const waiter = this.keyWaiters.shift();
      if (waiter) waiter(key);
      else this.keyQueue.push(key);
    }
  }

  /** Leaves key mode: raw mode off, pending waiters released with `eof`. */
  releaseKeys(): void {
    if (!this.keyMode) return;
    this.keyMode = false;
    this.setRawMode(false);
    const waiters = this.keyWaiters.splice(0);
    for (const waiter of waiters) waiter('eof');
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface SelectChoice<T> {
  value: T;
  label: string;
  /** Contexto curto alinhado à direita da opção. */
  hint?: string;
}

export interface SelectOptions<T> {
  /** Default no Enter E valor devolvido em modo não-interativo. */
  defaultValue?: T;
  /** Mensagem quando não há TTY nem default. */
  nonInteractiveError?: string;
}

export interface InputOptions {
  default?: string;
  /** Mensagem de erro para re-perguntar; null/undefined aceita. */
  validate?: (value: string) => string | null | undefined;
  /** Preview do valor atual (ex.: máscara `••••` para segredos). */
  placeholder?: string;
}

export class Prompt {
  private readonly io: PromptIO;
  private readonly input: BufferedInput;
  private closed = false;

  constructor(io?: Partial<PromptIO>) {
    this.io = { ...defaultIO(), ...io };
    this.input = new BufferedInput(this.io.input as RawStream, (text) => {
      this.io.output.write(text);
    });
  }

  get interactive(): boolean {
    return this.io.isTTY;
  }

  write(text: string): void {
    this.io.output.write(text);
  }

  /** Título de seção do wizard. */
  heading(text: string): void {
    this.write(`\n${style.bold(text)}\n`);
  }

  info(text: string): void {
    this.write(`  ${style.dim(`${symbol.arrow} ${text}`)}\n`);
  }

  success(text: string): void {
    this.write(`  ${style.green(symbol.ok)} ${text}\n`);
  }

  warn(text: string): void {
    this.write(`  ${style.yellow(symbol.warn)} ${text}\n`);
  }

  error(text: string): void {
    this.write(`  ${style.red(symbol.fail)} ${text}\n`);
  }

  /**
   * Arrow-key menu (↑/↓ + Enter). Falls back to a numbered menu when the
   * terminal cannot do raw mode, and to `defaultValue` when there is no TTY at
   * all — so a CI never triggers a deploy by accident.
   */
  async select<T>(
    title: string,
    choices: Array<SelectChoice<T>>,
    opts: SelectOptions<T> = {}
  ): Promise<T> {
    if (choices.length === 0) {
      throw new Error(`select "${title}" has no options`);
    }

    const defaultIndex =
      opts.defaultValue === undefined
        ? -1
        : Math.max(
            0,
            choices.findIndex((choice) => choice.value === opts.defaultValue)
          );

    if (!this.io.isTTY) {
      if (opts.defaultValue !== undefined) return opts.defaultValue;
      throw new Error(
        opts.nonInteractiveError ??
          `non-interactive: "${title}" needs a TTY or the equivalent flag`
      );
    }

    if (this.input.canRaw) {
      return await this.navigate<T>(title, choices, defaultIndex < 0 ? 0 : defaultIndex, {});
    }

    // No raw mode (pipe, odd SSH session, test harness): numbered menu.
    this.write(`\n  ${symbol.ask} ${style.bold(title)}\n`);
    choices.forEach((choice, index) => {
      const marker = index === defaultIndex ? style.cyan('>') : ' ';
      const hint = choice.hint ? `  ${style.dim(choice.hint)}` : '';
      const label = index === defaultIndex ? style.bold(choice.label) : choice.label;
      this.write(`    ${marker} ${style.dim(`${index + 1}`)}) ${label}${hint}\n`);
    });

    for (;;) {
      const suffix = defaultIndex >= 0 ? style.dim(`[${defaultIndex + 1}]`) : '';
      const raw = await this.askLine(`${symbol.ask} ${suffix}`);
      if (raw === null) {
        if (opts.defaultValue !== undefined) return opts.defaultValue;
        throw new Error(`input closed before "${title}" was answered`);
      }

      const answer = raw.trim();
      if (answer === '' && defaultIndex >= 0) return choices[defaultIndex]!.value;

      const asNumber = Number.parseInt(answer, 10);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= choices.length) {
        return choices[asNumber - 1]!.value;
      }

      const byValue = choices.find((choice) => String(choice.value) === answer);
      if (byValue) return byValue.value;

      this.write(`  ${style.red(symbol.fail)} invalid option — type 1..${choices.length}\n`);
    }
  }

  /**
   * Yes/No confirmation. Arrow keys + Enter on a TTY, `y`/`n` shortcuts too;
   * without a TTY it returns `defaultValue`.
   */
  async confirm(title: string, opts: { defaultValue?: boolean } = {}): Promise<boolean> {
    const fallback = opts.defaultValue ?? false;

    if (!this.io.isTTY) return fallback;

    if (this.input.canRaw) {
      const badge =
        opts.defaultValue === undefined ? '' : opts.defaultValue ? style.dim(' [Y/n]') : style.dim(' [y/N]');
      return await this.navigate<boolean>(
        `${title}${badge}`,
        [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
        ],
        opts.defaultValue === false ? 1 : 0,
        { inline: true, aliases: { y: 0, n: 1 } }
      );
    }

    const hint = opts.defaultValue === undefined ? '[y/n]' : opts.defaultValue ? '[Y/n]' : '[y/N]';
    for (;;) {
      const raw = await this.askLine(`  ${symbol.ask} ${title} ${style.dim(hint)} `);
      if (raw === null) return fallback;

      const answer = raw.trim().toLowerCase();
      if (answer === '') {
        if (opts.defaultValue !== undefined) return opts.defaultValue;
        continue;
      }
      if (['y', 'yes'].includes(answer)) return true;
      if (['n', 'no'].includes(answer)) return false;

      this.write(`  ${style.red(symbol.fail)} answer y or n\n`);
    }
  }

  /**
   * Shared raw-mode navigator behind `select` and `confirm`.
   *
   * Every repaint clears the previous block (`ESC[<n>A` + `ESC[0J`), so the
   * menu never leaves scrollback debris. `inline` lays the options on one line
   * (confirm), `aliases` maps single keys straight to an option.
   */
  private async navigate<T>(
    title: string,
    choices: Array<SelectChoice<T>>,
    startIndex: number,
    opts: { inline?: boolean; aliases?: Record<string, number> }
  ): Promise<T> {
    const total = choices.length;
    let index = Math.min(Math.max(startIndex, 0), total - 1);
    let painted = 0;

    const paint = (final: boolean): void => {
      if (painted > 0) this.write(`${ESC}[${painted}A${ESC}[0J`);

      const lines: string[] = [`  ${symbol.ask} ${style.bold(title)}`];
      if (opts.inline) {
        lines.push(
          `    ${choices
            .map((choice, i) =>
              i === index
                ? style.cyan(`${symbol.cursor} ${choice.label}`)
                : `  ${choice.label}`
            )
            .join('   ')}`
        );
      } else {
        const width = Math.max(...choices.map((choice) => choice.label.length));
        choices.forEach((choice, i) => {
          const on = i === index;
          const hint = choice.hint ? `  ${style.dim(choice.hint)}` : '';
          const label = on ? style.bold(choice.label) : choice.label.padEnd(width);
          lines.push(`    ${on ? style.cyan(symbol.cursor) : ' '} ${label}${hint}`);
        });
      }
      if (!final) {
        lines.push(
          `    ${style.dim(opts.inline ? '←→ move · enter confirm' : '↑↓ move · enter confirm')}`
        );
      }

      this.write(`${lines.join('\n')}\n`);
      painted = lines.length;
    };

    const settle = (value: T): T => {
      paint(true);
      this.input.releaseKeys();
      return value;
    };

    paint(false);

    for (;;) {
      const key = await this.input.readKey();

      // raw mode gone or stdin closed: keep the highlighted option
      if (key === 'eof') {
        this.input.releaseKeys();
        return choices[index]!.value;
      }

      if (key === 'ctrl-c' || key === 'escape' || key === 'ctrl-d') {
        this.write(`\n  ${style.dim('Cancelled.')}\n`);
        this.input.releaseKeys();
        this.close();
        process.exit(130);
      }

      const token = key.length === 1 ? key.toLowerCase() : key;
      const alias = opts.aliases?.[token];
      if (alias !== undefined && alias < total) return settle(choices[alias]!.value);

      if (key === 'enter') return settle(choices[index]!.value);

      let next: number | null = null;
      let wrap = false;
      if (key === 'up' || key === 'k') {
        next = index - 1;
        wrap = true;
      } else if (key === 'down' || key === 'j') {
        next = index + 1;
        wrap = true;
      } else if (key === 'left' && opts.inline) {
        next = index - 1;
        wrap = true;
      } else if (key === 'right' && opts.inline) {
        next = index + 1;
        wrap = true;
      } else if (key === 'home') next = 0;
      else if (key === 'end') next = total - 1;
      else if (!opts.inline && total <= 9 && key >= '1' && key <= '9') next = Number(key) - 1;

      if (next === null) continue;
      // arrows wrap around the list; home/end/digits land on the exact item
      next = wrap ? ((next % total) + total) % total : next;
      if (next < 0 || next >= total) continue;
      index = next;
      paint(false);
    }
  }

  /** Texto livre com validação, repetindo até aceitar. */
  async ask(title: string, opts: InputOptions = {}): Promise<string> {
    const fallback = opts.default ?? '';

    if (!this.io.isTTY) {
      if (opts.default !== undefined) return opts.default;
      throw new Error(`non-interactive: "${title}" needs a TTY or --set`);
    }

    const current = opts.placeholder ?? opts.default;
    const shown = current ? style.dim(` (${current})`) : '';

    for (;;) {
      const suffix =
        opts.default !== undefined && !opts.placeholder ? style.dim(`[${opts.default}]`) : '';
      const raw = await this.askLine(`  ${symbol.ask} ${title}${shown}${suffix} `);
      const blank = raw === null || raw.trim() === '';
      const value = blank ? fallback : raw.trim();

      const problem = opts.validate?.(value);
      if (problem) {
        this.write(`  ${style.red(symbol.fail)} ${problem}\n`);
        continue;
      }
      return value;
    }
  }

  /** Segredo: sem eco no TTY (mostra `*`), default via Enter. */
  async secret(title: string, opts: InputOptions = {}): Promise<string> {
    const fallback = opts.default ?? '';

    if (!this.io.isTTY) {
      // sem TTY o stdin É o pipe: `echo senha | okcms config` é fluxo real.
      // Sem nada chegando, cai no default (stdin fechado em CI).
      const piped = await this.input.readSecret();
      const value = piped.trim() === '' ? fallback : piped.trim();
      const problem = opts.validate?.(value);
      if (problem) throw new Error(problem);
      return value;
    }

    const current = opts.placeholder ?? (opts.default !== undefined ? '••••••' : undefined);
    const shown = current ? style.dim(` (${current})`) : '';

    for (;;) {
      const suffix = opts.default !== undefined ? style.dim('[enter = keep]') : '';
      this.write(`  ${symbol.ask} ${title}${shown}${suffix} `);
      const value = await this.input.readSecret();
      this.write('\n');

      const problem = opts.validate?.(value);
      if (problem) {
        this.write(`  ${style.red(symbol.fail)} ${problem}\n`);
        continue;
      }
      return value === '' ? fallback : value;
    }
  }

  /** Lê uma linha cruta (também usada pelos testes). */
  async askLine(question: string): Promise<string | null> {
    if (this.closed) return null;
    if (question) this.io.output.write(question);
    return this.input.readLine();
  }

  close(): void {
    this.closed = true;
    // solta o stdin: sem isso um `okcms update` terminaria com o canal preso
    try {
      (this.io.input as RawStream).setRawMode?.(false);
      this.io.input.pause();
    } catch {
      // stream já finalizado
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers one-shot (um prompt e fecha)
// ---------------------------------------------------------------------------

export async function select<T>(
  title: string,
  choices: Array<SelectChoice<T>>,
  opts: SelectOptions<T> = {},
  io?: Partial<PromptIO>
): Promise<T> {
  const prompt = new Prompt(io);
  try {
    return await prompt.select(title, choices, opts);
  } finally {
    prompt.close();
  }
}

export async function confirm(
  title: string,
  opts: { defaultValue?: boolean } = {},
  io?: Partial<PromptIO>
): Promise<boolean> {
  const prompt = new Prompt(io);
  try {
    return await prompt.confirm(title, opts);
  } finally {
    prompt.close();
  }
}
