// @oktis-works/config - Configuration Management

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DatabaseConfig {
  driver: 'postgres' | 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  /** Tentativas de reconexão no bootstrap (core-bootstrap-002). */
  retries?: number;
  /** Replica opcional para leitura (primary+read-replica). Se undefined, usa primary. */
  replica?: {
    host: string;
    port: number;
    enabled: boolean;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  /** cluster opcional — se true, usa Cluster; se false/undefined, single. Se host=disabled, fallback memória. */
  cluster?: boolean;
  enabled?: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  bcryptRounds: number;
  /** Cookie options for auth tokens */
  cookie: {
    /** SameSite policy: 'strict' | 'lax' | 'none' (none requer Secure=true) */
    sameSite: 'strict' | 'lax' | 'none';
    /** Secure flag (auto em produção se undefined) */
    secure?: boolean;
    /** Domain compartilhado entre admin e API (ex.: .example.com). */
    domain?: string;
    /** Access token cookie max-age in seconds (default 15min) */
    accessTokenMaxAge?: number;
    /** Refresh token cookie max-age in seconds (default 30d) */
    refreshTokenMaxAge?: number;
  };
  /** CSRF protection (double-submit cookie) */
  csrf: {
    enabled: boolean;
    /** Header name for CSRF token */
    headerName: string;
    /** Cookie name for CSRF token */
    cookieName: string;
  };
}

export interface StorageConfig {
  provider: 'local' | 's3' | 'minio';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
}

/**
 * Defaults canônicos do rate limiting — FONTE ÚNICA para a API (`parseRateLimitSettings`),
 * o wizard da CLI (`env-schema`) e o `.env.example`. Mudar um default aqui muda os três;
 * o teste de catálogo da CLI (`config-wizard.test.ts`) trava esse vínculo.
 */
export const RATE_LIMIT_DEFAULTS = {
  /** Janela do bucket anônimo (por IP real do cliente). */
  windowSeconds: 60,
  /** Bucket anônimo: crawlers, clientes API sem sessão, visitantes do site público. */
  max: 300,
  /**
   * Bucket autenticado (por user id da sessão). Maior que o anônimo porque o
   * admin gasta ~5 requisições por navegação e não pode competir com tráfego
   * anônimo — foi exatamente o que produzia 429 + "logout" falso no admin.
   */
  authMax: 1200,
  /** Tentativas de POST /auth/login por e-mail na janela de login. */
  loginMax: 10,
  /** Tentativas de POST /auth/login por IP (protege a cauda de e-mails rotativos). */
  loginMaxPerIp: 100,
  /** Janela do limiter de credenciais (brute force é lento, não por segundo). */
  loginWindowSeconds: 300,
} as const;

export interface RateLimitSettings {
  windowMs: number;
  max: number;
  authMax: number;
  loginMax: number;
  loginMaxPerIp: number;
  loginWindowMs: number;
}

/**
 * Lê as variáveis de rate limiting com fallbacks explícitos.
 *
 * `RATE_LIMIT_WINDOW_SECONDS` é o nome canônico. `RATE_LIMIT_WINDOW_MS` é
 * aceito por compatibilidade com `.env` antigos gerados pela CLI (era o nome
 * gravado no wizard antes da correção) e é convertido para segundos.
 */
export function parseRateLimitSettings(
  env: Record<string, string | undefined> = process.env
): RateLimitSettings {
  const positive = (raw: string | undefined, fallback: number): number => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };

  const windowSeconds = env['RATE_LIMIT_WINDOW_SECONDS'] !== undefined
    ? positive(env['RATE_LIMIT_WINDOW_SECONDS'], RATE_LIMIT_DEFAULTS.windowSeconds)
    : env['RATE_LIMIT_WINDOW_MS'] !== undefined
      ? positive(env['RATE_LIMIT_WINDOW_MS'], RATE_LIMIT_DEFAULTS.windowSeconds * 1000) / 1000
      : RATE_LIMIT_DEFAULTS.windowSeconds;

  return {
    windowMs: Math.max(1, Math.floor(windowSeconds)) * 1000,
    max: positive(env['RATE_LIMIT_MAX'], RATE_LIMIT_DEFAULTS.max),
    authMax: positive(env['RATE_LIMIT_AUTH_MAX'], RATE_LIMIT_DEFAULTS.authMax),
    loginMax: positive(env['RATE_LIMIT_LOGIN_MAX'], RATE_LIMIT_DEFAULTS.loginMax),
    loginMaxPerIp: positive(env['RATE_LIMIT_LOGIN_MAX_PER_IP'], RATE_LIMIT_DEFAULTS.loginMaxPerIp),
    loginWindowMs:
      positive(env['RATE_LIMIT_LOGIN_WINDOW_SECONDS'], RATE_LIMIT_DEFAULTS.loginWindowSeconds) * 1000,
  };
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimit: RateLimitSettings;
}

export interface WorkerConfig {
  mode: 'docker' | 'pm2' | 'k8s';
  count: number;
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface CacheConfig {
  ttl: number;
  prefix: string;
}

export interface PluginsConfig {
  /**
   * Allowlist de permissões concedidas a plugins (catálogo de permissões).
   * Default: catálogo completo; a configuração só restringe.
   */
  allowedPermissions: string[];
  /** Timeout de callbacks de hook em ms (0 = sem timeout). */
  hookTimeoutMs: number;
  /** TTL (ms) do cache de plugins carregados por tenant. */
  tenantLoadTtlMs: number;
  /** Máximo de tenants com plugins carregados em memória (LRU). */
  maxLoadedTenants: number;
}

export interface Config {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  storage: StorageConfig;
  worker: WorkerConfig;
  cache: CacheConfig;
  plugins: PluginsConfig;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Carrega o .env do projeto quando a aplicação é iniciada diretamente
 * (`bun run dev`, `bunx @oktis-works/api`, etc.). Variáveis já presentes no
 * ambiente sempre vencem; assim, secrets injetados pelo shell/CI não são
 * substituídos pelo arquivo local.
 */
function loadProjectEnv(): void {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;

  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;

    const key = match[1];
    if (!key) continue;
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

function getEnvSameSite(key: string, defaultValue: 'strict' | 'lax' | 'none'): 'strict' | 'lax' | 'none' {
  const value = process.env[key];
  if (!value) return defaultValue;
  const normalized = value.toLowerCase();
  if (['strict', 'lax', 'none'].includes(normalized)) return normalized as 'strict' | 'lax' | 'none';
  throw new Error(`Invalid AUTH_COOKIE_SAMESITE: "${value}" — must be 'strict', 'lax', or 'none'`);
}

export interface ParsedDatabaseUrl {
  driver: 'postgres' | 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/**
 * Parseia DATABASE_URL (postgres:// | postgresql:// | mysql://).
 * Lança erro com mensagem clara em caso de formato inválido — falha barulhenta
 * no boot é melhor que conexão silenciosa com valores errados.
 */
export function parseDatabaseUrl(url: string): ParsedDatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL inválida: não é uma URL válida — ${url}`);
  }
  const protocol = parsed.protocol.replace(/:$/, '');
  let driver: 'postgres' | 'mysql';
  if (protocol === 'postgres' || protocol === 'postgresql') driver = 'postgres';
  else if (protocol === 'mysql') driver = 'mysql';
  else {
    throw new Error(
      `DATABASE_URL inválida: protocolo "${protocol}" não suportado (use postgres:// ou mysql://)`
    );
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error(`DATABASE_URL inválida: falta o nome do banco (ex.: postgres://user:pass@host:5432/okcms)`);
  }
  const sslmode = parsed.searchParams.get('sslmode');
  return {
    driver,
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number(parsed.port) : driver === 'mysql' ? 3306 : 5432,
    database,
    user: decodeURIComponent(parsed.username) || 'postgres',
    password: decodeURIComponent(parsed.password),
    ssl: sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full' ? true : undefined,
  };
}

/**
 * Conexão com o banco — o usuário escolhe UM formato no ambiente:
 *   a) DATABASE_URL=postgresql://user:pass@host:5432/db  (tem precedência);
 *   b) variáveis separadas DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.
 */
function loadDatabaseConfig(): DatabaseConfig {
  const rawUrl = process.env['DATABASE_URL']?.trim();
  const fromUrl = rawUrl ? parseDatabaseUrl(rawUrl) : undefined;
  const driver =
    fromUrl?.driver ?? ((process.env['DB_DRIVER'] as DatabaseConfig['driver']) ?? 'postgres');
  return {
    driver,
    host: fromUrl?.host ?? getEnv('DB_HOST', 'localhost'),
    port: fromUrl?.port ?? getEnvInt('DB_PORT', driver === 'mysql' ? 3306 : 5432),
    database: fromUrl?.database ?? getEnv('DB_NAME', 'okcms'),
    user: fromUrl?.user ?? getEnv('DB_USER', 'postgres'),
    password: fromUrl?.password ?? getEnv('DB_PASSWORD', 'postgres'),
    ssl: fromUrl?.ssl ?? getEnvBool('DB_SSL', false),
    maxConnections: getEnvInt('DB_MAX_CONNECTIONS', 20),
    replica: process.env['DB_REPLICA_HOST']
      ? { host: getEnv('DB_REPLICA_HOST', ''), port: getEnvInt('DB_REPLICA_PORT', 5433), enabled: true }
      : undefined,
  };
}

export function loadConfig(): Config {
  loadProjectEnv();
  return {
    app: {
      nodeEnv: (process.env['NODE_ENV'] as AppConfig['nodeEnv']) ?? 'development',
      port: getEnvInt('PORT', 3000),
      host: getEnv('HOST', '0.0.0.0'),
      corsOrigins: getEnv('CORS_ORIGINS', 'http://localhost:3011,http://127.0.0.1:3011').split(','),
      // loadProjectEnv() já carregou o .env do projeto — parser lê process.env.
      rateLimit: parseRateLimitSettings(),
    },
    database: loadDatabaseConfig(),
    redis: {
      host: getEnv('REDIS_HOST', 'localhost'),
      port: getEnvInt('REDIS_PORT', 6379),
      password: process.env['REDIS_PASSWORD'],
      db: getEnvInt('REDIS_DB', 0),
      cluster: getEnvBool('REDIS_CLUSTER', false),
      enabled: getEnv('REDIS_HOST', 'localhost') !== 'disabled',
    },
    auth: {
      jwtSecret: getEnv('JWT_SECRET', 'dev-secret-change-in-production'),
      jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
      refreshTokenExpiresIn: getEnv('REFRESH_TOKEN_EXPIRES_IN', '7d'),
      bcryptRounds: getEnvInt('BCRYPT_ROUNDS', 12),
      cookie: {
        sameSite: getEnvSameSite('AUTH_COOKIE_SAMESITE', 'lax'),
        secure: process.env['AUTH_COOKIE_SECURE'] === undefined
          ? undefined
          : getEnvBool('AUTH_COOKIE_SECURE', false),
        domain: process.env['AUTH_COOKIE_DOMAIN'] || undefined,
        accessTokenMaxAge: getEnvInt('AUTH_COOKIE_ACCESS_MAXAGE', 60 * 15),
        refreshTokenMaxAge: getEnvInt('AUTH_COOKIE_REFRESH_MAXAGE', 60 * 60 * 24 * 30),
      },
      csrf: {
        enabled: getEnvBool('AUTH_CSRF_ENABLED', true),
        headerName: getEnv('AUTH_CSRF_HEADER', 'x-csrf-token'),
        cookieName: getEnv('AUTH_CSRF_COOKIE', 'csrf_token'),
      },
    },
    storage: {
      provider: (process.env['STORAGE_PROVIDER'] as StorageConfig['provider']) ?? 'local',
      bucket: getEnv('STORAGE_BUCKET', 'okcms-media'),
      region: process.env['STORAGE_REGION'],
      endpoint: process.env['STORAGE_ENDPOINT'],
      accessKey: process.env['STORAGE_ACCESS_KEY'],
      secretKey: process.env['STORAGE_SECRET_KEY'],
    },
    worker: {
      mode: (process.env['WORKER_MODE'] as WorkerConfig['mode']) ?? 'docker',
      count: getEnvInt('WORKER_COUNT', 1),
      concurrency: getEnvInt('WORKER_CONCURRENCY', 5),
      retryAttempts: getEnvInt('WORKER_RETRY_ATTEMPTS', 3),
      retryDelay: getEnvInt('WORKER_RETRY_DELAY', 1000),
    },
    cache: {
      ttl: getEnvInt('CACHE_TTL', 3600),
      prefix: getEnv('CACHE_PREFIX', 'bl:'),
    },
    plugins: {
      // Política de permissões: sem env → catálogo completo (validation)
      allowedPermissions: getEnv('OKCMS_PLUGIN_PERMISSIONS', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      hookTimeoutMs: getEnvInt('OKCMS_PLUGIN_HOOK_TIMEOUT_MS', 5000),
      tenantLoadTtlMs: getEnvInt('OKCMS_PLUGIN_TENANT_TTL_MS', 30000),
      maxLoadedTenants: getEnvInt('OKCMS_PLUGIN_MAX_TENANTS', 100),
    },
  };
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
