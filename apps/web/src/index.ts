#!/usr/bin/env bun
// @oktis-works/web - Theme Engine Runtime
// Renders sites via themes using Theme SDK

import { Hono } from 'hono';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { bootstrap } from '@oktis-works/core';
import { runWithTenantContext } from '@oktis-works/core';
import { getConnection, runWithTenantTransaction } from '@oktis-works/database';
import {
  createRouter,
  wireThemeHooks,
  renderContentPage,
  fetchSiteSettings,
  resolveThemeAssetPath,
  contentTypeForAsset,
} from './rendering.js';
import { createDatabaseThemeDataProvider, loadThemeRenderData } from './theme-data.js';
import { resolveTenantFromHost } from './tenant-resolver.js';
import { runWithThemeDataProvider, setCurrentContent } from '@oktis-works/theme-sdk';

type Variables = {
  tenant: Record<string, unknown>;
};

type ContentRow = Record<string, unknown>;

function bodyOf(row: ContentRow): Record<string, unknown> {
  return ((row['body'] as Record<string, unknown>) ?? {}) as Record<string, unknown>;
}

async function main() {
  const lifecycle = await bootstrap();

  wireThemeHooks();

  const themesRoot = process.env['THEMES_DIR'] ?? join(process.cwd(), 'themes');
  const activeTheme = process.env['ACTIVE_THEME'] ?? 'default';
  const router = createRouter(themesRoot, activeTheme);

  const app = new Hono<{ Variables: Variables }>();

  // Tenant resolution middleware (loopback → default; senão subdomain/domain)
  app.use('*', async (c, next) => {
    const tenant = await resolveTenantFromHost(c.req.header('host') ?? '');

    if (!tenant) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    const tenantId = String(tenant['id']);
    return runWithTenantTransaction(tenantId, () =>
      runWithTenantContext({ tenantId }, () => {
        c.set('tenant', tenant);
        return next();
      })
    );
  });

  // Health check — verifica conexão com o banco (o web lê direto do Postgres)
  app.get('/health', async (c) => {
    try {
      const sql = getConnection();
      await sql`SELECT 1`;
      return c.json({
        status: 'healthy',
        service: 'web',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } catch {
      return c.json({
        status: 'unhealthy',
        service: 'web',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      }, 503);
    }
  });

  // B2 — assets do tema: GET /themes/<tema>/<path> → serveStatic do diretório
  // themes/ com traversal guard (resolveThemeAssetPath nega qualquer escape).
  app.get('/themes/*', async (c) => {
    const wildcard = c.req.path.replace(/^\/themes\//, '');
    const [themeName, ...rest] = wildcard.split('/');
    const assetPath = rest.join('/');

    const target = resolveThemeAssetPath(themesRoot, themeName ?? '', assetPath);
    if (!target || !existsSync(target) || !statSync(target).isFile()) {
      return c.notFound();
    }

    return c.body(new Uint8Array(readFileSync(target)), 200, {
      'Content-Type': contentTypeForAsset(target),
      'Cache-Control': 'public, max-age=3600',
    });
  });

  // Content rendering routes (FEAT-095: runtime routing catch-all) — render REAL
  app.get('*', async (c) => {
    const path = c.req.path;

    try {
      const resolution = await router.resolve(path);

      if (!resolution.matched) {
        return c.notFound();
      }

      // B1 — conteúdo real: row publicada do slug resolvido
      let contentRow: ContentRow | null = null;
      let data: Record<string, unknown> = {};
      if (resolution.slug && resolution.contentType) {
        const rows = await getConnection().unsafe(
          "SELECT * FROM content WHERE slug = $1 AND type = $2 AND status = 'PUBLISHED' LIMIT 1",
          [resolution.slug, resolution.contentType]
        );
        contentRow = (rows as unknown as ContentRow[])[0] ?? null;
        if (contentRow) {
          setCurrentContent(contentRow);
          data = bodyOf(contentRow);
        }
      }

      // B1 — archives/home: itens publicados recentes do tipo resolvido
      const items: Record<string, unknown>[] = [];
      if (!resolution.slug) {
        const typeFilter = resolution.contentType
          ? 'WHERE type = $1 AND status = \'PUBLISHED\''
          : "WHERE status = 'PUBLISHED'";
        const params = resolution.contentType ? [resolution.contentType] : [];
        const rows = await getConnection().unsafe(
          `SELECT * FROM content ${typeFilter} ORDER BY published_at DESC NULLS LAST, updated_at DESC LIMIT 20`,
          params
        );
        items.push(
          ...(rows as unknown as ContentRow[]).map((row) => ({
            ...bodyOf(row),
            title: row['title'],
            slug: row['slug'],
            type: row['type'],
            excerpt: row['excerpt'],
            published_at: row['published_at'],
            updated_at: row['updated_at'],
          }))
        );
      }

      // B1 — título/meta das settings (fim do "OkCMS" hardcoded)
      const settings = await fetchSiteSettings(getConnection());

      const provider = createDatabaseThemeDataProvider(getConnection(), String(c.get('tenant')['id']));
      const html = await runWithThemeDataProvider(provider, async () => {
        const themeData = await loadThemeRenderData(provider);
        return renderContentPage({
          resolution,
          contentRow,
          data,
          items,
          settings,
          themeData,
          activeTheme,
          themesRoot,
        });
      });

      return c.html(html);
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
