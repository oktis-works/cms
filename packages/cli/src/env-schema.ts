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
  { id: 'app', title: 'Aplicação', hint: 'NODE_ENV, portas e rate limit' },
  { id: 'database', title: 'Banco de dados', hint: 'Postgres via DB_* ou DATABASE_URL' },
  { id: 'redis', title: 'Redis', hint: 'cache e filas do worker' },
  { id: 'auth', title: 'Autenticação', hint: 'JWT, cookies e CSRF' },
  { id: 'storage', title: 'Storage', hint: 'local, s3, r2 ou minio' },
  { id: 'worker', title: 'Worker', hint: 'concorrência e retries das filas' },
  { id: 'cache', title: 'Cache', hint: 'TTL e prefixo das chaves' },
  { id: 'ports', title: 'Ports dos apps', hint: 'admin e web' },
  { id: 'theme', title: 'Tema', hint: 'tema ativo do site' },
  { id: 'deploy', title: 'Deploy (Docker)', hint: 'imagem blue/green e host do proxy' },
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
    description: 'Interface de bind da API',
    type: 'string',
    default: '0.0.0.0',
    example: '0.0.0.0',
  },
  {
    key: 'PORT',
    section: 'app',
    label: 'PORT',
    description: 'Porta da API',
    type: 'port',
    default: '3000',
  },
  {
    key: 'CORS_ORIGINS',
    section: 'app',
    label: 'CORS_ORIGINS',
    description: 'Origens liberadas (separadas por vírgula)',
    type: 'string',
    default: 'http://localhost:4321',
    example: 'https://meusite.com,https://admin.meusite.com',
  },
  {
    key: 'RATE_LIMIT_WINDOW_MS',
    section: 'app',
    label: 'RATE_LIMIT_WINDOW_MS',
    description: 'Janela do rate limit em milissegundos',
    type: 'number',
    default: '60000',
  },
  {
    key: 'RATE_LIMIT_MAX',
    section: 'app',
    label: 'RATE_LIMIT_MAX',
    description: 'Requisições máximas por janela',
    type: 'number',
    default: '100',
  },

  // -- Banco de dados -------------------------------------------------------
  {
    key: 'DB_HOST',
    section: 'database',
    label: 'DB_HOST',
    description: 'Ignorado quando DATABASE_URL estiver definida',
    type: 'string',
    default: 'localhost',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_PORT',
    section: 'database',
    label: 'DB_PORT',
    description: 'Porta do Postgres',
    type: 'port',
    default: '5432',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_NAME',
    section: 'database',
    label: 'DB_NAME',
    description: 'Nome do banco',
    type: 'string',
    default: 'okcms',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_USER',
    section: 'database',
    label: 'DB_USER',
    description: 'Usuário do banco',
    type: 'string',
    default: 'postgres',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_PASSWORD',
    section: 'database',
    label: 'DB_PASSWORD',
    description: 'Senha do banco',
    type: 'secret',
    required: true,
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_SSL',
    section: 'database',
    label: 'DB_SSL',
    description: 'TLS no Postgres (true em provedor gerenciado)',
    type: 'boolean',
    default: 'false',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DB_MAX_CONNECTIONS',
    section: 'database',
    label: 'DB_MAX_CONNECTIONS',
    description: 'Pool máximo de conexões',
    type: 'number',
    default: '20',
    when: (r) => !r['DATABASE_URL'],
  },
  {
    key: 'DATABASE_URL',
    section: 'database',
    label: 'DATABASE_URL',
    description:
      'Formato único — tem precedência sobre DB_* (postgres://user:senha@host:5432/banco)',
    type: 'database-url',
    example: 'postgresql://postgres:senha@localhost:5432/okcms',
  },

  // -- Redis ----------------------------------------------------------------
  {
    key: 'REDIS_HOST',
    section: 'redis',
    label: 'REDIS_HOST',
    description: 'use "disabled" para rodar sem Redis (memória)',
    type: 'string',
    default: 'localhost',
  },
  {
    key: 'REDIS_PORT',
    section: 'redis',
    label: 'REDIS_PORT',
    description: 'Porta do Redis',
    type: 'port',
    default: '6379',
  },
  {
    key: 'REDIS_PASSWORD',
    section: 'redis',
    label: 'REDIS_PASSWORD',
    description: 'Senha do Redis (vazio se não houver)',
    type: 'secret',
  },
  {
    key: 'REDIS_DB',
    section: 'redis',
    label: 'REDIS_DB',
    description: 'Índice da database do Redis',
    type: 'number',
    default: '0',
  },

  // -- Autenticação ---------------------------------------------------------
  {
    key: 'JWT_SECRET',
    section: 'auth',
    label: 'JWT_SECRET',
    description: 'Segredo de assinatura dos tokens — mínimo 16 caracteres',
    type: 'secret',
    required: true,
  },
  {
    key: 'JWT_EXPIRES_IN',
    section: 'auth',
    label: 'JWT_EXPIRES_IN',
    description: 'Validade do access token',
    type: 'duration',
    default: '15m',
    example: '15m, 2h, 7d',
  },
  {
    key: 'REFRESH_TOKEN_EXPIRES_IN',
    section: 'auth',
    label: 'REFRESH_TOKEN_EXPIRES_IN',
    description: 'Validade do refresh token',
    type: 'duration',
    default: '7d',
    example: '1d, 30d',
  },
  {
    key: 'BCRYPT_ROUNDS',
    section: 'auth',
    label: 'BCRYPT_ROUNDS',
    description: 'Custo do hash de senha (10..15)',
    type: 'number',
    default: '12',
  },
  {
    key: 'AUTH_COOKIE_SAMESITE',
    section: 'auth',
    label: 'AUTH_COOKIE_SAMESITE',
    description: 'strict | lax | none (none exige secure=true)',
    type: 'enum',
    options: ['strict', 'lax', 'none'],
    default: 'lax',
  },
  {
    key: 'AUTH_COOKIE_SECURE',
    section: 'auth',
    label: 'AUTH_COOKIE_SECURE',
    description: 'true atrás de TLS',
    type: 'boolean',
    default: 'false',
  },
  {
    key: 'AUTH_CSRF_ENABLED',
    section: 'auth',
    label: 'AUTH_CSRF_ENABLED',
    description: 'Proteção CSRF double-submit',
    type: 'boolean',
    default: 'true',
  },

  // -- Storage --------------------------------------------------------------
  {
    key: 'STORAGE_DRIVER',
    section: 'storage',
    label: 'STORAGE_DRIVER',
    description: 'Onde a mídia é gravada',
    type: 'enum',
    options: ['local', 's3', 'r2', 'minio'],
    default: 'local',
  },
  {
    key: 'STORAGE_LOCAL_PATH',
    section: 'storage',
    label: 'STORAGE_LOCAL_PATH',
    description: 'Pasta local da mídia (driver=local) — monte como volume no Docker',
    type: 'path',
    default: '.data/storage',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') === 'local',
  },
  {
    key: 'STORAGE_PUBLIC_BASE',
    section: 'storage',
    label: 'STORAGE_PUBLIC_BASE',
    description: 'Prefixo público das URLs de mídia',
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
    description: 'Endpoint S3-compatível',
    type: 'url',
    example: 'http://localhost:9000',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') !== 'local',
  },
  {
    key: 'STORAGE_ACCESS_KEY',
    section: 'storage',
    label: 'STORAGE_ACCESS_KEY',
    description: 'Chave de acesso do objeto',
    type: 'secret',
    when: (r) => (r['STORAGE_DRIVER'] ?? 'local') !== 'local',
  },
  {
    key: 'STORAGE_SECRET_KEY',
    section: 'storage',
    label: 'STORAGE_SECRET_KEY',
    description: 'Chave secreta do objeto',
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
    description: 'Quantos processos de worker',
    type: 'number',
    default: '1',
  },
  {
    key: 'WORKER_CONCURRENCY',
    section: 'worker',
    label: 'WORKER_CONCURRENCY',
    description: 'Jobs simultâneos por processo',
    type: 'number',
    default: '5',
  },
  {
    key: 'WORKER_RETRY_ATTEMPTS',
    section: 'worker',
    label: 'WORKER_RETRY_ATTEMPTS',
    description: 'Tentativas de retry por job',
    type: 'number',
    default: '3',
  },
  {
    key: 'WORKER_RETRY_DELAY',
    section: 'worker',
    label: 'WORKER_RETRY_DELAY',
    description: 'Delay entre tentativas (ms)',
    type: 'number',
    default: '1000',
  },

  // -- Cache ----------------------------------------------------------------
  {
    key: 'CACHE_TTL',
    section: 'cache',
    label: 'CACHE_TTL',
    description: 'Validade padrão do cache (s)',
    type: 'number',
    default: '3600',
  },
  {
    key: 'CACHE_PREFIX',
    section: 'cache',
    label: 'CACHE_PREFIX',
    description: 'Prefixo das chaves no Redis',
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
    description: 'Porta do admin',
    type: 'port',
    default: '3011',
  },
  {
    key: 'WEB_PORT',
    section: 'ports',
    label: 'WEB_PORT',
    description: 'Porta do site público',
    type: 'port',
    default: '3001',
  },

  // -- Tema -----------------------------------------------------------------
  {
    key: 'ACTIVE_THEME',
    section: 'theme',
    label: 'ACTIVE_THEME',
    description: 'Nome da pasta em themes/ (vazio = tema default)',
    type: 'string',
    example: 'default',
  },

  // -- Deploy ---------------------------------------------------------------
  {
    key: 'OKCMS_VERSION',
    section: 'deploy',
    label: 'OKCMS_VERSION',
    description: 'Tag da imagem okcms/app usada no compose de deploy blue/green',
    type: 'string',
    default: 'latest',
    example: '0.2.0',
  },
  {
    key: 'SERVER_NAME',
    section: 'deploy',
    label: 'SERVER_NAME',
    description: 'server_name do nginx (site público)',
    type: 'string',
    default: '_',
    example: 'meusite.com',
  },
  {
    key: 'ADMIN_SERVER_NAME',
    section: 'deploy',
    label: 'ADMIN_SERVER_NAME',
    description: 'server_name do admin no proxy (deve ser um host separado)',
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
    if (field.required) return `${field.key} é obrigatório`;
    return null;
  }

  switch (field.type) {
    case 'port': {
      if (!PORT_RE.test(trimmed)) return 'precisa ser um número de porta';
      const port = Number(trimmed);
      if (port < 1 || port > 65535) return 'fora da faixa 1..65535';
      return null;
    }
    case 'number': {
      if (!/^-?\d+$/.test(trimmed)) return 'precisa ser um inteiro';
      return null;
    }
    case 'boolean': {
      if (!['true', 'false', '1', '0'].includes(trimmed.toLowerCase())) {
        return 'use true ou false';
      }
      return null;
    }
    case 'enum': {
      const options = field.options ?? [];
      if (!options.includes(trimmed)) return `use uma de: ${options.join(' | ')}`;
      return null;
    }
    case 'duration': {
      if (!DURATION_RE.test(trimmed)) return 'use um formato como 15m, 2h ou 7d';
      return null;
    }
    case 'url': {
      try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) return 'use http:// ou https://';
        return null;
      } catch {
        return 'URL inválida';
      }
    }
    case 'database-url': {
      if (!parseDatabaseUrl(trimmed)) {
        return 'use postgres:// ou mysql:// com host e banco (ex.: postgres://user:senha@host:5432/okcms)';
      }
      return null;
    }
    case 'secret': {
      if (field.key === 'JWT_SECRET' && trimmed.length < 16) {
        return 'JWT_SECRET precisa de pelo menos 16 caracteres';
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
