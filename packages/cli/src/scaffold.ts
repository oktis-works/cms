// @oktis-works/cms - Project Scaffolding

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultProjectConfig, DEFAULT_CONFIG_FILENAME } from './project-config.js';

/** Normaliza o nome do projeto para um npm name válido (slug). */
export function toPackageName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return slug.length > 0 ? slug : 'okcms-project';
}

export async function scaffoldProject(targetDir: string, name: string): Promise<string> {
  const root = resolve(process.cwd(), targetDir);

  console.log(`Criando projeto "${name}" em ${root}...`);

  await mkdir(join(root, 'themes'), { recursive: true });
  await mkdir(join(root, 'plugins'), { recursive: true });
  await mkdir(join(root, 'migrations'), { recursive: true });

  const config = defaultProjectConfig(name);
  await writeFile(
    join(root, DEFAULT_CONFIG_FILENAME),
    JSON.stringify(config, null, 2),
    'utf-8'
  );

  // package.json do projeto — apps do OkCMS como dependências, em range
  // ^MAIOR.MENOR.0 (e não ^versão-exata do CLI): os apps são independentes no
  // changesets e podem estar alguns patches atrás do CLI — range exata quebraria
  // o install (ETARGET) sempre que CLI e apps não forem publicados juntos.
  // Assim o `bunx` dos apps resolve local, `okcms update` enxerga
  // node_modules/@oktis-works/* e tudo funciona sem configuração manual.
  // Não sobrescreve manifest existente.
  const cliPkg = await import('../package.json', { with: { type: 'json' } });
  const cliVersion = cliPkg.default.version as string;
  const appRange = `^${cliVersion.split('.').slice(0, 2).join('.')}.0`;
  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) {
    const manifest = {
      name: toPackageName(name),
      version: '0.1.0',
      private: true,
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
# Conexão com o banco — escolha UM formato:
# (a) variáveis separadas (default, usadas abaixo):
DB_HOST=${process.env['DB_HOST'] ?? 'localhost'}
DB_PORT=${process.env['DB_PORT'] ?? '5432'}
DB_NAME=${process.env['DB_NAME'] ?? 'okcms'}
DB_USER=${process.env['DB_USER'] ?? 'postgres'}
DB_PASSWORD=
# (b) URL única — tem precedência sobre as DB_* acima:
# DATABASE_URL=postgresql://postgres:senha@localhost:5432/okcms

# Redis (cache + filas do worker)
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

# JWT
JWT_SECRET=change-me

# Active theme
ACTIVE_THEME=
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

  const relTarget = targetDir === '.' ? null : targetDir;
  const cfgName = DEFAULT_CONFIG_FILENAME;

  console.log(`Projeto "${name}" criado em ${root}`);
  console.log('Próximos passos:');
  let step = 1;
  if (relTarget !== null) {
    console.log(`  ${step++}. cd ${relTarget}`);
  }
  console.log(`  ${step++}. docker compose up -d`);
  console.log(`  ${step++}. edite o .env (criado já — ajuste DB_PASSWORD/JWT_SECRET)`);
  console.log(`  ${step++}. okcms db:migrate`);
  console.log(`  ${step++}. okcms start   (sobe api, admin, web e worker)`);
  console.log('');
  console.log(`Config do projeto: ${cfgName} | para ajuda: okcms --help`);
  return root;
}

export interface InstallResult {
  ok: boolean;
  tool: string;
  output: string;
}

/**
 * Instala as dependências do projeto scaffold (bun preferido, npm como
 * fallback quando o bun não está no PATH). Não derruba o init se falhar —
 * os arquivos do projeto já estão no lugar.
 */
export function installProjectDeps(
  root: string,
  options: { spawn?: typeof spawnSync } = {}
): InstallResult {
  const spawn = options.spawn ?? spawnSync;

  const bun = spawn('bun', ['install'], { cwd: root, encoding: 'utf-8' });
  if (!bun.error) {
    return {
      ok: bun.status === 0,
      tool: 'bun',
      output: `${bun.stdout ?? ''}${bun.stderr ?? ''}`.trim(),
    };
  }

  // bun ausente (ENOENT) → tenta npm
  const npm = spawn('npm', ['install'], { cwd: root, encoding: 'utf-8' });
  return {
    ok: npm.status === 0,
    tool: 'npm',
    output: `${npm.stdout ?? ''}${npm.stderr ?? ''}`.trim(),
  };
}
