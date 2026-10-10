#!/usr/bin/env node
/**
 * scripts/sync-version.mjs
 *
 * SINCRONIZADOR DE CMS_VERSION — fonte única: versão de `@oktis-works/validation`.
 *
 * `CMS_VERSION` (packages/validation/src/compatibility.ts) é a versão do CMS
 * contra a qual plugins/temas são validados (`compatibility.okcms`) e o valor
 * que o scaffold grava nos manifestos. Como o monorepo é versionado de forma
 * INDEPENDENTE (changesets sem grupo fixed), o "produto" é a própria versão do
 * pacote validation — logo CMS_VERSION acompanha a versão dele.
 *
 * Propaga a versão do validation para as duas âncoras:
 *   1. `CMS_VERSION` em packages/validation/src/compatibility.ts;
 *   2. arquivo CMS_VERSION na raiz (referência humana/deploy).
 *
 * Uso:
 *   bun run sync-version            # valida e sai com 0 se tudo alinhado
 *   bun run sync-version --write    # reescreve âncoras dessincronizadas
 *
 * Comportamento:
 *   - sem --write: modo CHECK. Exit 0 = tudo alinhado; exit 1 = divergências.
 *   - --write: altera apenas o que diverge e revalida ao final.
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
// fonte da verdade: versão de @oktis-works/validation
// ---------------------------------------------------------------------------
const validationPath = join(ROOT, 'packages', 'validation', 'package.json');
const validationPkg = JSON.parse(readFileSync(validationPath, 'utf8'));
const version = validationPkg.version;
if (!SEMVER.test(String(version))) {
  console.error(`✗ @oktis-works/validation: version "${version}" não é semver X.Y.Z`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. CMS_VERSION em compatibility.ts === versão do validation
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
// 2. arquivo CMS_VERSION na raiz === versão do validation
// ---------------------------------------------------------------------------
const cmsVersionPath = join(ROOT, 'CMS_VERSION');
if (existsSync(cmsVersionPath)) {
  const current = readFileSync(cmsVersionPath, 'utf8').trim();
  if (current !== String(version)) {
    if (write) {
      writes.push({ path: cmsVersionPath, label: 'CMS_VERSION (arquivo raiz)', detail: `${current} → ${version}` });
      writeFileSync(cmsVersionPath, `${version}\n`);
    } else {
      errors.push(`CMS_VERSION (arquivo): ${current} (esperado ${version})`);
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
  console.log(`\n✓ ${writes.length} arquivo(s) sincronizado(s) para @oktis-works/validation@${version}`);
} else {
  console.log(`✓ CMS_VERSION sincronizado — @oktis-works/validation@${version}`);
}
