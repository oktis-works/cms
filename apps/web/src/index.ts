#!/usr/bin/env bun
// @oktis-works/web - Theme Engine Runtime
// Renders sites via themes using Theme SDK

import { Hono } from 'hono';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { bootstrap } from '@oktis-works/core';
import { establishTenantContext } from '@oktis-works/core';
import { getConnection } from '@oktis-works/database';
import { createRouter, wireThemeHooks } from './rendering.js';
import { setCurrentContent } from '@oktis-works/theme-sdk';

type Variables = {
  tenant: Record<string, unknown>;
};

async function main() {
  const lifecycle = await bootstrap();

  wireThemeHooks();

  const themesRoot = process.env['THEMES_DIR'] ?? join(process.cwd(), 'themes');
  const activeTheme = process.env['ACTIVE_THEME'] ?? 'default';
  const router = createRouter(themesRoot, activeTheme);

  const app = new Hono<{ Variables: Variables }>();

  // Tenant resolution middleware
  app.use('*', async (c, next) => {
    // Resolve tenant from subdomain or domain
    const host = c.req.header('host') ?? '';
    const sql = getConnection();

    // Try subdomain resolution first
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      const tenants = await sql.unsafe(
        'SELECT * FROM tenants WHERE subdomain = $1 AND status = $2',
        [subdomain, 'ACTIVE']
      );

      if (tenants.length > 0) {
        const tenant = tenants[0] as Record<string, unknown>;
        await establishTenantContext(tenant['id'] as string);
        c.set('tenant', tenant);
        return next();
      }
    }

    // Try domain resolution
    const tenants = await sql.unsafe(
      'SELECT * FROM tenants WHERE domain = $1 AND status = $2',
      [host, 'ACTIVE']
    );

    if (tenants.length > 0) {
      const tenant = tenants[0] as Record<string, unknown>;
      await establishTenantContext(tenant['id'] as string);
      c.set('tenant', tenant);
      return next();
    }

    return c.json({ error: 'Tenant not found' }, 404);
  });

  // Health check
  app.get('/health', async (c) => {
    return c.json({
      status: 'healthy',
      service: 'web',
      timestamp: new Date().toISOString(),
    });
  });

  // Content rendering routes (FEAT-095: runtime routing catch-all)
  app.get('*', async (c) => {
    const path = c.req.path;

    try {
      const resolution = await router.resolve(path);

      if (!resolution.matched) {
        return c.notFound();
      }

      if (resolution.slug && resolution.contentType) {
        const rows = await getConnection().unsafe(
          "SELECT * FROM content WHERE slug = $1 AND type = $2 AND status = 'PUBLISHED' LIMIT 1",
          [resolution.slug, resolution.contentType]
        );
        const row = (rows as unknown as Array<Record<string, unknown>>)[0];
        if (row) setCurrentContent(row);
      }

      const escapeAttr = (value: string): string =>
        value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const template = escapeAttr(resolution.template ?? '');
      const contentType = escapeAttr(resolution.contentType ?? '');
      const themeAttr = escapeAttr(activeTheme);

      return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OkCMS</title>
  <link rel="stylesheet" href="/themes/${themeAttr}/dist/theme.css" data-theme-style="${themeAttr}" />
</head>
<body>
  <main data-theme="${themeAttr}" data-template="${template}" data-type="${contentType}">
    <!-- Rendered by theme template (isolado via [data-theme="${themeAttr}"]) -->
  </main>
</body>
</html>`);
    } catch (error) {
      console.error('[web] Falha ao resolver rota:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  // Start server
  const port = Number(process.env['WEB_PORT'] ?? 3001);

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`OkCMS Web running on http://localhost:${info.port}`);
    }
  );

  // Graceful shutdown
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
  console.error('Failed to start web server:', error);
  process.exit(1);
});
