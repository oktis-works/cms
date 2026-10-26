// @oktis-works/cms - Project Scaffolding

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defaultProjectConfig, DEFAULT_CONFIG_FILENAME } from './project-config.js';
import { DEPLOY_GITIGNORE } from './assets.js';
import { DEFAULT_THEME_FILES, DEFAULT_THEME_BINARY_FILES } from './theme-assets.js';
import { writeDeployAssets } from './bluegreen.js';
import { DEFAULT_DOCS_LANG, docsLangLabel, pluginDoc, projectReadme, providerMatrixDoc, themeDoc } from './scaffold-docs.js';
import type { DocsLang } from './scaffold-docs.js';
import { getLatestVersion } from './npm-registry.js';
import { APP_VERSIONS } from './generated/app-versions.js';
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
 * Range que o projeto usa para cada pacote do OkCMS (apps + core +
 * plugin-runtime + a própria CLI), ancorado na versão REAL publicada do
 * pacote — npm primeiro; fallback = `APP_VERSIONS`, capturado dos manifests
 * no build.
 *
 * Por que a âncora NÃO é a versão da CLI (bug histórico do ETARGET): os
 * pacotes são versionados de forma independente (plugin-runtime parado em
 * 0.7.0 enquanto a CLI andou para 0.11.x) e a janela derivada da CLI não
 * encontrava nada — ETARGET em todo `okcms init`.
 *
 * A janela cobre o anchor e um minor abaixo em 0.x — então um map um minor
 * À FRENTE do registry (publish parcial) ainda resolve. A partir de 1.x
 * vira `>=MAJOR.0.0 <(MAJOR+1).0.0`.
 */
export function appRangeFor(version: string): string {
  const [rawMajor, rawMinor] = version.split('.');
  const major = Number(rawMajor);
  const minor = Number(rawMinor);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || major < 0 || minor < 0) {
    // versão ilegível → cai no comportamento histórico em vez de quebrar o init
    return `^${version}`;
  }
  if (major > 0) return `>=${major}.0.0 <${major + 1}.0.0`;
  const lower = minor > 0 ? minor - 1 : 0;
  return `>=0.${lower}.0 <0.${minor + 1}.0`;
}

/** Packages written into the scaffolded project's package.json. */
export const APP_PACKAGES = [
  '@oktis-works/api',
  '@oktis-works/admin',
  '@oktis-works/web',
  '@oktis-works/worker',
  '@oktis-works/core',
  '@oktis-works/plugin-runtime',
] as const;

/** devDependency: the CLI itself, pinned to a compatible local binary. */
const CLI_PACKAGE = '@oktis-works/cms';

/**
 * Resolves the install range for every scaffolded package INDEPENDENTLY:
 * anchored on the version actually published on npm (`getLatestVersion`),
 * falling back to the build-time `APP_VERSIONS` map when the registry is
 * unreachable. The window (anchor + one minor back in 0.x) tolerates the map
 * running one minor AHEAD of the registry (partial publish) — never the
 * opposite, which is what made the CLI-anchored window ETARGET.
 */
export async function resolveAppRanges(
  resolveLatest: (name: string) => Promise<string | null> = getLatestVersion
): Promise<Record<string, string>> {
  const names = [...APP_PACKAGES, CLI_PACKAGE];
  const entries = await Promise.all(
    names.map(async (name) => {
      const latest = await resolveLatest(name);
      const anchor = latest ?? APP_VERSIONS[name];
      return { name, range: anchor ? appRangeFor(anchor) : '*', fromRegistry: latest !== null };
    })
  );

  const misses = entries.filter((entry) => !entry.fromRegistry).length;
  if (misses > 0) {
    console.log(
      `[scaffold] npm lookup missed ${misses}/${names.length} package(s) — using bundled versions`
    );
  }

  return Object.fromEntries(entries.map(({ name, range }) => [name, range]));
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
  beforeSummary?: () => Promise<void>,
  options: { provider?: 'postgres' | 'mysql' | 'mariadb' } = {}
): Promise<string> {
  const root = resolve(process.cwd(), targetDir);
  const provider = options.provider ?? (process.env['DB_ENGINE'] as 'postgres' | 'mysql' | 'mariadb' | undefined) ?? 'postgres';
  const dbPort = provider === 'postgres' ? '5432' : '3306';
  const dbUser = provider === 'postgres' ? 'postgres' : 'okcms';

  console.log(`${style.cyan('◈')} ${style.bold('OKCMS')} ${style.dim('· project setup')}`);
  console.log(style.dim(`  Creating ${name} at ${root}`));

  await mkdir(join(root, 'themes'), { recursive: true });
  await mkdir(join(root, 'plugins'), { recursive: true });
  await mkdir(join(root, 'migrations'), { recursive: true });

  // Tema default pronto: o projeto novo já renderiza de cara (templates .astro
  // na raiz + dist/theme.css servido direto). Nunca sobrescreve em re-init —
  // o operador pode ter editado o tema.
  for (const [relative, content] of Object.entries(DEFAULT_THEME_FILES)) {
    const target = join(root, 'themes', 'default', relative);
    if (existsSync(target)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf-8');
  }

  // Binários (screenshot.png): writeFile de string corromperia o PNG —
  // decodifica do base64 e grava Buffer. Mesma regra de re-init.
  for (const [relative, base64] of Object.entries(DEFAULT_THEME_BINARY_FILES)) {
    const target = join(root, 'themes', 'default', relative);
    if (existsSync(target)) continue;
    await mkdir(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(base64, 'base64'));
  }

  const config = defaultProjectConfig(name);
  await writeFile(
    join(root, DEFAULT_CONFIG_FILENAME),
    JSON.stringify(config, null, 2),
    'utf-8'
  );

  // package.json do projeto — apps do OkCMS como dependências. Cada range é
  // resolvido INDEPENDENTEMENTE pela versão real publicada do pacote (npm →
  // fallback `APP_VERSIONS` do build) e passado pela janela de dois minors de
  // `appRangeFor`. Ancorar na versão da CLI era o bug de ETARGET: os pacotes
  // são versionados de forma independente e a janela da CLI não encontrava
  // nada. Não sobrescreve manifest existente.
  const appRanges = await resolveAppRanges();
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
        menu: 'okcms menu',
        dev: 'okcms dev',
        start: 'okcms start',
        stop: 'okcms stop',
        status: 'okcms status',
        doctor: 'okcms doctor',
        migrate: 'okcms db:migrate',
        'db-status': 'okcms db:status',
        'db-inventory': 'okcms db:inventory --json',
        'db-rollback': 'okcms db:rollback',
        backup: 'okcms db:backup',
        restore: 'okcms db:restore',
        seed: 'okcms seed',
        update: 'okcms update',
        'update-plan': 'okcms update --dry-run',
        deploy: 'okcms deploy',
      },
      // Atalhos executáveis via bun run / npm run: node_modules/.bin injeta
      // o okcms local no PATH dos scripts, então `bun run start` e
      // `bun run dev` funcionam sem instalação global e sem bunx.
      dependencies: {
        '@oktis-works/api': appRanges['@oktis-works/api'],
        '@oktis-works/admin': appRanges['@oktis-works/admin'],
        '@oktis-works/web': appRanges['@oktis-works/web'],
        '@oktis-works/worker': appRanges['@oktis-works/worker'],
        '@oktis-works/core': appRanges['@oktis-works/core'],
        '@oktis-works/plugin-runtime': appRanges['@oktis-works/plugin-runtime'],
      },
      devDependencies: {
        // CLI disponível como binário local: `okcms ...` usa a versão local compatível
        // com os apps instalados (sem buscar outra no registry).
        '@oktis-works/cms': appRanges['@oktis-works/cms'],
      },
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  }

  const envExample = `# OkCMS
# Database connection — pick ONE format:
# (a) separate variables (default, used below):
DB_ENGINE=${provider}
DB_HOST=${process.env['DB_HOST'] ?? 'localhost'}
DB_PORT=${process.env['DB_PORT'] ?? dbPort}
DB_NAME=${process.env['DB_NAME'] ?? 'okcms'}
DB_USER=${process.env['DB_USER'] ?? dbUser}
DB_PASSWORD=
# (b) single URL — takes precedence over the DB_* above:
# DATABASE_URL=${provider === 'postgres' ? 'postgresql://postgres:password@localhost:5432/okcms' : `${provider}://okcms:password@localhost:3306/okcms`}

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
# DEV: use lvh.me (resolves to 127.0.0.1) for cross-port cookie sharing.
# Add to /etc/hosts: 127.0.0.1 api.lvh.me admin.lvh.me web.lvh.me
# Then use: PUBLIC_API_URL=http://api.lvh.me:${config.ports.api}
#          CORS_ORIGINS=http://admin.lvh.me:${config.ports.admin},http://web.lvh.me:${config.ports.web}
# PROD: use your real domain
#
# DEV with Vite proxy (simpler, no /etc/hosts needed):
#   Uncomment the two lines below and comment out the three lines above.
#   The admin will proxy /api requests to the API, making cookies work cross-port.
PUBLIC_API_URL=/api
CORS_ORIGINS=http://localhost:${config.ports.admin},http://127.0.0.1:${config.ports.admin}
TRUSTED_ORIGINS=http://localhost:${config.ports.admin},http://127.0.0.1:${config.ports.admin}
# PUBLIC_API_URL=http://localhost:${config.ports.api}
# CORS_ORIGINS=http://localhost:${config.ports.admin},http://127.0.0.1:${config.ports.admin}
# TRUSTED_ORIGINS=http://localhost:${config.ports.admin},http://127.0.0.1:${config.ports.admin}

# Admin API proxy (DEV only) — forwards /api requests from admin (port ${config.ports.admin}) to API (port ${config.ports.api})
# This avoids cross-port cookie issues with SameSite=lax on fetch requests.
ADMIN_API_PROXY_TARGET=http://localhost:${config.ports.api}

# Auth cookies
# DEV with lvh.me: AUTH_COOKIE_DOMAIN=.lvh.me  AUTH_COOKIE_SAMESITE=lax  AUTH_COOKIE_SECURE=false
# DEV without lvh.me (cross-port): cookies blocked by SameSite=lax on fetch — use a proxy or lvh.me
# PROD: AUTH_COOKIE_DOMAIN=.yourdomain.com  AUTH_COOKIE_SAMESITE=none  AUTH_COOKIE_SECURE=true
AUTH_COOKIE_DOMAIN=
AUTH_COOKIE_SAMESITE=lax
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_ACCESS_MAXAGE=900
AUTH_COOKIE_REFRESH_MAXAGE=2592000

# JWT (access token) — short lived (15m default)
JWT_EXPIRES_IN=15m
# Refresh token — long lived (7d default)
REFRESH_TOKEN_EXPIRES_IN=7d
JWT_SECRET=change-me-in-production
BCRYPT_ROUNDS=12

# CSRF (double-submit cookie)
AUTH_CSRF_ENABLED=true
AUTH_CSRF_HEADER=x-csrf-token
AUTH_CSRF_COOKIE=csrf_token

# Active theme
ACTIVE_THEME=default
`;

  await writeFile(join(root, '.env.example'), envExample, 'utf-8');

  // Escreve .env imediatamente (se ainda não existir) para o projeto já subir configurado.
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    await writeFile(envPath, envExample, 'utf-8');
  }

  const compose = provider === 'postgres' ? `services:
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
` : `services:
  db:
    image: ${provider === 'mysql' ? 'mysql:8.0.36' : 'mariadb:11.4'}
    environment:
      ${provider === 'mysql' ? 'MYSQL' : 'MARIADB'}_DATABASE: \${DB_NAME:-okcms}
      ${provider === 'mysql' ? 'MYSQL' : 'MARIADB'}_USER: \${DB_USER:-okcms}
      ${provider === 'mysql' ? 'MYSQL' : 'MARIADB'}_PASSWORD: \${DB_PASSWORD:-okcms}
      ${provider === 'mysql' ? 'MYSQL_ROOT_PASSWORD' : 'MARIADB_ROOT_PASSWORD'}: \${DB_ROOT_PASSWORD:-root}
    ports:
      "\${DB_PORT:-3306}:3306"
    volumes:
      - ${provider}-data:/var/lib/${provider === 'mysql' ? 'mysql' : 'mysql'}
    healthcheck:
      test: ["CMD", "${provider === 'mysql' ? 'mysqladmin' : 'healthcheck.sh'}", "ping", "-h", "localhost"]
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
  ${provider}-data:
  redisdata:
`;

  await writeFile(join(root, 'docker-compose.yml'), compose, 'utf-8');

  // --- deploy Docker (blue/green) ------------------------------------------
  // Escrito no init, não no primeiro deploy: o projeto nasce com a estrutura
  // completa (imagem única, infra, lanes, template do nginx) e o operador vê
  // tudo no git desde o primeiro commit. `writeDeployAssets` não sobrescreve
  // nada — um re-init de projeto já configurado é no-op aqui.
  const deployCreated = writeDeployAssets(root, 'blue', {
    DB_ENGINE: provider,
    PORT: String(config.ports.api),
    WEB_PORT: String(config.ports.web),
    ADMIN_PORT: String(config.ports.admin),
  }, provider);

  await mergeGitignore(root, ['.env', 'node_modules/', 'dist/', ...DEPLOY_GITIGNORE]);

  // Documentação do projeto — só escreve se não existir (não sobrescreve
  // README editado pelo usuário em re-init). A língua (en/pt) vem do `--lang`
  // ou do menu do init; o nome do arquivo é sempre o mesmo.
  let docsWritten = 0;
  for (const [filename, content] of [
    ['README.md', projectReadme(name, lang)],
    ['PLUGIN.md', pluginDoc(lang)],
    ['THEME.md', themeDoc(lang)],
    ['docs/provider-matrix.md', providerMatrixDoc(lang)],
  ] as const) {
    const docPath = join(root, filename);
    if (!existsSync(docPath)) {
      await mkdir(dirname(docPath), { recursive: true });
      await writeFile(docPath, content, 'utf-8');
      docsWritten += 1;
    }
  }
  const scaffoldValidation = validateScaffold(root, { allowExistingPackage: true, provider });
  if (!scaffoldValidation.ok) {
    throw new Error(`Generated project validation failed: ${scaffoldValidation.errors.join('; ')}`);
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
  console.log(command('bun run dev', `(env · ${provider} · Redis · migrations · apps)`));
  console.log(command('bun run migrate', '(or: okcms db:migrate; manual migration only)'));
  console.log(command('bun run start', '(apps only, after bun run dev --skip-start)'));
  console.log(command('okcms menu', '(interactive command center)'));

  console.log('');
  console.log(`  ${style.bold('PROD')}   ${'okcms deploy'.padEnd(26)}${style.dim('(docker · blue/green, simple or pm2)')}`);

  console.log('');
  console.log(`  ${style.bold('config')}  ${cfgName}`);
  console.log(`  ${style.bold('docs')}    README.md · PLUGIN.md · THEME.md`);
  console.log(`  ${style.bold('help')}    okcms --help`);
  return root;
}

export interface ScaffoldValidation {
  ok: boolean;
  errors: string[];
}

/** Validates the generated contract before dependency installation or handoff. */
export function validateScaffold(
  root: string,
  options: { allowExistingPackage?: boolean; provider?: 'postgres' | 'mysql' | 'mariadb' } = {}
): ScaffoldValidation {
  const required = [DEFAULT_CONFIG_FILENAME, '.env', '.env.example', 'package.json', 'migrations'];
  const errors = required.filter((entry) => !existsSync(join(root, entry))).map((entry) => `missing ${entry}`);
  try {
    const config = JSON.parse(readFileSync(join(root, DEFAULT_CONFIG_FILENAME), 'utf-8')) as { name?: unknown };
    if (typeof config.name !== 'string' || config.name.length === 0) errors.push('config.name is required');
  } catch {
    errors.push('okcms.config.json is not valid JSON');
  }
  try {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    if (options.allowExistingPackage !== true) {
      for (const script of ['menu', 'dev', 'migrate', 'doctor', 'deploy']) {
        if (typeof packageJson.scripts?.[script] !== 'string') errors.push(`missing package script ${script}`);
      }
      if (typeof packageJson.dependencies?.['@oktis-works/core'] !== 'string') errors.push('missing core dependency');
      if (typeof packageJson.devDependencies?.['@oktis-works/cms'] !== 'string') errors.push('missing CLI devDependency');
    }
  } catch {
    errors.push('package.json is not valid JSON');
  }
  if (existsSync(join(root, '.env'))) {
    const env = readFileSync(join(root, '.env'), 'utf-8');
    const provider = options.provider ?? env.match(/^DB_ENGINE=(postgres|mysql|mariadb)$/m)?.[1];
    if (!provider || !new RegExp(`^DB_ENGINE=${provider}$`, 'm').test(env)) errors.push('generated environment must select a supported database provider');
  }
  return { ok: errors.length === 0, errors };
}
