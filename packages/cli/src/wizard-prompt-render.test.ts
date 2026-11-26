// @oktis-works/cms - WizardPrompt box rendering (regression tests)
//
// Reproduces two visual bugs from `okcms init`:
//   1. Arrow navigation leaked rows: the clear count was hardcoded
//      (`choices.length + 4`) while the box paints `choices.length + 6` rows,
//      so every keypress left a blank line plus the top border behind.
//   2. The right border landed on a different column per line: the width was
//      measured with `visibleLength()` but the padding was `String.padEnd` on
//      the raw string, whose ANSI escapes ate the spaces.
//
// The assertions run against a tiny terminal emulator, i.e. the same thing the
// user actually sees instead of the raw byte stream.

import { describe, it, expect } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { WizardPrompt, visibleLength, type PromptIO } from './prompt.js';

/** Minimal terminal: CSI cursor-up / erase-line / erase-down + SGR + LF. */
class MiniScreen {
  lines: string[] = [''];
  row = 0;
  col = 0;

  write(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]!;
      if (ch === '\u001b') {
        const match = /^\u001b\[[0-?]*[ -/]*[@-~]/.exec(chunk.slice(i));
        if (match) {
          this.csi(match[0]);
          i += match[0].length - 1;
        }
        continue;
      }
      if (ch === '\n') {
        this.row += 1;
        this.col = 0;
        this.grow();
        continue;
      }
      if (ch === '\r') {
        this.col = 0;
        continue;
      }
      this.grow();
      const line = this.lines[this.row] ?? '';
      this.lines[this.row] = line.slice(0, this.col) + ch + line.slice(this.col + 1);
      this.col += 1;
    }
  }

  private grow(): void {
    while (this.lines.length <= this.row) this.lines.push('');
  }

  private csi(seq: string): void {
    const body = seq.slice(2, -1);
    const final = seq[seq.length - 1]!;
    const n = Number.parseInt(body || '1', 10) || 1;
    if (final === 'A') {
      this.row = Math.max(0, this.row - n);
      this.col = 0;
    } else if (final === 'K') {
      this.grow();
      if (n === 2) this.lines[this.row] = '';
      else if (n === 0) this.lines[this.row] = this.lines[this.row]!.slice(0, this.col);
    } else if (final === 'J') {
      this.grow();
      if (n === 0) {
        this.lines[this.row] = this.lines[this.row]!.slice(0, this.col);
        this.lines.length = this.row + 1;
      }
    }
    // SGR (m) and anything else: no visual effect on the assertions
  }

  /** Non-empty rows as the user sees them. */
  screen(): string[] {
    return this.lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.length > 0);
  }
}

/** TTY double: `isTTY` + `setRawMode` so WizardPrompt takes its raw path. */
class FakeTTY extends PassThrough {
  isTTY = true;
  raw = false;
  setRawMode(mode: boolean): this {
    this.raw = mode;
    return this;
  }
}

function harness(): { io: PromptIO & { out: () => string }; input: FakeTTY; screen: MiniScreen } {
  const input = new FakeTTY();
  const screen = new MiniScreen();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback): void {
      const text = String(chunk);
      chunks.push(text);
      screen.write(text);
      callback();
    },
  });
  return { io: { input, output, isTTY: true, out: () => chunks.join('') }, input, screen };
}

const LANG_CHOICES = [
  { value: 'en', label: 'English', hint: 'default' },
  { value: 'pt', label: 'Português (Brasil)' },
];

describe('WizardPrompt box rendering', () => {
  const DOWN = '\u001b[B';
  const ENTER = '\r';

  it('does not leak rows while navigating with the arrow keys', async () => {
    const { io, input, screen } = harness();
    input.write(DOWN.repeat(5) + ENTER);

    const prompt = new WizardPrompt(io);
    const value = await prompt.select('Docs language', LANG_CHOICES, { defaultValue: 'en' });
    prompt.close();

    expect(value).toBe('pt');

    const rows = screen.screen().filter((line) => line.includes('┌') || line.includes('─') || line.includes('└') || line.startsWith('│'));
    // Exactly one box: no leftover top/bottom borders from previous paints.
    expect(rows.filter((line) => line.includes('┌'))).toHaveLength(1);
    expect(rows.filter((line) => line.includes('└'))).toHaveLength(1);
  });

  it('draws every box row at the same width (right border aligned)', async () => {
    const { io, input, screen } = harness();
    input.write(DOWN + DOWN + ENTER);

    const prompt = new WizardPrompt(io);
    await prompt.select('Docs language (README.md, PLUGIN.md, THEME.md)', LANG_CHOICES, {
      defaultValue: 'en',
    });
    prompt.close();

    const box = screen
      .screen()
      .filter((line) => /^[┌│└]/.test(line));
    expect(box.length).toBeGreaterThan(4);

    const widths = new Set(box.map((line) => visibleLength(line)));
    expect([...widths]).toHaveLength(1);
  });

  it('keeps the box inside the terminal when the content is too wide', async () => {
    const { io, input, screen } = harness();
    input.write(ENTER);

    const prompt = new WizardPrompt(io);
    await prompt.select(
      'A title long enough to overflow a narrow terminal window for sure',
      LANG_CHOICES,
      { defaultValue: 'en' }
    );
    prompt.close();

    for (const line of screen.screen()) {
      // Never wider than the 80-col fallback minus one: wrapping would turn a
      // painted row into two and break the repaint bookkeeping.
      expect(visibleLength(line)).toBeLessThanOrEqual(79);
    }
  });

  it('repaints the input box while typing without duplicating borders', async () => {
    const { io, input, screen } = harness();
    input.write('abcd\u007f' + '\r'); // "abcd", backspace, Enter

    const prompt = new WizardPrompt(io);
    const value = await prompt.ask('Project directory');
    prompt.close();

    expect(value).toBe('abc');
    const box = screen.screen().filter((line) => /^[┌│└]/.test(line));
    expect(box.filter((line) => line.includes('┌'))).toHaveLength(1);
    expect(new Set(box.map((line) => visibleLength(line))).size).toBe(1);
  });

  it('repaints after a validation error without leaking rows', async () => {
    const { io, input, screen } = harness();
    // First attempt fails validation ("ab" is kept); the second succeeds, so
    // the final value is "ab" + "abcdef".
    input.write('ab\r' + 'abcdef\r');

    const prompt = new WizardPrompt(io);
    const value = await prompt.ask('Project directory', {
      validate: (v) => (v.length >= 5 ? null : 'at least 5 chars'),
    });
    prompt.close();

    expect(value).toBe('ababcdef');
    const rows = screen.screen();
    expect(rows.filter((row) => row.includes('at least 5 chars'))).toHaveLength(1);
    expect(rows.filter((line) => line.includes('┌'))).toHaveLength(1);
  });

  it('repaints the confirm toggle in place', async () => {
    const { io, input, screen } = harness();
    input.write('y' + 'n' + ENTER);

    const prompt = new WizardPrompt(io);
    const value = await prompt.confirm('Continue?', { defaultValue: false });
    prompt.close();

    expect(value).toBe(false);
    const box = screen.screen().filter((line) => /^[┌│└]/.test(line));
    expect(box.filter((line) => line.includes('┌'))).toHaveLength(1);
    expect(box.join('\n')).toContain('No');
  });

  it('leaves stdin paused after a prompt so the process can exit', async () => {
    const { io, input } = harness();
    input.write(ENTER);

    const prompt = new WizardPrompt(io);
    await prompt.select('Mode', LANG_CHOICES, { defaultValue: 'en' });
    expect(input.isPaused()).toBe(true);

    prompt.close();
    expect(input.isPaused()).toBe(true);
  });
});
