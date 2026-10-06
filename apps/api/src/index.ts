#!/usr/bin/env bun
// @oktis-works/api - Main Entry Point

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { serve } from '@hono/node-server';
import { bootstrap, getEventBus, registerEventAuditLog, establishTenantContext } from '@oktis-works/core';
import { CMS_VERSION } from '@oktis-works/validation';
import { loadConfig } from '@oktis-works/config';
import { traceMiddleware } from './middleware/trace.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { csrfMiddleware } from './middleware/csrf.js';
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
import deploymentsRouter from './routes/deployments/index.js';
import buildsRouter from './routes/builds/index.js';
import eventsRouter from './routes/events/index.js';
import webhooksRouter from './routes/webhooks/index.js';
import contentTypesRouter from './routes/content-types/index.js';
import taxonomiesRouter from './routes/taxonomies/index.js';
import fieldGroupsRouter from './routes/field-groups/index.js';
import fieldTypesRouter from './routes/field-types/index.js';
import metricsRouter from './routes/metrics/index.js';
import auditLogsRouter from './routes/audit-logs/index.js';
import docsRouter from './routes/docs/index.js';
import hooksCatalogRouter from './routes/hooks/index.js';

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

  // rest-api-003: rate limiting global (429 + Retry-After); probes isentos
  app.use('*', rateLimitMiddleware());

  app.use('/api/*', csrfMiddleware);

  // Tenant context middleware
  app.use('*', async (c, next) => {
    const tenantId = c.req.header('X-Tenant-ID') ?? c.req.query('tenantId');

    if (tenantId) {
      await establishTenantContext(tenantId);
    }

    await next();
  });

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
  app.route('/api/v1/deployments', deploymentsRouter);
  app.route('/api/v1/builds', buildsRouter);
  app.route('/api/v1/events', eventsRouter);
  app.route('/api/v1/webhooks', webhooksRouter);
  app.route('/api/v1/content-types', contentTypesRouter);
  app.route('/api/v1/taxonomies', taxonomiesRouter);
  app.route('/api/v1/field-groups', fieldGroupsRouter);
  app.route('/api/v1/field-types', fieldTypesRouter);
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
        deployments: '/api/v1/deployments',
        builds: '/api/v1/builds',
        events: '/api/v1/events',
        webhooks: '/api/v1/webhooks',
        contentTypes: '/api/v1/content-types',
        taxonomies: '/api/v1/taxonomies',
        fieldGroups: '/api/v1/field-groups',
        fieldTypes: '/api/v1/field-types',
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