#!/usr/bin/env bun
// @oktis-works/admin - Entrada executável (build de produção Astro standalone)
// `bunx @oktis-works/admin` sobe o servidor Node gerado por `astro build`.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, '..', 'dist', 'server', 'entry.mjs');

if (!existsSync(entry)) {
  console.error(`[admin] Build de produção não encontrado em ${entry}`);
  console.error('[admin] Rode `bun run build` no pacote @oktis-works/admin antes de executar.');
  process.exit(1);
}

// O entry do @astrojs/node (standalone) auto-inicia o servidor no import,
// a menos que ASTRO_NODE_AUTOSTART=disabled.
await import(pathToFileURL(entry).href);
