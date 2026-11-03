// @oktis-works/cms - Prompts interativos baseados em @clack/prompts v1.8.1
//
// Substitui completamente a implementação anterior baseada em readline nativa.
// Todos os métodos públicos são mantidos para compatibilidade com wizard.ts,
// config-wizard.ts, dev.ts, update.ts, redeploy.ts e qualquer outro consumidor.
//
// O Clack é ESM-first e TypeScript nativo. Todos os prompts retornam Promises e
// usam isCancel() para detectar cancelamento (Ctrl+C / AbortSignal).
//
// Em ambientes sem TTY real (testes, CI, pipes), usa implementação simplificada
// baseada em leitura de linha para manter compatibilidade com testes existentes.

import { Readable, Writable } from 'node:stream';
import * as clack from '@clack/prompts';

/** Validation signature accepted by the Clack text/password prompts.
 * Derived from TextOptions instead of importing @clack/core: with Bun's
 * isolated linker the transitive dependency is not resolvable from here.
 */
type ClackValidate = NonNullable<Parameters<typeof clack.text>[0]['validate']>;

/** Resultado de cancelamento do usuário (Ctrl+C ou AbortSignal). */
export class CancelError extends Error {
  constructor() {
    super('Prompt cancelled by user');
    this.name = 'CancelError';
  }
}

/** Deteta se o stream é um TTY real (não mockado para testes) - usado para Clack. */
function isRealTTY(stream: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }): boolean {
  // Must be a real TTY with setRawMode, AND not a PassThrough or FakeTTY (used in tests)
  return Boolean(
    stream.isTTY &&
    stream.setRawMode &&
    typeof stream.setRawMode === 'function' &&
    stream.constructor.name !== 'PassThrough' &&
    stream.constructor.name !== 'FakeTTY'
  );
}

/** Deteta se o stream suporta raw mode (para secrets, arrow keys) - inclui FakeTTY. */
function canUseRawMode(stream: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }): boolean {
  return Boolean(stream.isTTY && stream.setRawMode && typeof stream.setRawMode === 'function');
}

// ---------------------------------------------------------------------------
// Fallback implementation for non-real-TTY (tests, CI, pipes)
// ---------------------------------------------------------------------------

type RawStream = Readable & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
};

type LineWaiter = (line: string | null) => void;
type KeyWaiter = (key: string) => void;

/** Named keys the menus understand. */
type KeyToken = string;

const CODE_ESC = 27;
const CODE_ETX = 3;
const CODE_EOT = 4;
const CODE_DEL = 127;
const CODE_BS = 8;

/** Turns one terminal chunk into key tokens (copied from old implementation). */
function decodeKeys(chunk: string): KeyToken[] {
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

/** Buffered input that handles both line mode and key mode (for tests). */
class SimpleInput {
  private readonly stream: RawStream;
  private readonly echo: (text: string) => void;
  private buffer = '';
  private queue: string[] = [];
  private waiters: LineWaiter[] = [];
  private ended = false;

  // raw mode state — secret mask and key reading (public: raw-mode helpers
  // inside Prompt toggle it around terminal prompts)
  raw = false;
  private rawValue = '';
  private rawWaiter: ((value: string) => void) | null = null;
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
    if (this.keyMode) {
      this.dispatchKeys(chunk);
      return;
    }
    if (this.raw) {
      this.onRawData(chunk);
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

  /** Turns raw mode on/off on the underlying stream (never throws). */
  applyRawMode(enabled: boolean): void {
    this.setRawMode(enabled);
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
        const rest = chunk.slice(i + 1);
        if (rest) {
          this.buffer += rest;
          this.drain();
        }
        return;
      }

      if (ch === '\u0003') { // ETX = Ctrl+C
        this.finishRaw('');
        return;
      }

      if (ch === '\u007f' || ch === '\b') { // DEL or backspace
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
   * IS the pipe — `echo password | okcms config` is a real flow.
   * Returns `null` at EOF so the caller can distinguish "stream ended" from "user submitted an empty value".
   */
  async readSecret(): Promise<string | null> {
    const queued = this.queue.shift();
    if (queued !== undefined) return queued;
    if (this.ended) return null;
    if (!this.canRaw) return this.readLine();

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
// IO
// ---------------------------------------------------------------------------

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

/** Canonical glyphs — os mesmos símbolos usados pelo prompt anterior. */
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
// Terminal-safe layout helpers (compatibilidade com implementação anterior)
// ---------------------------------------------------------------------------

/**
 * Returns terminal width from COLUMNS env var or a fallback.
 */
export function terminalWidth(fallback = 80): number {
  const columns = Number.parseInt(process.env['COLUMNS'] ?? '', 10);
  return Number.isFinite(columns) && columns >= 40 ? columns : fallback;
}

/**
 * Returns visible length of text (strips ANSI escape codes).
 */
export function visibleLength(text: string): number {
  return text.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '').length;
}

/**
 * Truncates text to fit within max width, adding ellipsis if needed.
 */
export function truncateText(text: string, max = terminalWidth() - 4): string {
  if (max < 4 || visibleLength(text) <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Wraps text to fit within max width, splitting on word boundaries.
 */
export function wrapText(text: string, max = terminalWidth() - 4): string[] {
  if (max < 8) return [truncateText(text, max)];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (visibleLength(`${line} ${word}`) <= max) {
      line += ` ${word}`;
    } else {
      lines.push(truncateText(line, max));
      line = word;
    }
  }
  if (line) lines.push(truncateText(line, max));
  return lines.length > 0 ? lines : [''];
}

/**
 * Returns ASCII fallback symbol if OKCMS_ASCII=1 or TERM=dumb.
 */
export function asciiSymbol(name: keyof typeof symbol): string {
  const fallback: Record<keyof typeof symbol, string> = {
    ask: '?',
    ok: '[ok]',
    fail: '[x]',
    arrow: '->',
    bullet: '*',
    warn: '!',
    cursor: '>',
  };
  return process.env['OKCMS_ASCII'] === '1' || process.env['TERM'] === 'dumb'
    ? fallback[name]
    : symbol[name];
}

// ---------------------------------------------------------------------------
// Tipos públicos
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
  /** Limpa a tela INTEIRA a cada repaint (setas) — evita multiplicação de conteúdo em terminais lentos. */
  fullClear?: boolean;
  /** Explicit result for Escape/Ctrl+C; nested screens should use Back. */
  cancelValue?: T;
}

export interface InputOptions {
  default?: string;
  /** Mensagem de erro para re-perguntar; null/undefined aceita. */
  validate?: (value: string) => string | null | undefined;
  /** Preview do valor atual (ex.: máscara `••••` para segredos). */
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Classe Prompt
// ---------------------------------------------------------------------------

export class Prompt {
  private readonly io: PromptIO;
  private readonly useClack: boolean;
  private readonly simpleInput: SimpleInput | null;
  private closed = false;

  constructor(io?: Partial<PromptIO>) {
    this.io = { ...defaultIO(), ...io };
    const inputStream = this.io.input as RawStream;
    this.useClack = this.io.isTTY && isRealTTY(inputStream);

    if (!this.useClack) {
      this.simpleInput = new SimpleInput(inputStream, (text) => {
        this.io.output.write(text);
      });
    } else {
      this.simpleInput = null;
    }
  }

  /** true somente quando há terminal nos DOIS lados (TTY de verdade). */
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
    if (this.useClack) {
      clack.log.info(text);
    } else {
      this.write(`  ${style.dim(`${symbol.arrow} ${text}`)}\n`);
    }
  }

  success(text: string): void {
    if (this.useClack) {
      clack.log.success(text);
    } else {
      this.write(`  ${style.green(symbol.ok)} ${text}\n`);
    }
  }

  warn(text: string): void {
    if (this.useClack) {
      clack.log.warn(text);
    } else {
      this.write(`  ${style.yellow(symbol.warn)} ${text}\n`);
    }
  }

  error(text: string): void {
    if (this.useClack) {
      clack.log.error(text);
    } else {
      this.write(`  ${style.red(symbol.fail)} ${text}\n`);
    }
  }

  /**
   * Converte uma função de validação do tipo antigo ((v: string) => string | null)
   * para o tipo esperado pelo Clack ((v: string | undefined) => string | Error | undefined | void).
   */
  private static wrapValidate(
    validate?: (value: string) => string | null | undefined
  ): ClackValidate | undefined {
    if (!validate) return undefined;
    return (value: string | undefined): string | Error | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      const result = validate(value);
      if (!result) return undefined;
      return result;
    };
  }

  /**
   * Arrow-key menu (↑/↓ + Enter). Sem TTY, retorna defaultValue ou lança erro.
   * Usa o Clack select() por baixo para TTY real; fallback numerado/teclado para testes/CI.
   */
  async select<T>(
    title: string,
    choices: Array<SelectChoice<T>>,
    opts: SelectOptions<T> = {}
  ): Promise<T> {
    if (!this.useClack) {
      // Fallback: numbered menu for non-real-TTY (tests, CI)
      // Check if we can use raw mode (arrow keys) with FakeTTY
      const inputStream = this.io.input as RawStream;
      if (canUseRawMode(inputStream) && this.simpleInput) {
        return this.selectRawMode(title, choices, opts);
      }
      return this.selectNumbered(title, choices, opts);
    }

    const result = await clack.select({
      message: title,
      // `Option<T>` requires `T extends Primitive`; cast keeps the public
      // unconstrained SelectChoice<T> signature unchanged.
      options: choices.map((c) => ({
        value: c.value,
        label: c.label,
        hint: c.hint ?? '',
      })) as unknown as clack.Option<T>[],
      initialValue: opts.defaultValue,
      showInstructions: true,
    });

    if (clack.isCancel(result)) {
      if (opts.cancelValue !== undefined) return opts.cancelValue;
      throw new CancelError();
    }

    return result as T;
  }

  /** Raw mode select for FakeTTY (arrow keys + numbered input). */
  private async selectRawMode<T>(
    title: string,
    choices: Array<SelectChoice<T>>,
    opts: SelectOptions<T>
  ): Promise<T> {
    const { output } = this.io;
    const stream = this.io.input as RawStream;
    let index = 0;
    const initial = opts.defaultValue;
    if (initial !== undefined) {
      const found = choices.findIndex((c) => c.value === initial);
      if (found >= 0) index = found;
    }

    const render = (): void => {
      output.write(`\n${style.bold(title)}\n`);
      for (let i = 0; i < choices.length; i++) {
        const c = choices[i]!;
        const marker = i === index ? style.bold(`${symbol.cursor} `) : '  ';
        const hint = c.hint ? style.dim(` (${c.hint})`) : '';
        output.write(`${marker}${c.label}${hint}\n`);
      }
    };

    render();

    // Enable raw mode
    stream.setRawMode?.(true);
    this.simpleInput!.raw = true;

    while (true) {
      const key = await this.simpleInput!.readKey();

      if (key === 'eof') {
        // No raw mode available — fall through to numbered input
        output.write('\n');
        break;
      }

      if (key === 'up' || key === 'k') {
        index = (index - 1 + choices.length) % choices.length;
        output.write('\x1b[1A\r'.repeat(choices.length + 1)); // move up
        render();
        continue;
      }

      if (key === 'down' || key === 'j') {
        index = (index + 1) % choices.length;
        output.write('\x1b[1A\r'.repeat(choices.length + 1));
        render();
        continue;
      }

      if (key === 'enter' || key === '\r' || key === '\n') {
        output.write('\n');
        stream.setRawMode?.(false);
        this.simpleInput!.raw = false;
        return choices[index]!.value;
      }

      if (key === 'escape' || key === 'ctrl-c') {
        output.write('\n');
        stream.setRawMode?.(false);
        this.simpleInput!.raw = false;
        if (opts.cancelValue !== undefined) return opts.cancelValue;
        throw new CancelError();
      }

      // Numbered input (1, 2, 3...)
      const num = Number.parseInt(key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= choices.length) {
        output.write('\n');
        stream.setRawMode?.(false);
        this.simpleInput!.raw = false;
        return choices[num - 1]!.value;
      }
    }

    // Disable raw mode before falling through
    stream.setRawMode?.(false);
    this.simpleInput!.raw = false;

    // Numbered menu via line input
    const display = choices.map((c, i) => `  ${i + 1}) ${c.label}${c.hint ? style.dim(` (${c.hint})`) : ''}`).join('\n');
    output.write(`${display}\n`);

    while (true) {
      const line = await this.simpleInput!.readLine();
      if (line === null) {
        if (opts.cancelValue !== undefined) return opts.cancelValue;
        if (opts.defaultValue !== undefined) return opts.defaultValue;
        if (opts.nonInteractiveError) throw new Error(opts.nonInteractiveError);
        throw new Error(`input closed before "${title}" was answered`);
      }
      const answer = line.trim();
      if (answer === '' && opts.defaultValue !== undefined) return opts.defaultValue;

      const num = Number.parseInt(answer, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= choices.length) {
        return choices[num - 1]!.value;
      }

      const byValue = choices.find((choice) => String(choice.value) === answer);
      if (byValue) return byValue.value;

      output.write(`  ${style.red(symbol.fail)} Opção inválida\n`);
    }
  }

  /**
   * Fallback numbered menu for tests and non-TTY environments.
   * Mimics the old readline-based select behavior.
   */
  private async selectNumbered<T>(
    title: string,
    choices: Array<SelectChoice<T>>,
    opts: SelectOptions<T>
  ): Promise<T> {
    const { output } = this.io;
    let index = 0;
    const initial = opts.defaultValue;
    if (initial !== undefined) {
      const found = choices.findIndex((c) => c.value === initial);
      if (found >= 0) index = found;
    }

    const render = (): void => {
      output.write(`\n${style.bold(title)}\n`);
      for (let i = 0; i < choices.length; i++) {
        const c = choices[i]!;
        const marker = i === index ? style.bold(`${symbol.cursor} `) : '  ';
        const hint = c.hint ? style.dim(` (${c.hint})`) : '';
        output.write(`${marker}${c.label}${hint}\n`);
      }
    };

    render();

    while (true) {
      const key = await this.simpleInput!.readKey();

      if (key === 'eof') {
        // No raw mode available — fall through to numbered input
        output.write('\n');
        break;
      }

      if (key === 'up' || key === 'k') {
        index = (index - 1 + choices.length) % choices.length;
        output.write('\x1b[1A\r'.repeat(choices.length + 1)); // move up
        render();
        continue;
      }

      if (key === 'down' || key === 'j') {
        index = (index + 1) % choices.length;
        output.write('\x1b[1A\r'.repeat(choices.length + 1));
        render();
        continue;
      }

      if (key === 'enter' || key === '\r' || key === '\n') {
        output.write('\n');
        return choices[index]!.value;
      }

      if (key === 'escape' || key === 'ctrl-c') {
        if (opts.cancelValue !== undefined) return opts.cancelValue;
        throw new CancelError();
      }

      // Numbered input (1, 2, 3...)
      const num = Number.parseInt(key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= choices.length) {
        output.write('\n');
        return choices[num - 1]!.value;
      }
    }

    // Numbered menu via line input
    const display = choices.map((c, i) => `  ${i + 1}) ${c.label}${c.hint ? style.dim(` (${c.hint})`) : ''}`).join('\n');
    output.write(`${display}\n`);

    while (true) {
      const line = await this.simpleInput!.readLine();
      if (line === null) {
        if (opts.cancelValue !== undefined) return opts.cancelValue;
        if (opts.defaultValue !== undefined) return opts.defaultValue;
        if (opts.nonInteractiveError) throw new Error(opts.nonInteractiveError);
        throw new Error(`input closed before "${title}" was answered`);
      }
      const answer = line.trim();
      if (answer === '' && opts.defaultValue !== undefined) return opts.defaultValue;

      const num = Number.parseInt(answer, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= choices.length) {
        return choices[num - 1]!.value;
      }

      const byValue = choices.find((choice) => String(choice.value) === answer);
      if (byValue) return byValue.value;

      output.write(`  ${style.red(symbol.fail)} Opção inválida\n`);
    }
  }

  /** Texto livre com validação, repetindo até aceitar. */
  async ask(title: string, opts: InputOptions = {}): Promise<string> {
    if (!this.useClack) {
      // Fallback for tests/non-TTY - simple line reading with validation
      return this.askLineFallback(title, opts);
    }

    const result = await clack.text({
      message: title,
      placeholder: opts.placeholder,
      initialValue: opts.default,
      validate: Prompt.wrapValidate(opts.validate),
    });

    if (clack.isCancel(result)) {
      if (opts.default !== undefined) return opts.default;
      throw new CancelError();
    }

    return result as string;
  }

  /** Segredo: sem eco no TTY (mostra `*`). */
  async secret(title: string, opts: InputOptions = {}): Promise<string> {
    if (!this.useClack) {
      // Fallback for tests/non-TTY - use raw mode if available (FakeTTY), else simple line
      const inputStream = this.io.input as RawStream;
      if (canUseRawMode(inputStream) && this.simpleInput) {
        // Use raw mode to mask input with *
        return this.secretRawMode(title, opts);
      }
      // Piped stdin is real input (`echo secret | okcms config`); a closed
      // stdin (EOF/CI) falls back to the default.
      const fallback = opts.default ?? '';
      const piped = await this.simpleInput!.readSecret();
      const value = !piped || piped.trim() === '' ? fallback : piped.trim();
      const problem = opts.validate?.(value);
      if (problem) throw new Error(problem as string);
      return value;
    }

    const result = await clack.password({
      message: title,
      mask: '*',
      validate: Prompt.wrapValidate(opts.validate),
      clearOnError: true,
    });

    if (clack.isCancel(result)) {
      if (opts.default !== undefined) return opts.default;
      throw new CancelError();
    }

    return result as string;
  }

  /** Raw mode secret input for FakeTTY (masks with *). */
  private async secretRawMode(title: string, opts: InputOptions): Promise<string> {
    if (!this.simpleInput) throw new Error('No simpleInput available');

    const { output } = this.io;
    const stream = this.io.input as RawStream;

    output.write(`${title}: `);
    stream.setRawMode?.(true);
    this.simpleInput.raw = true;

    let value = '';

    while (true) {
      const key = await this.simpleInput.readKey();
      if (key === 'eof') {
        output.write('\n');
        break;
      }
      if (key === 'enter') {
        output.write('\n');
        break;
      }
      if (key === 'backspace') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          // Erase last *
          output.write('\b \b');
        }
        continue;
      }
      if (key === 'escape' || key === 'ctrl-c') {
        output.write('\n');
        if (opts.default !== undefined) return opts.default;
        throw new CancelError();
      }
      if (key.length === 1 && key >= ' ' && key <= '~') {
        value += key;
        output.write('*');
      }
    }

    stream.setRawMode?.(false);
    this.simpleInput.raw = false;

    const trimmed = value.trim();
    const problem = opts.validate?.(trimmed);
    if (problem) throw new Error(problem as string);
    return trimmed || (opts.default ?? '');
  }

  /**
   * Fallback line-based input with validation for non-Clack environments.
   */
  private async askLineFallback(title: string, opts: InputOptions): Promise<string> {
    const fallback = opts.default ?? '';
    const displayDefault = opts.default !== undefined ? ` [${opts.default}]` : '';
    const prompt = `${title}${displayDefault}: `;

    while (true) {
      this.io.output.write(prompt);
      const line = await this.simpleInput!.readLine();
      if (line === null) {
        if (opts.default !== undefined) return opts.default;
        throw new Error(`non-interactive: "${title}" needs a TTY or --set`);
      }
      const trimmed = line.trim();
      const value = trimmed === '' ? fallback : trimmed;
      const problem = opts.validate?.(value);
      if (problem) {
        this.io.output.write(`  ${style.red(symbol.fail)} ${problem}\n`);
        continue;
      }
      return value;
    }
  }

  /** Texto livre com validação + suporte a voltar (tecla 'b'). Retorna '__BACK__' para voltar. */
  async askWithBack(title: string, opts: InputOptions = {}): Promise<string> {
    const fallback = opts.default ?? '';

    if (!this.io.isTTY) {
      if (opts.default !== undefined) return opts.default;
      throw new Error(`non-interactive: "${title}" needs a TTY or --set`);
    }

    if (!this.useClack) {
      // Line-based fallback (tests, pipes): Enter keeps the default, 'b' goes back.
      for (;;) {
        const raw = await this.simpleInput!.readLine();
        if (raw === null) {
          const problem0 = opts.validate?.(fallback);
          if (problem0) {
            this.write(`  ${style.red(symbol.fail)} ${problem0}\n`);
            return '__BACK__';
          }
          return fallback;
        }
        const trimmed = raw.trim();
        if (trimmed.toLowerCase() === 'b') return '__BACK__';
        const value = trimmed === '' ? fallback : trimmed;
        const problem = opts.validate?.(value);
        if (problem) {
          this.write(`  ${style.red(symbol.fail)} ${problem}\n`);
          continue;
        }
        return value;
      }
    }

    const current = opts.placeholder ?? opts.default;
    const shown = current ? style.dim(` (${current})`) : '';

    for (;;) {
      const suffix =
        opts.default !== undefined && !opts.placeholder ? style.dim(`[${opts.default}]`) : '';
      const hint = style.dim(' (b=voltar)');

      const result = await clack.text({
        message: `${title}${shown}${suffix}${hint}`,
        placeholder: current ? current : undefined,
        initialValue: fallback,
        validate: Prompt.wrapValidate(opts.validate),
      });

      if (clack.isCancel(result)) {
        return '__BACK__';
      }

      const value = result as string;
      const trimmed = value.trim();

      // tecla de voltar
      if (trimmed.toLowerCase() === 'b') {
        return '__BACK__';
      }

      const blank = trimmed === '';
      const fieldValue = blank ? fallback : trimmed;

      const problem = opts.validate?.(fieldValue);
      if (problem) {
        this.write(`  ${style.red(symbol.fail)} ${problem}\n`);
        continue;
      }

      return fieldValue;
    }
  }

  /** Segredo com suporte a voltar (digite 'b' para voltar). Retorna '__BACK__' para voltar. */
  async secretWithBack(title: string, opts: InputOptions = {}): Promise<string> {
    const fallback = opts.default ?? '';

    if (!this.io.isTTY) {
      // Piped stdin is real input (`echo secret | okcms config`)
      const piped = await this.simpleInput!.readSecret();
      const value = !piped || piped.trim() === '' ? fallback : piped.trim();
      const problem = opts.validate?.(value);
      if (problem) throw new Error(problem as string);
      return value;
    }

    if (!this.useClack) {
      // Line-based fallback (tests, pipes): Enter keeps the current value, 'b' goes back.
      for (;;) {
        const raw = await this.simpleInput!.readSecret();
        if (raw === null) return fallback;
        if (raw.trim().toLowerCase() === 'b') return '__BACK__';
        if (raw === '' && fallback !== '') return fallback;
        const problem = opts.validate?.(raw);
        if (problem) {
          this.write(`  ${style.red(symbol.fail)} ${problem}\n`);
          continue;
        }
        return raw;
      }
    }

    const current = opts.placeholder ?? (opts.default !== undefined ? '••••••' : undefined);
    const shown = current ? style.dim(` (${current})`) : '';

    for (;;) {
      const suffix = opts.default !== undefined ? style.dim('[enter = keep]') : '';
      const hint = style.dim(' (b=voltar)');

      const result = await clack.password({
        message: `${title}${shown}${suffix}${hint}`,
        mask: '*',
        validate: Prompt.wrapValidate(opts.validate),
        clearOnError: true,
      });

      if (clack.isCancel(result)) {
        return '__BACK__';
      }

      const raw = result as string;

      // tecla de voltar
      if (raw.trim().toLowerCase() === 'b') return '__BACK__';

      // Enter com default disponível = manter o valor atual
      if (raw === '' && fallback !== '') return fallback;

      const problem = opts.validate?.(raw);
      if (problem) {
        this.write(`  ${style.red(symbol.fail)} ${problem}\n`);
        continue;
      }

      return raw;
    }
  }

  /** Lê uma linha crua (também usada pelos testes). */
  async askLine(question: string): Promise<string | null> {
    if (this.closed) return null;
    if (question) this.io.output.write(question);

    if (!this.useClack) {
      return this.simpleInput!.readLine();
    }

    const result = await clack.text({
      message: question,
    });

    if (clack.isCancel(result)) {
      return null;
    }

    return result as string;
  }

  close(): void {
    this.closed = true;
    // Clack não tem ciclo de vida explícito para fechar. No-op para compatibilidade.
  }

  /** Configurações globais do Clack (i18n, mensagens, guide lines). */
  static setSettings(settings: {
    messages?: {
      cancel?: string;
      error?: string;
    };
  }): void {
    clack.updateSettings(settings);
  }

  /** Yes/No confirmation. Sem TTY, retorna defaultValue. */
  async confirm(title: string, opts: { defaultValue?: boolean } = {}): Promise<boolean> {
    if (!this.useClack) {
      // Fallback: read from simpleInput (line-based y/n)
      const fallback = opts.defaultValue ?? false;
      const hint = opts.defaultValue === undefined ? '[y/n]' : opts.defaultValue ? '[Y/n]' : '[y/N]';
      this.io.output.write(`${title} ${style.dim(hint)}: `);
      for (;;) {
        const line = await this.simpleInput!.readLine();
        if (line === null) return fallback;
        const answer = line.trim().toLowerCase();
        if (answer === '') {
          if (opts.defaultValue !== undefined) return opts.defaultValue;
          continue;
        }
        if (answer === 'y' || answer === 'yes') return true;
        if (answer === 'n' || answer === 'no') return false;
        this.io.output.write(`  ${style.red(symbol.fail)} answer y or n\n`);
      }
    }

    const result = await clack.confirm({
      message: title,
      initialValue: opts.defaultValue,
    });

    if (clack.isCancel(result)) {
      if (opts.defaultValue !== undefined) return opts.defaultValue;
      throw new CancelError();
    }

    return result === true;
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
    const result = await prompt.confirm(title, opts);
    return result === true;
  } finally {
    prompt.close();
  }
}
