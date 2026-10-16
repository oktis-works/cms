#!/usr/bin/env node
/**
 * scripts/sync-version.mjs
 *
 * SINCRONIZADOR DE CMS_VERSION — fonte única: âncora de versão de PRODUTO.
 *
 * A versão do produto é o `version` do package.json da raiz (workspace
 * PRIVADO `okcms`, nunca publicado no npm — logo livre para carregar a
 * semântica de produto). É ela que:
 *   - vira `CMS_VERSION` (packages/validation/src/compatibility.ts), a versão
 *     contra a qual plugins/temas são validados (`compatibility.okcms`) e que
 *     o scaffold grava nos manifestos;
 *   - deve ser igual à tag do release (`vX.Y.Z` — validado no prepare-publish).
 *
 * Os pacotes do monorepo são INDEPENDENTES (changesets): `@oktis-works/validation`
 * segue a sua própria numeração de biblioteca — ela NÃO é a versão do produto
 * (anti-padrão: versão de produto dentro de uma lib publicada).
 *
 * Propaga a âncora de produto para as duas âncoras derivadas:
 *   1. `CMS_VERSION` em packages/validation/src/compatibility.ts;
 *   2. arquivo CMS_VERSION na raiz (referência humana/deploy).
 *
 * Uso:
 *   bun run sync-version            # valida e sai com 0 se tudo alinhado
 *   bun run sync-version --write    # reescreve âncoras dessincronizadas
 *
 * Bump de release: edite `version` no package.json da raiz (ex.: 0.12.0) e
 * rode `bun run sync-version --write` — ou apenas `bun run version-packages`,
 * que já roda este script no fim.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

const args = process.argv.slice(2);
const write = args.includes('--write');

const errors = [];
const writes = [];

// ---------------------------------------------------------------------------
// fonte da verdade: âncora de versão de produto (package.json da raiz)
// ---------------------------------------------------------------------------
const rootPath = join(ROOT, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPath, 'utf8'));
const version = rootPkg.version;
if (!SEMVER.test(String(version))) {
  console.error(`✗ âncora de produto (package.json da raiz): version "${version}" não é semver X.Y.Z`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. CMS_VERSION em compatibility.ts === âncora de produto
// ---------------------------------------------------------------------------
const compatPath = join(ROOT, 'packages', 'validation', 'src', 'compatibility.ts');
if (existsSync(compatPath)) {
  const content = readFileSync(compatPath, 'utf8');
  const match = content.match(/CMS_VERSION\s*=\s*'([^']+)'/);
  if (!match) {
    errors.push('CMS_VERSION não encontrado em packages/validation/src/compatibility.ts');
  } else if (match[1] !== version) {
    if (write) {
      const updated = content.replace(/CMS_VERSION\s*=\s*'[^']+'/, `CMS_VERSION = '${version}'`);
      writes.push({ path: compatPath, label: 'CMS_VERSION (compatibility.ts)', detail: `${match[1]} → ${version}` });
      writeFileSync(compatPath, updated);
    } else {
      errors.push(`CMS_VERSION (compatibility.ts): ${match[1]} (esperado ${version})`);
    }
  }
} else {
  errors.push('packages/validation/src/compatibility.ts não encontrado');
}

// ---------------------------------------------------------------------------
// 2. arquivo CMS_VERSION na raiz === âncora de produto
// ---------------------------------------------------------------------------
const cmsVersionPath = join(ROOT, 'CMS_VERSION');
if (existsSync(cmsVersionPath)) {
  const current = readFileSync(cmsVersionPath, 'utf8').trim();
  if (current !== String(version)) {
    if (write) {
      writes.push({ path: cmsVersionPath, label: 'CMS_VERSION (arquivo raiz)', detail: `${current} → ${version}` });
      writeFileSync(cmsVersionPath, `${version}\n`);
    } else {
      errors.push(`arquivo CMS_VERSION (${current}) (esperado ${version})`);
    }
  }
} else if (write) {
  writes.push({ path: cmsVersionPath, label: 'CMS_VERSION (arquivo raiz)', detail: `criado ${version}` });
  writeFileSync(cmsVersionPath, `${version}\n`);
} else {
  errors.push('arquivo CMS_VERSION não encontrado na raiz');
}

// ---------------------------------------------------------------------------
// relatório
// ---------------------------------------------------------------------------
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  if (write) {
    console.error(`\n✗ ${errors.length} divergência(s) NÃO corrigida(s) — revisar manualmente.`);
  } else {
    console.error(`\n✗ ${errors.length} divergência(s). Corrija com: bun run sync-version --write`);
  }
  process.exit(1);
}

if (write && writes.length) {
  for (const w of writes) console.log(`✎ ${w.label}: ${w.detail}`);
  console.log(`\n✓ ${writes.length} arquivo(s) sincronizado(s) para a versão de produto ${version}`);
} else {
  console.log(`✓ CMS_VERSION sincronizado — versão de produto ${version}`);
}
