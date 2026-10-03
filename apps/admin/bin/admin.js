#!/usr/bin/env bun
// @oktis-works/admin - Entrada executável (build de produção Astro standalone)
// `bunx @oktis-works/admin` sobe o servidor Node gerado por `astro build`.
import { existsSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installListenLogRewrite, rewriteListenChunk } from './listen-log.js';

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, '..', 'dist', 'server', 'entry.mjs');

if (!existsSync(entry)) {
  console.error(`[admin] Build de produção não encontrado em ${entry}`);
  console.error('[admin] Rode `bun run build` no pacote @oktis-works/admin antes de executar.');
  process.exit(1);
}

// Corrige o aviso de listen ANTES de importar o entry: protocolo http:// de
// verdade e sem a linha network: de IP interno quando em WSL (ver listen-log.js).
const isWsl = /microsoft/i.test(release());
installListenLogRewrite(console, isWsl);
const rawWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  if (typeof chunk !== 'string') return rawWrite(chunk, ...rest);
  const rewritten = rewriteListenChunk(chunk, isWsl);
  if (rewritten === null) return true;
  return rawWrite(rewritten, ...rest);
};

// O entry do @astrojs/node (standalone) auto-inicia o servidor no import,
// a menos que ASTRO_NODE_AUTOSTART=disabled.
await import(pathToFileURL(entry).href);
