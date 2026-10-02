// @oktis-works/cms - Project Scaffolding

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultProjectConfig, DEFAULT_CONFIG_FILENAME } from './project-config.js';

export async function scaffoldProject(targetDir: string, name: string): Promise<void> {
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

  const envExample = `# OkCMS
DB_HOST=${config.database.host}
DB_PORT=${config.database.port}
DB_NAME=${config.database.name}
DB_USER=${config.database.user}
DB_PASSWORD=

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
  console.log(`  ${step++}. okcms start`);
  console.log('');
  console.log(`Config do projeto: ${cfgName} | para ajuda: okcms --help`);
}
