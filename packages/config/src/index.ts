// @oktis-works/config - Configuration Management

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
}

export interface StorageConfig {
  provider: 'local' | 's3' | 'minio';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
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

export interface Config {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  storage: StorageConfig;
  worker: WorkerConfig;
  cache: CacheConfig;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
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

export function loadConfig(): Config {
  return {
    app: {
      nodeEnv: (process.env['NODE_ENV'] as AppConfig['nodeEnv']) ?? 'development',
      port: getEnvInt('PORT', 3000),
      host: getEnv('HOST', '0.0.0.0'),
      corsOrigins: getEnv('CORS_ORIGINS', 'http://localhost:4321').split(','),
      rateLimit: {
        windowMs: getEnvInt('RATE_LIMIT_WINDOW_MS', 60000),
        max: getEnvInt('RATE_LIMIT_MAX', 100),
      },
    },
    database: {
      driver: (process.env['DB_DRIVER'] as DatabaseConfig['driver']) ?? 'postgres',
      host: getEnv('DB_HOST', 'localhost'),
      port: getEnvInt('DB_PORT', process.env['DB_DRIVER'] === 'mysql' ? 3306 : 5432),
      database: getEnv('DB_NAME', 'okcms'),
      user: getEnv('DB_USER', 'postgres'),
      password: getEnv('DB_PASSWORD', 'postgres'),
      ssl: getEnvBool('DB_SSL', false),
      maxConnections: getEnvInt('DB_MAX_CONNECTIONS', 20),
      replica: process.env['DB_REPLICA_HOST']
        ? { host: getEnv('DB_REPLICA_HOST', ''), port: getEnvInt('DB_REPLICA_PORT', 5433), enabled: true }
        : undefined,
    },
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
