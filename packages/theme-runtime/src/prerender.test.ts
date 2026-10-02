// @oktis-works/theme-runtime - Prerender estático

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prerenderStatic, routeToOutputFile } from './prerender.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bl-prerender-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('routeToOutputFile', () => {
  it('mapeia rotas para arquivos hierárquicos', () => {
    expect(routeToOutputFile('/')).toBe(join('index', 'index.html'));
    expect(routeToOutputFile('/meu-post')).toBe(join('meu-post', 'index.html'));
    expect(routeToOutputFile('/docs/guia/')).toBe(join('docs', 'guia', 'index.html'));
  });

  it('rejeita path traversal', () => {
    expect(() => routeToOutputFile('/../etc')).toThrow('inseguro');
  });
});

describe('prerenderStatic', () => {
  it('escreve index.html por rota e reporta estatísticas', async () => {
    const result = await prerenderStatic(
      [
        { path: '/', render: () => '<h1>home</h1>' },
        { path: '/post-a', render: async () => '<h1>A</h1>' },
      ],
      dir
    );

    expect(result.pages).toBe(2);
    expect(result.failed).toEqual([]);
    expect(readFileSync(join(dir, 'index', 'index.html'), 'utf-8')).toContain('home');
    expect(readFileSync(join(dir, 'post-a', 'index.html'), 'utf-8')).toContain('A');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('falha em uma rota não aborta o lote', async () => {
    const result = await prerenderStatic(
      [
        { path: '/ok', render: () => '<p>ok</p>' },
        {
          path: '/boom',
          render: () => {
            throw new Error('template crash');
          },
        },
      ],
      dir
    );

    expect(result.pages).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ path: '/boom' });
    expect(existsSync(join(dir, 'boom'))).toBe(false);
  });
});
