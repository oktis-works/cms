// @oktis-works/cms - Project Scaffolding

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultProjectConfig, DEFAULT_CONFIG_FILENAME } from './project-config.js';
import { DEPLOY_GITIGNORE } from './assets.js';
import { writeDeployAssets } from './bluegreen.js';
import { DEFAULT_DOCS_LANG, docsLangLabel, pluginDoc, projectReadme, themeDoc } from './scaffold-docs.js';
import type { DocsLang } from './scaffold-docs.js';
import { style, symbol } from './prompt.js';

/** Normaliza o nome do projeto para um npm name válido (slug). */
export function toPackageName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug.length > 0 ? slug : 'okcms-project';
}

/**
 * Range que o projeto usa para os 5 pacotes do OkCMS (4 apps + a própria CLI).
 *
 * Por que não `^0.2.0` (o minor da CLI):
 *   `^0.2.0` em 0.x é `>=0.2.0 <0.3.0` — se os apps ainda não foram publicados
 *   nesse minor (mudanças no `ignore` do changeset, como admin/web, podem ficar
 *   um release atrás), o `bun install` do scaffold cai em ETARGET. Foi
 *   exatamente esse o bug de 0.1.14 → 0.2.0.
 *
 * A janela é de DOIS minors em 0.x — para cima e para baixo — então o npm/bun
 * sempre acha a versão mais nova publicada dentro dela. Como os cinco
 * pacotes compartilham o MESMO range, eles também ficam consistentes entre si.
 * A partir de 1.x vira `^MAJOR.0.0` (compatibilidade semântica madura).
 */
export function appRangeFor(cliVersion: string): string {
  const [rawMajor, rawMinor] = cliVersion.split('.');
  const major = Number(rawMajor);
  const minor = Number(rawMinor);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 0 || minor < 0) {
    // versão ilegível → cai no comportamento histórico em vez de quebrar o init
    return `^${cliVersion}`;
  }
  if (major > 0) return `>=${major}.0.0 <${major + 1}.0.0`;
  const lower = minor > 0 ? minor - 1 : 0;
  return `>=0.${lower}.0 <0.${minor + 1}.0`;
}

/**
 * Acrescenta ao `.gitignore` do projeto só o que ainda não está lá.
 *
 * `okcms init` pode rodar num diretório que o operador já versionou — reescrever
 * o arquivo apagaria as regras dele. Por isso é merge, sempre.
 */
async function mergeGitignore(root: string, entries: string[]): Promise<void> {
  const path = join(root, '.gitignore');
  const current = existsSync(path) ? await readFile(path, 'utf-8') : '';
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = entries.filter((entry) => !present.has(entry));
  if (missing.length === 0) return;

  const body = current.length === 0 ? '' : `${current.replace(/\s+$/, '')}\n\n`;
  const header = current.length === 0 ? '# OkCMS\n' : '# okcms init\n';
  await writeFile(`${path}`, `${body}${header}${missing.join('\n')}\n`, 'utf-8');
}

export async function scaffoldProject(
  targetDir: string,
  name: string,
  lang: DocsLang = DEFAULT_DOCS_LANG,
  /** Runs after the files are written and BEFORE the "Next steps" summary. */
  beforeSummary?: () => Promise<void>
): Promise<string> {
  const root = resolve(process.cwd(), targetDir);

  console.log(`Creating project "${name}" at ${root}...`);

  await mkdir(join(root, 'themes'), { recursive: true });
  await mkdir(join(root, 'plugins'), { recursive: true });
  await mkdir(join(root, 'migrations'), { recursive: true });

  const config = defaultProjectConfig(name);
  await writeFile(
    join(root, DEFAULT_CONFIG_FILENAME),
    JSON.stringify(config, null, 2),
    'utf-8'
  );

  // package.json do projeto — apps do OkCMS como dependências. O range vem de
  // `appRangeFor` (janela de dois minors em 0.x) e NUNCA é a versão exata do
  // CLI; ver a documentação dessa função para o histórico do ETARGET.
  // Não sobrescreve manifest existente.
  const cliPkg = await import('../package.json', { with: { type: 'json' } });
  const cliVersion = cliPkg.default.version as string;
  const appRange = appRangeFor(cliVersion);
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) {
    const manifest = {
      name: toPackageName(name),
      version: '0.1.0',
      private: true,
      // Atalhos executáveis sem instalação global: npm/bun injetam
      // node_modules/.bin no PATH de scripts — `bun run migrate` /
      // `npm run start` funcionam logo após o init.
      scripts: {
        start: 'okcms start',
        stop: 'okcms stop',
        status: 'okcms status',
        doctor: 'okcms doctor',
        migrate: 'okcms db:migrate',
        backup: 'okcms db:backup',
      },
      dependencies: {
        '@oktis-works/api': appRange,
        '@oktis-works/admin': appRange,
        '@oktis-works/web': appRange,
        '@oktis-works/worker': appRange,
      },
      devDependencies: {
        // CLI fixada no projeto: `npx okcms ...` usa a versão local compatível
        // com os apps instalados (sem buscar outra no registry).
        '@oktis-works/cms': appRange,
      },
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  }

  const envExample = `# OkCMS
# Database connection — pick ONE format:
# (a) separate variables (default, used below):
DB_HOST=${process.env['DB_HOST'] ?? 'localhost'}
DB_PORT=${process.env['DB_PORT'] ?? '5432'}
DB_NAME=${process.env['DB_NAME'] ?? 'okcms'}
DB_USER=${process.env['DB_USER'] ?? 'postgres'}
DB_PASSWORD=
# (b) single URL — takes precedence over the DB_* above:
# DATABASE_URL=postgresql://postgres:password@localhost:5432/okcms

# Redis (cache + worker queues)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Storage (local | s3)
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=.data/storage

# Ports
PORT=${config.ports.api}
ADMIN_PORT=${config.ports.admin}
WEB_PORT=${config.ports.web}

# Admin ↔ API communication (required for browser fetch)
PUBLIC_API_URL=http://localhost:${config.ports.api}
CORS_ORIGINS=http://localhost:${config.ports.admin},http://127.0.0.1:${config.ports.admin}

# JWT
JWT_SECRET=change-me

# Active theme
ACTIVE_THEME=default
`;

  await writeFile(join(root, '.env.example'), envExample, 'utf-8');

  // Escreve .env imediatamente (se ainda não existir) para o projeto já subir configurado.
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    await writeFile(envPath, envExample, 'utf-8');
  }

  const compose = `services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: \${DB_NAME:-okcms}
      POSTGRES_USER: \${DB_USER:-postgres}
      POSTGRES_PASSWORD: \${DB_PASSWORD:-postgres}
    ports:
      - "\${DB_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER:-postgres}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "\${REDIS_PORT:-6379}:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  redisdata:
`;

  await writeFile(join(root, 'docker-compose.yml'), compose, 'utf-8');

  // --- deploy Docker (blue/green) ------------------------------------------
  // Escrito no init, não no primeiro deploy: o projeto nasce com a estrutura
  // completa (imagem única, infra, lanes, template do nginx) e o operador vê
  // tudo no git desde o primeiro commit. `writeDeployAssets` não sobrescreve
  // nada — um re-init de projeto já configurado é no-op aqui.
  const deployCreated = writeDeployAssets(root, 'blue', {
    PORT: String(config.ports.api),
    WEB_PORT: String(config.ports.web),
    ADMIN_PORT: String(config.ports.admin),
  });

  await mergeGitignore(root, ['.env', 'node_modules/', 'dist/', ...DEPLOY_GITIGNORE]);

  // Documentação do projeto — só escreve se não existir (não sobrescreve
  // README editado pelo usuário em re-init). A língua (en/pt) vem do `--lang`
  // ou do menu do init; o nome do arquivo é sempre o mesmo.
  let docsWritten = 0;
  for (const [filename, content] of [
    ['README.md', projectReadme(name, lang)],
    ['PLUGIN.md', pluginDoc(lang)],
    ['THEME.md', themeDoc(lang)],
  ] as const) {
    const docPath = join(root, filename);
    if (!existsSync(docPath)) {
      await writeFile(docPath, content, 'utf-8');
      docsWritten += 1;
    }
  }
  const relTarget = targetDir === '.' ? null : targetDir;
  const cfgName = DEFAULT_CONFIG_FILENAME;

  // What was created, before the (possibly slow) dependency install: the user
  // sees concrete progress while the loader is still spinning below.
  console.log('');
  console.log(`  ${style.green(symbol.ok)} Project "${name}" created at ${root}`);
  if (deployCreated.length > 0) {
    console.log(
      `  ${style.green(symbol.ok)} Docker deploy files ready (${deployCreated.length})`
    );
  }
  if (docsWritten > 0) {
    console.log(`  ${style.green(symbol.ok)} Docs written (${docsLangLabel(lang)})`);
  }

  // Dependency install comes before the summary: printing "Next steps" and
  // then blocking for a minute on `bun install` makes the user type into a
  // shell that is not ready yet.
  if (beforeSummary) await beforeSummary();

  // --- Next steps -----------------------------------------------------------
  // Compact and single-column on purpose: two numbered steps to get moving
  // (cd + README), then the day-to-day commands grouped as DEV and PROD. Every
  // command sits on a fixed column so it never wraps on an 80-col terminal,
  // and the hints carry the alternatives (bun run *, scripts).
  const INDENT = '         '; // aligns with "  DEV    " / "  PROD   "
  const command = (label: string, hint: string): string =>
    `${INDENT}${label.padEnd(26)}${style.dim(hint)}`;

  console.log('');
  console.log(`  ${style.bold('Next steps')}`);
  let step = 1;
  if (relTarget !== null) {
    console.log(`    ${step++}. cd ${relTarget}`);
  }
  console.log(`    ${step++}. Read README.md to get started`);

  console.log('');
  console.log(`  ${style.bold('DEV')}    ${'edit .env'.padEnd(26)}${style.dim('(DB_PASSWORD · JWT_SECRET)')}`);
  console.log(command('docker compose up -d', '(Postgres + Redis)'));
  console.log(command('npx okcms db:migrate', '(or: bun run migrate)'));
  console.log(command('npx okcms start', '(api · admin · web · worker)'));

  console.log('');
  console.log(`  ${style.bold('PROD')}   ${'npx okcms deploy'.padEnd(26)}${style.dim('(docker · blue/green, simple or pm2)')}`);

  console.log('');
  console.log(`  ${style.bold('config')}  ${cfgName}`);
  console.log(`  ${style.bold('docs')}    README.md · PLUGIN.md · THEME.md`);
  console.log(`  ${style.bold('help')}    npx okcms --help`);
  return root;
}
