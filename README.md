# OkCMS v2

Hybrid, modular, API-first, extensible CMS with Astro+SolidJS frontend, Node.js/TypeScript backend, PostgreSQL, Docker immutable deployments, plugin/theme systems with sandbox, and multi-tenancy.

## Documentation

| Público | Guia |
|---|---|
| Operador (hospeda uma instalação via npm) | [Operator Guide](./docs/operator-guide.md) — pré-requisitos, CLI, deploys, backup |
| Mantenedor (contribui com o código) | [Maintainer Guide](./docs/maintainer-guide.md) — dev local, qualidade, publicação npm/Docker, SDD |
| Desenvolvedor de extensões | [Plugin Development](./docs/plugin-development.md) · [Theme Development](./docs/theme-development.md) |

## Architecture

- **Frontend**: Astro (SSR/SSG) + SolidJS (reactive islands)
- **Backend**: Node.js + TypeScript + Hono
- **Database**: PostgreSQL with Row-Level Security
- **Cache/Queue**: Redis
- **Build**: Docker immutable builds with layer caching
- **Monorepo**: Bun workspaces

## Project Structure

```
okcms-v2/
├── apps/
│   ├── api/           # Hono API server
│   ├── admin/         # Astro + SolidJS admin
│   ├── web/           # Public website
│   └── worker/        # Background job processor
├── packages/
│   ├── types/         # Shared TypeScript types
│   ├── config/        # Configuration management
│   ├── database/      # PostgreSQL connection, migrations, RLS
│   ├── core/          # Bootstrap, lifecycle, events, cache
│   ├── auth/          # JWT, RBAC, sessions
│   ├── api-client/    # HTTP client for API
│   ├── ui/            # Shared UI components
│   ├── plugin-sdk/    # Plugin development SDK
│   ├── theme-sdk/     # Theme development SDK
│   ├── plugin-runtime/# Plugin sandbox and execution
│   ├── theme-runtime/ # Theme rendering engine
│   ├── cli/           # CLI tools
│   └── utils/         # Shared utilities
├── plugins/           # Plugin packages
├── themes/            # Theme packages
├── docker/            # Docker configurations
├── docs/              # Documentation
└── tests/             # Integration tests
```

## Getting Started

### Prerequisites

- Node.js 20+
- Bun 1.3+
- Docker & Docker Compose
- PostgreSQL 16+

### Development

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Start development environment:
   ```bash
   docker compose up -d
   ```

4. Run API server:
   ```bash
   bun run --filter @oktis-works/api dev
   ```

### Building

```bash
# Build all packages
bun run build

# Build specific package
bun run --filter @oktis-works/api build

# Build Docker image
docker build -f apps/api/Dockerfile -t okcms-api .
```

### Testing

```bash
# Run all tests
bun run test

# Run specific package tests
bun run --filter @oktis-works/core test
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/okcms

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key

# Application
NODE_ENV=development
PORT=3000
```

## API Endpoints

### Health
- `GET /health` - Health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check

### Authentication
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout

### Content
- `GET /api/v1/content` - List content
- `GET /api/v1/content/:id` - Get content by ID
- `GET /api/v1/content/slug/:slug` - Get content by slug
- `POST /api/v1/content` - Create content
- `PUT /api/v1/content/:id` - Update content
- `DELETE /api/v1/content/:id` - Delete content
- `GET /api/v1/content/:id/versions` - Get content versions

## License

MIT
