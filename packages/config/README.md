# @oktis-works/config

Configuration loader — environment variables, config files, runtime settings.

## Sources (priority order)

1. **Environment variables** (highest)
2. **Config file** (`config.yaml` / `config.json` / `config.toml`)
3. **Defaults** (lowest)

## Schema

```typescript
interface Config {
  app: {
    env: 'development' | 'production' | 'test';
    port: number;
    host: string;
    baseUrl: string;           // e.g., 'https://example.com'
    secret: string;            // JWT signing secret
  };
  database: {
    provider: 'postgres' | 'mysql' | 'mariadb';
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    maxConnections: number;
    ssl?: boolean;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  storage: {
    driver: 'local' | 's3';
    local: { uploadDir: string; publicUrl: string };
    s3?: { bucket: string; region: string; accessKey: string; secretKey: string };
  };
  mail?: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
  };
  jwt: {
    accessTokenTtl: number;    // seconds
    refreshTokenTtl: number;   // seconds
  };
  theme: {
    defaultTheme: string;      // fallback theme name
  };
  plugins: {
    platformDir: string;       // platform-wide plugins
    tenantDir: string;         // per-tenant plugins
  };
}
```

## Usage

```typescript
import { loadConfig } from '@oktis-works/config';

const config = loadConfig();  // loads from env + config file
```

## Environment Variables

| Variable | Config Path | Default |
|----------|-------------|---------|
| `APP_ENV` | `app.env` | `development` |
| `APP_PORT` | `app.port` | `3001` |
| `APP_HOST` | `app.host` | `0.0.0.0` |
| `APP_BASE_URL` | `app.baseUrl` | `http://localhost:3001` |
| `APP_SECRET` | `app.secret` | required |
| `DB_PROVIDER` | `database.provider` | `postgres` |
| `DB_HOST` | `database.host` | `localhost` |
| `DB_PORT` | `database.port` | `5432` |
| `DB_USER` | `database.user` | `postgres` |
| `DB_PASSWORD` | `database.password` | required |
| `DB_NAME` | `database.database` | `okcms` |
| `DB_MAX_CONNECTIONS` | `database.maxConnections` | `10` |
| `STORAGE_DRIVER` | `storage.driver` | `local` |
| `STORAGE_LOCAL_DIR` | `storage.local.uploadDir` | `./uploads` |
| `STORAGE_PUBLIC_URL` | `storage.local.publicUrl` | `/uploads` |
| `JWT_ACCESS_TTL` | `jwt.accessTokenTtl` | `900` (15min) |
| `JWT_REFRESH_TTL` | `jwt.refreshTokenTtl` | `604800` (7 days) |
| `THEME_DEFAULT` | `theme.defaultTheme` | `default` |
| `PLUGINS_PLATFORM_DIR` | `plugins.platformDir` | `./plugins/platform` |
| `PLUGINS_TENANT_DIR` | `plugins.tenantDir` | `./plugins/tenant` |

## Config File

Place at project root: `config.yaml` (recommended), `config.json`, or `config.toml`.

```yaml
app:
  env: production
  port: 3001
  baseUrl: https://mysite.com
  secret: "super-secret-key"

database:
  provider: postgres
  host: db.example.com
  port: 5432
  user: okcms
  password: "${DB_PASSWORD}"
  database: okcms_prod
  maxConnections: 20
  ssl: true

storage:
  driver: s3
  s3:
    bucket: okcms-uploads
    region: us-east-1
    accessKey: "${AWS_ACCESS_KEY}"
    secretKey: "${AWS_SECRET_KEY}"

mail:
  host: smtp.example.com
  port: 587
  user: mailbot
  password: "${MAIL_PASSWORD}"
  from: "noreply@mysite.com"
```

## Phase 1 Integration

- `app.baseUrl` used for canonical URLs, sitemap, JSON-LD, feeds
- `database.maxConnections` passed to pool config (fallback 10)
- `theme.defaultTheme` used as fallback when no active theme in DB

## Loading

```typescript
// Loaded once at app bootstrap
const config = loadConfig();

// Access anywhere
import { config } from '@oktis-works/config';
console.log(config.app.baseUrl);
```

## Validation

- Required fields validated on load
- Missing required env vars → throws with clear message
- Unknown keys in config file → warning (strict mode available)