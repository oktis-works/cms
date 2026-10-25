#!/usr/bin/env bun
// @oktis-works/api - Main Entry Point

import { Hono, type Context } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { serve } from '@hono/node-server';
import { bootstrap, getEventBus, registerEventAuditLog, getRegisteredPluginRoutes } from '@oktis-works/core';
import { pluginRateLimitMiddleware } from './middleware/rate-limit.js';
import { CMS_VERSION } from '@oktis-works/validation';
import { loadConfig } from '@oktis-works/config';
import { traceMiddleware } from './middleware/trace.js';
import { rateLimitMiddleware, loginRateLimitMiddleware } from './middleware/rate-limit.js';
import { csrfMiddleware } from './middleware/csrf.js';
import { auditMiddleware } from './middleware/audit.js';
import { authMiddleware, requirePermission } from './middleware/auth.js';
import authRouter from './routes/auth/index.js';
import contentRouter from './routes/content/index.js';
import postsRouter from './routes/posts/index.js';
import pagesRouter from './routes/pages/index.js';
import healthRouter from './routes/health/index.js';
import usersRouter from './routes/users/index.js';
import tenantsRouter from './routes/tenants/index.js';
import rolesRouter from './routes/roles/index.js';
import mediaRouter from './routes/media/index.js';
import categoriesRouter from './routes/categories/index.js';
import tagsRouter from './routes/tags/index.js';
import menusRouter from './routes/menus/index.js';
import settingsRouter from './routes/settings/index.js';
import pluginsRouter from './routes/plugins/index.js';
import themesRouter from './routes/themes/index.js';
import buildsRouter from './routes/builds/index.js';
import webhooksRouter from './routes/webhooks/index.js';
import apiKeysRouter from './routes/api-keys/index.js';
import contentTypesRouter from './routes/content-types/index.js';
import taxonomiesRouter from './routes/taxonomies/index.js';
import fieldGroupsRouter from './routes/field-groups/index.js';
import fieldTypesRouter from './routes/field-types/index.js';
import blocksRouter from './routes/blocks/index.js';
import patternsRouter from './routes/patterns/index.js';
import commentsRouter from './routes/comments/index.js';
import metricsRouter from './routes/metrics/index.js';
import auditLogsRouter from './routes/audit-logs/index.js';
import docsRouter from './routes/docs/index.js';
import hooksCatalogRouter from './routes/hooks/index.js';
import { matchPluginRoutePath } from './routes/plugins/matcher.js';

export function mountPluginRoutes(app: import('hono').Hono): void {
  // Resolve the registry on every request. Tenant activation/deactivation and
  // route replacement therefore take effect without rebuilding the Hono app.
  const dispatchRequest = async (c: Context): Promise<Response> => {
    const pluginName = c.req.param('pluginName') ?? '';
    const prefix = `/api/v1/plugins/${pluginName}`;
    const relativePath = c.req.path.slice(prefix.length) || '/';
    const candidates = getRegisteredPluginRoutes()
      .filter((entry) => entry.pluginName === pluginName)
      .flatMap((entry) => entry.routes.map((route) => ({ entry, route })))
      .filter(({ route }) => route.method === c.req.method && matchPluginRoutePath(route.path, relativePath));

    if (candidates.length === 0) return c.notFound();

    const dispatch = async (): Promise<Response> => {
      const requestTenant = c.get('tenantId') as string | undefined;
      const selected = candidates.find(({ entry }) => entry.tenantId === requestTenant)
        ?? candidates.find(({ entry }) => entry.tenantId === null);
      if (!selected) return c.notFound();

      const limiter = pluginRateLimitMiddleware(pluginName, selected.entry.rpm, selected.entry.tenantId);
      const limited = await limiter(c, async () => {});
      if (limited) return limited;

      for (const permission of selected.route.requiredPermissions ?? []) {
        const separator = permission.indexOf(':');
        if (separator <= 0 || separator === permission.length - 1) {
          return c.json({ error: 'Invalid plugin route permission' }, 500);
        }
        let authorized = false;
        await requirePermission(permission.slice(0, separator), permission.slice(separator + 1))(c, async () => {
          authorized = true;
        });
        if (!authorized) return c.res;
      }

      let index = 0;
      const runMiddleware = async (): Promise<Response> => {
        const middleware = selected.route.middleware?.[index++];
        if (middleware) {
          await middleware(c, async () => { await runMiddleware(); });
          return c.res;
        }
        const response = await selected.route.handler(c, selected.entry.api);
        return response instanceof Response ? response : c.json(response as Record<string, unknown>);
      };

      try {
        return await runMiddleware();
      } catch (error) {
        console.error(`[Plugin Route] Error in ${pluginName} ${selected.route.method} ${selected.route.path}:`, error);
        return c.json({ error: 'Internal server error' }, 500);
      }
    };

    const requiresAuth = candidates.some(({ entry, route }) =>
      entry.tenantId !== null || !route.public || (route.requiredPermissions?.length ?? 0) > 0
    );
    if (requiresAuth) {
      const authResult = await authMiddleware(c, async () => {
        c.res = await dispatch();
      });
      return authResult ?? c.res;
    }
    return dispatch();
  };

  const handler = (c: Context) => dispatchRequest(c);
  app.all('/api/v1/plugins/:pluginName', handler);
  app.all('/api/v1/plugins/:pluginName/*', handler);
}

async function main() {
  // Initialize application
  const lifecycle = await bootstrap();

  const app = new Hono();

  // REQ-event-bus-005: eventos de domínio → AuditLog
  registerEventAuditLog(getEventBus());

  // Global middleware
  app.use('*', traceMiddleware);
  app.use('*', logger());
  app.use('*', cors({
    origin: (origin: string) => {
      // Allow admin origins with credentials (cookies HttpOnly)
      const config = loadConfig();
      const allowed = config.app.corsOrigins.map((o: string) => o.trim()).filter(Boolean);
      return allowed.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-CSRF-Token'],
    credentials: true,
  }));
  app.use('*', prettyJSON());

  // rest-api-003: rate limiting por classe de tráfego (429 + Retry-After).
  // Credenciais primeiro: o brute force recebe 429 próprio (por IP e por
  // e-mail) em vez de esvaziar o orçamento dos clientes legítimos. Depois o
  // limiter global — anônimo por IP real, autenticado por user id da sessão.
  app.use('/api/v1/auth/login', loginRateLimitMiddleware());
  app.use('/api/v1/auth/api-key-login', loginRateLimitMiddleware());
  app.use('*', rateLimitMiddleware());

  app.use('/api/*', csrfMiddleware);

  app.use('/api/*', auditMiddleware);

  // Plugin routes are mounted after global security middleware is registered.
  // Each private route also applies authentication and declared permissions.
  mountPluginRoutes(app);

  // Health routes (no auth required)
  app.route('/health', healthRouter);

  // API routes (GET /auth/me vive em routes/auth/index.ts — mais completa:
  // roles + tenantId + fallback Bearer; a duplicata routes/auth/me.ts foi removida)
  app.route('/api/v1/auth', authRouter);
  app.route('/api/v1/users', usersRouter);
  app.route('/api/v1/tenants', tenantsRouter);
  app.route('/api/v1/roles', rolesRouter);
  app.route('/api/v1/media', mediaRouter);
  app.route('/api/v1/content', contentRouter);
  app.route('/api/v1/posts', postsRouter);
  app.route('/api/v1/pages', pagesRouter);
  app.route('/api/v1/categories', categoriesRouter);
  app.route('/api/v1/tags', tagsRouter);
  app.route('/api/v1/menus', menusRouter);
  app.route('/api/v1/settings', settingsRouter);
  app.route('/api/v1/plugins', pluginsRouter);
  app.route('/api/v1/themes', themesRouter);
  app.route('/api/v1/builds', buildsRouter);
  app.route('/api/v1/webhooks', webhooksRouter);
  app.route('/api/v1/api-keys', apiKeysRouter);
  app.route('/api/v1/content-types', contentTypesRouter);
  app.route('/api/v1/taxonomies', taxonomiesRouter);
  app.route('/api/v1/field-groups', fieldGroupsRouter);
  app.route('/api/v1/field-types', fieldTypesRouter);
  app.route('/api/v1/blocks', blocksRouter);
  app.route('/api/v1/patterns', patternsRouter);
  app.route('/api/v1/comments', commentsRouter);
  app.route('/api/v1/health', healthRouter);
  app.route('/api/v1/metrics', metricsRouter);
  app.route('/api/v1/audit-logs', auditLogsRouter);
  app.route('/api/v1/docs', docsRouter);
  app.route('/api/v1/hooks/catalog', hooksCatalogRouter);

  app.get('/api', (c) => {
    return c.json({
      name: 'OkCMS API',
      version: CMS_VERSION,
      description: 'Hybrid, modular, API-first CMS',
      endpoints: {
        health: '/health',
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        tenants: '/api/v1/tenants',
        roles: '/api/v1/roles',
        media: '/api/v1/media',
        content: '/api/v1/content',
        posts: '/api/v1/posts',
        pages: '/api/v1/pages',
        categories: '/api/v1/categories',
        tags: '/api/v1/tags',
        menus: '/api/v1/menus',
        settings: '/api/v1/settings',
        plugins: '/api/v1/plugins',
        themes: '/api/v1/themes',
        builds: '/api/v1/builds',
        webhooks: '/api/v1/webhooks',
        apiKeys: '/api/v1/api-keys',
        contentTypes: '/api/v1/content-types',
        taxonomies: '/api/v1/taxonomies',
        fieldGroups: '/api/v1/field-groups',
        fieldTypes: '/api/v1/field-types',
        blocks: '/api/v1/blocks',
        patterns: '/api/v1/patterns',
        comments: '/api/v1/comments',
      },
    });
  });

  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  app.onError((err, c) => {
    console.error('Server error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  const port = Number(process.env['PORT'] ?? 3000);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`OkCMS API running on http://localhost:${info.port}`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await lifecycle.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await lifecycle.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
