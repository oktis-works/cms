#!/usr/bin/env node
/**
 * scripts/prepare-publish.mjs
 *
 * Valida TODO o sistema de versionamento do monorepo e prepara os manifests
 * para `npm publish`.
 *
 * Sistema de versionamento deste repositório:
 *   1. Changesets (.changeset/): todos os pacotes são INDEPENDENTES — cada
 *      um tem bump próprio (`bun run changeset` + `bun run version-packages`).
 *   2. CMS_VERSION (packages/validation/src/compatibility.ts) === versão de
 *      @oktis-works/validation — versão do produto usada na compatibilidade
 *      de plugins/temas (`compatibility.okcms`). Sincronize com
 *      `bun run sync-version --write`.
 *   3. Tag `vX.Y.Z`: é só o GATILHO do release (CI → publish). Não precisa
 *      bater com a versão de nenhum pacote.
 *
 * Regras BLOQUEANTES (exit 1):
 *   - toda versão de manifest publicável é semver `X.Y.Z`;
 *   - todos os pacotes do grupo `fixed` (se houver) compartilham a MESMA versão;
 *   - CMS_VERSION (const e arquivo) === versão de @oktis-works/validation;
 *   - com `--tag`: a tag é `vX.Y.Z` (formato apenas — é um gatilho).
 *
 * AVISOS (não bloqueiam):
 *   - changesets pendentes em .changeset/*.md (valem para a PRÓXIMA release).
 *
 * REESCRIA (a menos que `--check`):
 *   - `"workspace:*"` → `"^versão"` do pacote de destino (range interno: o
 *     dependente não precisa ser republicado quando a dependência anda e o
 *     consumidor resolve a atual via `bun update`, sem cópias aninhadas). O
 *     npm NÃO entende o protocolo `workspace:` e publicaria o literal,
 *     quebrando `npm install` dos consumidores. Em CI isso é efêmero;
 *     localmente restaure com `git checkout -- .` após publicar.
 *
 * Uso:
 *   node scripts/prepare-publish.mjs                # valida + reescreve
 *   node scripts/prepare-publish.mjs --check        # só valida (não toca nos manifests)
 *   node scripts/prepare-publish.mjs --tag v0.1.2   # valida também a tag da release
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SEMVER = /^\d+\.\d+\.\d+$/;
const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const GROUPS = ['packages', 'apps', 'plugins', 'themes'];

const errors = [];
const warnings = [];

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
let checkOnly = false;
let tag = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--check') checkOnly = true;
  else if (args[i] === '--tag') tag = args[++i] ?? '';
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const rel = (path) => path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path;

// ---------------------------------------------------------------------------
// inventário de workspaces
// ---------------------------------------------------------------------------
const rootPkg = readJson(join(ROOT, 'package.json'));

const workspaces = [];
for (const group of GROUPS) {
  const base = join(ROOT, group);
  if (!existsSync(base)) continue;
  for (const entry of readdirSync(base).sort()) {
    const jsonPath = join(base, entry, 'package.json');
    if (!existsSync(jsonPath)) continue;
    const json = readJson(jsonPath);
    workspaces.push({
      dir: `${group}/${entry}`,
      jsonPath,
      name: json.name ?? null,
      version: json.version ?? null,
      private: json.private === true,
      json,
    });
  }
}
const published = workspaces.filter((w) => !w.private);
const byName = new Map(workspaces.map((w) => [w.name, w]));

// ---------------------------------------------------------------------------
// 1. semver de tudo que é publicável
// ---------------------------------------------------------------------------
if (!SEMVER.test(String(rootPkg.version))) {
  errors.push(`raiz: version "${rootPkg.version}" não é semver X.Y.Z`);
}
for (const w of published) {
  if (!w.name) errors.push(`${w.dir}: package.json sem "name"`);
  if (!SEMVER.test(String(w.version))) errors.push(`${w.name ?? w.dir}: version "${w.version}" não é semver X.Y.Z`);
}

// ---------------------------------------------------------------------------
// 2. grupo `fixed` do changesets — lockstep obrigatório
// ---------------------------------------------------------------------------
let fixedNames = [];
let fixedVersion = null;
const csConfigPath = join(ROOT, '.changeset', 'config.json');
if (existsSync(csConfigPath)) {
  const csConfig = readJson(csConfigPath);
  fixedNames = Array.isArray(csConfig.fixed) ? csConfig.fixed.flat() : [];
  // Se fixed estiver vazio, pula validação de lockstep
  if (fixedNames.length > 0) {
    const missing = fixedNames.filter((n) => !byName.has(n) || byName.get(n).private);
    if (missing.length) {
      errors.push(`changesets "fixed" cita pacotes inexistentes ou privados: ${missing.join(', ')}`);
    }
    const versions = new Map();
    for (const name of fixedNames) {
      const w = byName.get(name);
      if (w && !w.private) versions.set(name, w.version);
    }
    const distinct = [...new Set(versions.values())];
    if (distinct.length > 1) {
      errors.push(
        `grupo "fixed" do changesets desalinhado (deve ser lockstep): ` +
          [...versions].map(([n, v]) => `${n}@${v}`).join(', '),
      );
    }
    if (distinct.length === 1) fixedVersion = distinct[0];
  }
} else {
  warnings.push('.changeset/config.json não encontrado — validação do grupo "fixed" pulada');
}

// ---------------------------------------------------------------------------
// 3. CMS_VERSION (const e arquivo) === versão de @oktis-works/validation
// ---------------------------------------------------------------------------
const validationVersion = byName.get('@oktis-works/validation')?.version ?? null;
if (!validationVersion) {
  errors.push('@oktis-works/validation não encontrado nos workspaces');
} else {
  const compatPath = join(ROOT, 'packages', 'validation', 'src', 'compatibility.ts');
  if (existsSync(compatPath)) {
    const match = readFileSync(compatPath, 'utf8').match(/CMS_VERSION\s*=\s*'([^']+)'/);
    if (!match) {
      errors.push('CMS_VERSION não encontrado em packages/validation/src/compatibility.ts');
    } else if (match[1] !== validationVersion) {
      errors.push(
        `CMS_VERSION (${match[1]}) diverge de @oktis-works/validation (${validationVersion}) — ` +
          `rode \`bun run sync-version --write\` para propagar`,
      );
    }
  } else {
    errors.push('packages/validation/src/compatibility.ts não encontrado');
  }

  // 3b. arquivo CMS_VERSION na raiz === versão do validation
  const cmsVersionPath = join(ROOT, 'CMS_VERSION');
  if (existsSync(cmsVersionPath)) {
    const current = readFileSync(cmsVersionPath, 'utf8').trim();
    if (current !== validationVersion) {
      errors.push(
        `arquivo CMS_VERSION (${current}) diverge de @oktis-works/validation (${validationVersion}) — ` +
          `rode \`bun run sync-version --write\` para propagar`,
      );
    }
  } else {
    warnings.push('arquivo CMS_VERSION não encontrado na raiz — pulando validação 3b');
  }
}

// ---------------------------------------------------------------------------
// 4. tag da release — só o formato vX.Y.Z (a tag é o gatilho do CI)
// ---------------------------------------------------------------------------
if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) {
  errors.push(`tag "${tag}" fora do padrão vX.Y.Z — a release precisa ser tagada como vX.Y.Z`);
}

// ---------------------------------------------------------------------------
// 5. avisos (não bloqueiam)
// ---------------------------------------------------------------------------
const csDir = join(ROOT, '.changeset');
if (existsSync(csDir)) {
  const pending = readdirSync(csDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
  if (pending.length) {
    warnings.push(
      `changesets pendentes em .changeset/: ${pending.join(', ')} — se esta release deveria ` +
        `consumi-los, rode \`bun run version-packages\` antes de tagar`,
    );
  }
}

// ---------------------------------------------------------------------------
// relatório de validação (bloqueia antes de tocar em qualquer manifest)
// ---------------------------------------------------------------------------
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n✗ ${errors.length} erro(s) no sistema de versionamento — nada foi alterado.`);
  process.exit(1);
}
for (const w of warnings) console.log(`⚠️  ${w}`);
console.log(
  `✓ versionamento válido` +
    (fixedVersion ? ` | grupo fixed ${fixedVersion}` : '') +
    (validationVersion ? ` | CMS_VERSION ${validationVersion}` : '') +
    (tag ? ` | tag ${tag} (gatilho)` : '') +
    ` | ${published.length} pacotes publicáveis`,
);

// ---------------------------------------------------------------------------
// reescrita workspace:* → versão concreta (fase 1: validar, fase 2: escrever)
// ---------------------------------------------------------------------------
if (checkOnly) {
  console.log('✓ modo --check: manifests não foram alterados.');
  process.exit(0);
}

const versions = new Map(workspaces.map((w) => [w.name, w.version]));
const targets = [...workspaces.map((w) => w.jsonPath), join(ROOT, 'package.json')];
const plan = [];

for (const path of targets) {
  const json = readJson(path);
  for (const section of DEP_SECTIONS) {
    const deps = json[section];
    if (!deps) continue;
    for (const [dep, range] of Object.entries(deps)) {
      if (typeof range !== 'string' || !range.startsWith('workspace:')) continue;
      const depVersion = versions.get(dep);
      if (!depVersion) {
        errors.push(`${rel(path)}: dependência "${dep}" usa workspace: mas não é um workspace conhecido`);
        continue;
      }
      const spec = range.slice('workspace:'.length);
      // `workspace:*` publica como ^X.Y.Z (range interno): dependente não
      // precisa ser republicado toda vez que a dependência interna anda —
      // sem âncora exata, o consumidor resolve a versão atual via `bun update`
      // (sem cópias aninhadas/stale, ex.: api com database@0.1.3 preso).
      const concrete =
        spec === '' || spec === '*' || spec === '^'
          ? `^${depVersion}`
          : spec === '~'
            ? `~${depVersion}`
            : spec;
      plan.push({ path, section, dep, range, concrete });
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error('\n✗ reescrita abortada — manifests intactos.');
  process.exit(1);
}

for (const path of new Set(plan.map((p) => p.path))) {
  const json = readJson(path);
  for (const p of plan.filter((pp) => pp.path === path)) {
    json[p.section][p.dep] = p.concrete;
    console.log(`  ${rel(path)}: ${p.dep} ${p.range} → ${p.concrete}`);
  }
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
}

// pós-assert: nenhum workspace: pode sobrar
for (const path of targets) {
  const json = readJson(path);
  for (const section of DEP_SECTIONS) {
    for (const [dep, range] of Object.entries(json[section] ?? {})) {
      if (String(range).startsWith('workspace:')) {
        errors.push(`${rel(path)}: "${dep}" ainda está em ${range}`);
      }
    }
  }
}
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}

console.log(
  plan.length
    ? `✓ ${plan.length} referência(s) workspace: reescrita(s) — restaure com \`git checkout -- .\` após publicar localmente.`
    : '✓ nenhuma referência workspace: presente.',
);
