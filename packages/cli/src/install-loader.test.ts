// @oktis-works/cms - install loader block fitting (regression tests)
//
// Reproduces the "loader repeats itself" bug: the live block was taller than
// the terminal, so every repaint scrolled the previous copy into the scrollback
// where `ESC[0J` can no longer reach it. The fix caps the block to the
// terminal height and summarizes the packages that do not fit.

import { describe, it, expect, afterEach } from 'vitest';
import { fitBlock, maxRows } from './install-loader.js';

const header = '  Installing dependencies with bun';
const rows = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `    \u2713 pkg${i}@1.2.3`);

describe('fitBlock', () => {
  it('returns the block untouched when it already fits', () => {
    const lines = [header, ...rows(3)];
    expect(fitBlock(lines, 10)).toEqual(lines);
  });

  it('never exceeds the row limit', () => {
    const lines = [header, ...rows(41)];
    const fitted = fitBlock(lines, 24);
    expect(fitted.length).toBeLessThanOrEqual(24);
  });

  it('keeps the header and shows the real hidden count', () => {
    const lines = [header, ...rows(41)];
    const fitted = fitBlock(lines, 10);

    expect(fitted[0]).toBe(header);
    expect(fitted.length).toBe(10);
    // 41 rows: header + 8 shown + summary = 10 -> 33 hidden
    expect(fitted.at(-1)).toContain('\u2026 33 more');
    expect(fitted).toHaveLength(10);
  });

  it('handles a limit of 1 row (header only, no summary)', () => {
    const fitted = fitBlock([header, ...rows(41)], 1);
    expect(fitted).toEqual([header]);
  });

  it('handles a limit of 2 rows (header + summary)', () => {
    const fitted = fitBlock([header, ...rows(41)], 2);
    expect(fitted).toHaveLength(2);
    expect(fitted[0]).toBe(header);
    expect(fitted.at(-1)).toContain('41 more');
  });
});

describe('maxRows', () => {
  /** `rows` only exists on a TTY — the test process is not one. */
  function setRows(value: number | undefined): void {
    Object.defineProperty(process.stdout, 'rows', {
      value,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    delete (process.stdout as { rows?: number }).rows;
  });

  it('leaves one row of headroom below the terminal height', () => {
    setRows(24);
    expect(maxRows()).toBe(23);
  });

  it('never returns fewer than 4 rows', () => {
    setRows(2);
    expect(maxRows()).toBe(4);
  });

  it('falls back to 24 rows when the terminal height is unknown', () => {
    setRows(undefined);
    expect(maxRows()).toBe(23);
  });
});
