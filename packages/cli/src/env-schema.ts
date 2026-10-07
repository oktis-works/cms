// @oktis-works/cms - Catálogo de variáveis de ambiente do projeto
//
// Fonte única de verdade para o wizard `okcms config`: quais chaves existem,
// em qual seção, o que significam, como validar e qual o default. Não é um
// "schema" da aplicação — é o contrato do `.env`, que é o que o operador
// realmente edita.
//
// Os defaults aqui batem com `@oktis-works/config loadConfig()` e com o
// `.env.example` gerado no `okcms init`. Se mudar um default no config, mude
// aqui também (o teste de catálogo cobre esse vínculo).

import { parseDatabaseUrl } from './doctor.js';

export type EnvType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'port'
  | 'duration'
  | 'url'
  | 'database-url'
  | 'path'
  | 'enum'
  | 'secret';

export interface EnvField {
  key: string;
  section: string;
  label: string;
  description: string;
  type: EnvType;
  default?: string;
  options?: string[];
  required?: boolean;
  /** Mostra o campo só quando a condição é verdadeira (dependências). */
  when?: (record: Record<string, string>) => boolean;
  /** Minibloco de exemplo exibido no prompt. */
  example?: string;
}

export interface EnvSection {
  id: string;
  title: string;
  hint: string;
}

export const ENV_SECTIONS: EnvSection[] = [
  { id: 'app', title: 'Application', hint: 'NODE_ENV, ports and rate limit' },
  { id: 'database', title: 'Database', hint: 'Postgres via DB_* or DATABASE_URL' },
  { id: 'redis', title: 'Redis', hint: 'cache and worker queues' },
  { id: 'auth', title: 'Authentication', hint: 'JWT, cookies and CSRF' },
  { id: 'storage', title: 'Storage', hint: 'local, s3, r2 or minio' },
  { id: 'worker', title: 'Worker', hint: 'queue concurrency and retries' },
  { id: 'cache', title: 'Cache', hint: 'TTL and key prefix' },
  { id: 'ports', title: 'App ports', hint: 'admin and web' },
  { id: 'theme', title: 'Theme', hint: 'active site theme' },
  { id: 'deploy', title: 'Deploy (Docker)', hint: 'blue/green image and proxy host' },
];

export const ENV_FIELDS: EnvField[] = [
  // -- Aplicação ------------------------------------------------------------
  {
    key: 'NODE_ENV',
    section: 'app',
    label: 'NODE_ENV',
    description: 'development | production | test',
    type: 'enum',
    options: ['development', 'production', 'test'],
    default: 'development',
  },
  {
    key: 'HOST',
    section: 'app',
    label: 'HOST',
    description: 'API bind interface',
    type: 'string',
    default: '0.0.0.0',
    example: '0.0.0.0',
  },
  {
    key: 'PORT',
    section: 'app',
    label: 'PORT',
    description: 'API port',
    type: 'port',
    default: '3000',
  },
  {
    key: 'CORS_ORIGINS',
    section: 'app',
    label: 'CORS_ORIGINS',
    description: 'Allowed origins (comma-separated)',
    type: 'string',
    default: 'http://localhost:3011',
    example: 'https://meusite.com,https://admin.meusite.com',
  },
  {
    key: 'TRUSTED_ORIGINS',
    section: 'app',
    label: 'TRUSTED_ORIGINS',
    description: 'Origins allowed by CSRF protection (comma-separated)',
    type: 'string',
    default: 'http://localhost:3011,http://127.0.0.1:3011',
    example: 'https://admin.meusite.com',
  },
  {
    key: 'PUBLIC_API_URL',
    section: 'app',
    label: 'PUBLIC_API_URL',
    description: 'Public API URL for admin (browser) — e.g., https://api.meusite.com',
    type: 'url',
    example: 'https://api.meusite.com',
  },
  {
    key: 'RATE_LIMIT_WINDOW_MS',
    section: 'app',
    label: 'RATE_LIMIT_WINDOW_MS',
    description: 'Rate limit window in milliseconds',
    type: 'number',
    default: '60000',
  },
  {
    key: 'RATE_LIMIT_MAX',
    section: 'app',
    label: 'RATE_LIMIT_MAX',
    description: 'Max requests per window',
    type: 'number',
    default: '100',
  },

  // -- Banco de dados -------------------------------------------------------
  {
    key: 'DB_HOST',
    section: 'database',
    label: 'DB_HOST',
    description: 'Ignored when DATABASE_URL is set',
    type: 'string',
    default: 'localhost',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_PORT',
    section: 'database',
    label: 'DB_PORT',
    description: 'Postgres port',
    type: 'port',
    default: '5432',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_NAME',
    section: 'database',
    label: 'DB_NAME',
    description: 'Database name',
    type: 'string',
    default: 'okcms',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_USER',
    section: 'database',
    label: 'DB_USER',
    description: 'Database user',
    type: 'string',
    default: 'postgres',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_PASSWORD',
    section: 'database',
    label: 'DB_PASSWORD',
    description: 'Database password',
    type: 'secret',
    required: true,
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_SSL',
    section: 'database',
    label: 'DB_SSL',
    description: 'TLS for Postgres (true on managed providers)',
    type: 'boolean',
    default: 'false',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_MAX_CONNECTIONS',
    section: 'database',
    label: 'DB_MAX_CONNECTIONS',
    description: 'Max connection pool size',
    type: 'number',
    default: '20',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DATABASE_URL',
    section: 'database',
    label: 'DATABASE_URL',
    description: 'Single URL — overrides DB_* (postgres://user:pass@host:5432/db)',
    type: 'database-url',
    example: 'postgresql://postgres:pass@localhost:5432/okcms',
  },

  // -- Redis ----------------------------------------------------------------
  {
    key: 'REDIS_HOST',
    section: 'redis',
    label: 'REDIS_HOST',
    description: 'use "disabled" to run without Redis (in-memory)',
    type: 'string',
    default: 'localhost',
  },
  {
    key: 'REDIS_PORT',
    section: 'redis',
    label: 'REDIS_PORT',
    description: 'Redis port',
    type: 'port',
    default: '6379',
  },
  {
    key: 'REDIS_PASSWORD',
    section: 'redis',
    label: 'REDIS_PASSWORD',
    description: 'Redis password (empty if none)',
    type: 'secret',
  },
  {
    key: 'REDIS_DB',
    section: 'redis',
    label: 'REDIS_DB',
    description: 'Redis database index',
    type: 'number',
    default: '0',
  },

  // -- Autenticação ---------------------------------------------------------
  {
    key: 'JWT_SECRET',
    section: 'auth',
    label: 'JWT_SECRET',
    description: 'Token signing secret — min 16 characters',
    type: 'secret',
    required: true,
  },
  {
    key: 'JWT_EXPIRES_IN',
    section: 'auth',
    label: 'JWT_EXPIRES_IN',
    description: 'Access token lifetime',
    type: 'duration',
    default: '15m',
    example: '15m, 2h, 7d',
  },
  {
    key: 'REFRESH_TOKEN_EXPIRES_IN',
    section: 'auth',
    label: 'REFRESH_TOKEN_EXPIRES_IN',
    description: 'Refresh token lifetime',
    type: 'duration',
    default: '7d',
    example: '1d, 30d',
  },
  {
    key: 'BCRYPT_ROUNDS',
    section: 'auth',
    label: 'BCRYPT_ROUNDS',
    description: 'Password hash cost (10..15)',
    type: 'number',
    default: '12',
  },
  {
    key: 'AUTH_COOKIE_SAMESITE',
    section: 'auth',
    label: 'AUTH_COOKIE_SAMESITE',
    description: 'strict | lax | none (none requires secure=true)',
    type: 'enum',
    options: ['strict', 'lax', 'none'],
    default: 'lax',
  },
  {
    key: 'AUTH_COOKIE_SECURE',
    section: 'auth',
    label: 'AUTH_COOKIE_SECURE',
    description: 'true behind TLS',
    type: 'boolean',
    default: 'false',
  },
  {
    key: 'AUTH_CSRF_ENABLED',
    section: 'auth',
    label: 'AUTH_CSRF_ENABLED',
    description: 'CSRF double-submit protection',
    type: 'boolean',
    default: 'true',
  },

  // -- Storage --------------------------------------------------------------
  {
    key: 'STORAGE_DRIVER',
    section: 'storage',
    label: 'STORAGE_DRIVER',
    description: 'Where media is stored',
    type: 'enum',
    options: ['local', 's3', 'r2', 'minio'],
    default: 'local',
  },
  {
    key: 'STORAGE_LOCAL_PATH',
    section: 'storage',
    label: 'STORAGE_LOCAL_PATH',
    description: 'Local media folder (driver=local) — mount as a Docker volume',
    type: 'path',
    default: '.data/storage',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') === 'local',
  },
  {
    key: 'STORAGE_PUBLIC_BASE',
    section: 'storage',
    label: 'STORAGE_PUBLIC_BASE',
    description: 'Public prefix for media URLs',
    type: 'path',
    default: '/storage',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') === 'local',
  },
  {
    key: 'STORAGE_BUCKET',
    section: 'storage',
    label: 'STORAGE_BUCKET',
    description: 'Bucket (s3/r2/minio)',
    type: 'string',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') !== 'local',
  },
  {
    key: 'STORAGE_ENDPOINT',
    section: 'storage',
    label: 'STORAGE_ENDPOINT',
    description: 'S3-compatible endpoint',
    type: 'url',
    example: 'http://localhost:9000',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') !== 'local',
  },
  {
    key: 'STORAGE_ACCESS_KEY',
    section: 'storage',
    label: 'STORAGE_ACCESS_KEY',
    description: 'Object access key',
    type: 'secret',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') !== 'local',
  },
  {
    key: 'STORAGE_SECRET_KEY',
    section: 'storage',
    label: 'STORAGE_SECRET_KEY',
    description: 'Object secret key',
    type: 'secret',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') !== 'local',
  },

  // -- Worker ---------------------------------------------------------------
  {
    key: 'WORKER_MODE',
    section: 'worker',
    label: 'WORKER_MODE',
    description: 'docker | pm2 | k8s',
    type: 'enum',
    options: ['docker', 'pm2', 'k8s'],
    default: 'docker',
  },
  {
    key: 'WORKER_COUNT',
    section: 'worker',
    label: 'WORKER_COUNT',
    description: 'Number of worker processes',
    type: 'number',
    default: '1',
  },
  {
    key: 'WORKER_CONCURRENCY',
    section: 'worker',
    label: 'WORKER_CONCURRENCY',
    description: 'Concurrent jobs per process',
    type: 'number',
    default: '5',
  },
  {
    key: 'WORKER_RETRY_ATTEMPTS',
    section: 'worker',
    label: 'WORKER_RETRY_ATTEMPTS',
    description: 'Retry attempts per job',
    type: 'number',
    default: '3',
  },
  {
    key: 'WORKER_RETRY_DELAY',
    section: 'worker',
    label: 'WORKER_RETRY_DELAY',
    description: 'Delay between attempts (ms)',
    type: 'number',
    default: '1000',
  },

  // -- Cache ----------------------------------------------------------------
  {
    key: 'CACHE_TTL',
    section: 'cache',
    label: 'CACHE_TTL',
    description: 'Default cache TTL (s)',
    type: 'number',
    default: '3600',
  },
  {
    key: 'CACHE_PREFIX',
    section: 'cache',
    label: 'CACHE_PREFIX',
    description: 'Key prefix in Redis',
    type: 'string',
    default: 'bl:',
  },

  // -- Ports ----------------------------------------------------------------
  // Os três defaults são os que os apps leem de verdade (api PORT=3000,
  // web WEB_PORT=3001, admin PORT/3011). Divergir daqui faz o wizard gravar
  // uma porta que ninguém escuta e o upstream do nginx apontar pro vazio.
  {
    key: 'ADMIN_PORT',
    section: 'ports',
    label: 'ADMIN_PORT',
    description: 'Admin port',
    type: 'port',
    default: '3011',
  },
  {
    key: 'WEB_PORT',
    section: 'ports',
    label: 'WEB_PORT',
    description: 'Public site port',
    type: 'port',
    default: '3001',
  },

  // -- Tema -----------------------------------------------------------------
  {
    key: 'ACTIVE_THEME',
    section: 'theme',
    label: 'ACTIVE_THEME',
    description: 'Folder name in themes/ (empty = default theme)',
    type: 'string',
    example: 'default',
  },

  // -- Deploy ---------------------------------------------------------------
  {
    key: 'OKCMS_VERSION',
    section: 'deploy',
    label: 'OKCMS_VERSION',
    description: 'okcms/app image tag used by the blue/green deploy compose',
    type: 'string',
    default: 'latest',
    example: '0.2.0',
  },
  {
    key: 'SERVER_NAME',
    section: 'deploy',
    label: 'SERVER_NAME',
    description: 'nginx server_name (public site)',
    type: 'string',
    default: '_',
    example: 'meusite.com',
  },
  {
    key: 'ADMIN_SERVER_NAME',
    section: 'deploy',
    label: 'ADMIN_SERVER_NAME',
    description: 'admin server_name on the proxy (must be a separate host)',
    type: 'string',
    default: 'admin.localhost',
    example: 'admin.meusite.com',
  },
];

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

const DURATION_RE = /^\d+(ms|s|m|h|d)$/;
const PORT_RE = /^\d+$/;

/** Mensagem de erro para o prompt, ou null quando o valor é válido. */
export function validateField(field: EnvField, value: string): string | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    if (field.required) return `${field.key} is required`;
    return null;
  }

  switch (field.type) {
    case 'port': {
      if (!PORT_RE.test(trimmed)) return 'must be a port number';
      const port = Number(trimmed);
      if (port < 1 || port > 65535) return 'out of range 1..65535';
      return null;
    }
    case 'number': {
      if (!/^-?\d+$/.test(trimmed)) return 'must be an integer';
      return null;
    }
    case 'boolean': {
      if (!['true', 'false', '1', '0'].includes(trimmed.toLowerCase())) {
        return 'use true or false';
      }
      return null;
    }
    case 'enum': {
      const options = field.options ?? [];
      if (!options.includes(trimmed)) return `use one of: ${options.join(' | ')}`;
      return null;
    }
    case 'duration': {
      if (!DURATION_RE.test(trimmed)) return 'use a format like 15m, 2h or 7d';
      return null;
    }
    case 'url': {
      try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) return 'use http:// or https://';
        return null;
      } catch {
        return 'invalid URL';
      }
    }
    case 'database-url': {
      if (!parseDatabaseUrl(trimmed)) {
        return 'use postgres:// or mysql:// with host and database (e.g. postgres://user:pass@host:5432/okcms)';
      }
      return null;
    }
    case 'secret': {
      if (field.key === 'JWT_SECRET' && trimmed.length < 16) {
        return 'JWT_SECRET must be at least 16 characters';
      }
      return null;
    }
    default:
      return null;
  }
}

/** Campos de uma seção, já filtrados por dependência (`when`). */
export function fieldsForSection(sectionId: string, record: Record<string, string>): EnvField[] {
  return ENV_FIELDS.filter(
    (field) => field.section === sectionId && (!field.when || field.when(record))
  );
}

export function sectionById(sectionId: string): EnvSection | undefined {
  return ENV_SECTIONS.find((section) => section.id === sectionId);
}
