#!/usr/bin/env node
/**
 * scripts/sync-version.mjs
 *
 * SINCRONIZADOR DE VERSÃO — fonte única: `version` na raiz (package.json).
 *
 * Propaga a versão da raiz para TODAS as âncoras do monorepo:
 *   1. todos os pacotes do grupo `fixed` do changesets (lockstep);
 *   2. CMS_VERSION em packages/validation/src/compatibility.ts;
 *   3. arquivo CMS_VERSION na raiz.
 *
 *戮 Uso:
 *   bun run sync-version            # valida e sai com 0 se tudo alinhado
 *   bun run sync-version --write    # reescreve âncoras dessincronizadas
 *   bun run sync-version --set 0.6.0 [--write]
 *                                   # muda a raiz para 0.6.0 e valida
 *                                   # (com --write, propaga para tudo)
 *
 * Comportamento:
 *   - sem --write: modo CHECK. Exit 0 = tudo alinhado; exit 1 = divergências
 *     (lista o que --write corrigiria). Nunca altera arquivos.
 *   - --write: altera apenas o que diverge (manifests intocados ficam intactos)
 *     e revalida ao final, exit 1 se ainda houver divergência (não deveria).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SEMVER = /^\d+\.\d+\.\d+$/;
const GROUPS = ['packages', 'apps', 'plugins', 'themes'];

const errors = [];
const writes = [];

const args = process.argv.slice(2);
let write = false;
let setVersion = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--write') write = true;
  else if (args[i] === '--set') setVersion = args[++i] ?? '';
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------------------------------------------------------------------------
// raiz — fonte da verdade
// ---------------------------------------------------------------------------
const rootPath = join(ROOT, 'package.json');
const rootPkg = readJson(rootPath);
if (setVersion) {
  if (!SEMVER.test(setVersion)) {
    console.error(`✗ --set "${setVersion}" não é semver X.Y.Z`);
    process.exit(1);
  }
  if (rootPkg.version !== setVersion) {
    if (write) {
      rootPkg.version = setVersion;
      writes.push({ path: rootPath, label: 'raiz package.json', detail: `${rootPkg.version} → ${setVersion}` });
    }
    rootPkg.version = setVersion;
  }
}
const version = rootPkg.version;
if (!SEMVER.test(String(version))) {
  console.error(`✗ raiz: version "${version}" não é semver X.Y.Z`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// inventário de workspaces + grupo fixed do changesets
// ---------------------------------------------------------------------------
const workspaces = [];
for (const group of GROUPS) {
  const base = join(ROOT, group);
  if (!existsSync(base)) continue;
  for (const entry of readdirSync(base).sort()) {
    const jsonPath = join(base, entry, 'package.json');
    if (!existsSync(jsonPath)) continue;
    workspaces.push({ dir: `${group}/${entry}`, jsonPath, json: readJson(jsonPath) });
  }
}
const byName = new Map(workspaces.map((w) => [w.json.name, w]));

const csConfigPath = join(ROOT, '.changeset', 'config.json');
let fixedNames = [];
if (existsSync(csConfigPath)) {
  const cs = readJson(csConfigPath);
  fixedNames = Array.isArray(cs.fixed) ? cs.fixed.flat(Infinity) : [];
  for (const n of fixedNames) {
    if (!byName.has(n) || byName.get(n).json.private === true) {
      errors.push(`changesets "fixed" cita pacote inexistente/privado: ${n}`);
    }
  }
} else {
  errors.push('.changeset/config.json não encontrado');
}

// ---------------------------------------------------------------------------
// 1. fixed group === raiz
// ---------------------------------------------------------------------------
for (const n of fixedNames) {
  if (errors.some((e) => e.includes(n))) continue;
  const w = byName.get(n);
  if (w.json.version !== version) {
    if (write) {
      w.json.version = version;
      writes.push({ path: w.jsonPath, label: n, detail: `${w.json.version} → ${version}` });
      // reflete no objeto para validação em tempo real
      w.json.version = version;
    } else {
      errors.push(`${n}: ${w.json.version} (esperado ${version})`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. CMS_VERSION em compatibility.ts === raiz
// ---------------------------------------------------------------------------
const compatPath = join(ROOT, 'packages', 'validation', 'src', 'compatibility.ts');
if (existsSync(compatPath)) {
  const content = readFileSync(compatPath, 'utf8');
  const match = content.match(/CMS_VERSION\s*=\s*'([^']+)'/);
  if (!match) {
    errors.push('CMS_VERSION não encontrado em packages/validation/src/compatibility.ts');
  } else if (match[1] !== version) {
    if (write) {
      const updated = content.replace(
        /CMS_VERSION\s*=\s*'[^']+'/,
        `CMS_VERSION = '${String(version)}'`,
      );
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
// 3. arquivo CMS_VERSION na raiz === raiz
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
} else {
  errors.push('arquivo CMS_VERSION não encontrado na raiz');
}

// ---------------------------------------------------------------------------
// relatório
// ---------------------------------------------------------------------------
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  if (write) {
    console.error(`\n✗ ${errors.length} divergência(s) NÃO corrigidas(s) — revisar manualmente.`);
    process.exit(1);
  }
  console.error(`\n✗ ${errors.length} divergência(s). Corrija com: bun run sync-version --write`);
  process.exit(1);
}

if (write && writes.length) {
  // 1) grava manifests JSON in-place atualizados (o objeto `w.json` mutado em
  //    memória já está com a versão nova; o raiz idem)
  if (writes.some((w) => w.path === rootPath)) {
    writeFileSync(rootPath, JSON.stringify(rootPkg, null, 2) + '\n');
  }
  for (const w of workspaces) {
    if (writes.some((x) => x.path === w.jsonPath)) {
      writeFileSync(w.jsonPath, JSON.stringify(w.json, null, 2) + '\n');
    }
  }
  // 2) relatório legível
  for (const w of writes) console.log(`✎ ${w.label}: ${w.detail}`);
  console.log(`\n✓ ${writes.length} arquivo(s) sincronizado(s) para ${version}`);
} else if (write) {
  console.log(`✓ nada a sincronizar — raiz ${version} já alinhada`);
} else {
  console.log(`✓ versão sincronizada — raiz ${version} (fixed, CMS_VERSION e arquivo CMS_VERSION alinhados)`);
}
