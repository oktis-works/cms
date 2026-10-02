// @oktis-works/theme-runtime - Prerender estático (SSG) — theme-rendering-002

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export interface PrerenderRoute {
  /** Caminho público da rota, ex.: '/', '/meu-post' */
  path: string;
  /** Produz o HTML final da rota. */
  render: () => Promise<string> | string;
}

export interface PrerenderResult {
  pages: number;
  failed: Array<{ path: string; error: string }>;
  outputDir: string;
  durationMs: number;
}

/** Converte um caminho de rota no arquivo de saída hierárquico (dir/index.html). */
export function routeToOutputFile(routePath: string): string {
  const normalized = routePath.split('?')[0]!.replace(/\/+/g, '/').replace(/\/$/, '');
  const safe = normalized === '' ? 'index' : normalized.replace(/^\//, '');
  if (safe.includes('..')) throw new Error(`Caminho inseguro para prerender: ${routePath}`);
  return join(safe, 'index.html');
}

/**
 * Gera HTML estático para as rotas informadas, escrevendo <outDir>/<rota>/index.html.
 * Falhas por rota não abortam o lote — são reportadas em `failed`.
 */
export async function prerenderStatic(routes: PrerenderRoute[], outDir: string): Promise<PrerenderResult> {
  const started = Date.now();
  const outputDir = resolve(outDir);
  await mkdir(outputDir, { recursive: true });

  const failed: Array<{ path: string; error: string }> = [];
  let pages = 0;

  for (const route of routes) {
    try {
      const html = await route.render();
      const file = join(outputDir, routeToOutputFile(route.path));
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, html, 'utf-8');
      pages += 1;
    } catch (error) {
      failed.push({ path: route.path, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { pages, failed, outputDir, durationMs: Date.now() - started };
}

export function assertSafeOutDir(outDir: string, root: string): boolean {
  return resolve(outDir).startsWith(resolve(root) + sep) || resolve(outDir) === resolve(root);
}
