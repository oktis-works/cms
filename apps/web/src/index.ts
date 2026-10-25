#!/usr/bin/env bun
// @oktis-works/web - Theme Engine Runtime
// Renders sites via themes using Theme SDK

import { Hono } from 'hono';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { bootstrap, ensureTenantPluginsLoaded, getPluginBlocks, getPluginPatterns } from '@oktis-works/core';
import { resolveExtensionDirectory } from '@oktis-works/core';
import { runWithTenantContext } from '@oktis-works/core';
import { getPluginAssets } from '@oktis-works/core';
import { CMS_VERSION, normalizeLogicalValues } from '@oktis-works/validation';
import { getConnection, runWithTenantTransaction } from '@oktis-works/database';
import {
  createRouter,
  wireThemeHooks,
  renderContentPage,
  toSiteSettings,
  resolveThemeAssetPath,
  contentTypeForAsset,
  enrichItemsMedia,
  buildThemeSettings,
  mergePreviewSettings,
  renderAssetTags,
  renderPluginBlocks,
} from './rendering.js';
import { createDatabaseThemeDataProvider, loadThemeRenderData } from './theme-data.js';
import { resolveTenantFromHost } from './tenant-resolver.js';
import { runWithThemeDataProvider } from '@oktis-works/theme-sdk';

type Variables = {
  tenant: Record<string, unknown>;
};

type ContentRow = Record<string, unknown>;
const SAFE_THEME_NAME_RE = /^[A-Za-z0-9_-]+$/;

function bodyOf(row: ContentRow): Record<string, unknown> {
  return normalizeLogicalValues({ body: row['body'], data: row['data'], native: row });
}

/**
 * Tema ativo efetivo: a fonte única é o banco (status ACTIVE, gravado pelo
 * admin ou pela CLI). Sem linha ativa — ou com o tema sem arquivos no disco —
 * cai no ACTIVE_THEME do ambiente. Lido por request: ativação no admin não
 * exige restart do web. A row completa volta junto (manifest + config do
 * customizador) para expor `settings.theme` nos templates.
 */
async function resolveActiveTheme(
  themesRoot: string,
  envFallback: string,
  previewTheme?: string
): Promise<{ name: string; row: Record<string, unknown> | null; parentManifests: Array<Record<string, unknown>> }> {
  try {
    const rows = previewTheme && SAFE_THEME_NAME_RE.test(previewTheme)
      ? await getConnection().unsafe('SELECT * FROM themes WHERE name = $1 LIMIT 1', [previewTheme])
      : await getConnection().unsafe(
        `SELECT * FROM themes WHERE status = 'ACTIVE'
         ORDER BY (tenant_id IS NULL), activated_at DESC NULLS LAST, created_at DESC
         LIMIT 1`
      );
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    const name = row?.['name'];
    if (typeof name === 'string' && SAFE_THEME_NAME_RE.test(name) && existsSync(join(themesRoot, name))) {
      const parentManifests: Array<Record<string, unknown>> = [];
      const manifest = row?.['manifest'] as Record<string, unknown> | null;
      let parentName = manifest?.['parent'] as string | undefined;
      const visited = new Set<string>([name]);
      while (parentName && SAFE_THEME_NAME_RE.test(parentName) && !visited.has(parentName)) {
        visited.add(parentName);
        const parentRows = await getConnection().unsafe(
          `SELECT manifest FROM themes
           WHERE name = $1
             AND (tenant_id = current_setting('app.current_tenant_id', true)::uuid OR tenant_id IS NULL)
           ORDER BY tenant_id NULLS LAST
           LIMIT 1`,
          [parentName]
        );
        if (parentRows[0]) {
          const parentManifest = parentRows[0]['manifest'] as Record<string, unknown> | null;
          if (parentManifest) {
            parentManifests.push(parentManifest);
            parentName = parentManifest['parent'] as string | undefined;
          } else {
            parentName = undefined;
          }
        } else {
          throw new Error(`Missing parent theme "${parentName}"`);
        }
      }
      if (parentName && !SAFE_THEME_NAME_RE.test(parentName)) throw new Error(`Unsafe parent theme name "${parentName}"`);
      if (parentName && visited.has(parentName)) throw new Error(`Theme inheritance cycle detected at "${parentName}"`);
      return { name, row: row ?? null, parentManifests };
    }
  } catch (error) {
    if (error instanceof Error && /theme|parent/i.test(error.message)) throw error;
    // tabela ausente/falha de leitura nunca derruba o render — usa o env
  }
  return { name: envFallback, row: null, parentManifests: [] };
}

async function main() {
  const lifecycle = await bootstrap();

  await wireThemeHooks();

  // Fonte ÚNICA de resolução do diretório de temas: a mesma função usada pela
  // API/CLI (env → okcms.config.json → ./themes). Antes o web lia só
  // THEMES_DIR com outro fallback — apps com cwd diferente divergiam.
  const themesRoot = resolveExtensionDirectory('theme');
  const envActiveTheme = process.env['ACTIVE_THEME']?.trim() || 'default';

  const app = new Hono<{ Variables: Variables }>();

  // Assinatura do produto para detectores (Wappalyzer etc.): X-Powered-By em
  // TODA resposta do site público. Vale inclusive para temas full-control,
  // que são donos do próprio <head> e por isso não recebem o
  // <meta name="generator"> aplicado pelo wrapDocument.
  app.use('*', async (c, next) => {
    c.header('X-Powered-By', `OkCMS/${CMS_VERSION}`);
    await next();
  });

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
        return ensureTenantPluginsLoaded(tenantId).then(() => next());
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
      // Tema ativo por request (banco → env): ativação reflete sem restart.
      const active = await resolveActiveTheme(themesRoot, envActiveTheme, c.req.query('preview_theme'));
      const activeTheme = active.name;
      const parentManifests = active.parentManifests;
      const router = createRouter(themesRoot, activeTheme);
      const resolution = await router.resolve(path);

      if (!resolution.matched) {
        return c.notFound();
      }

      // B1 — conteúdo real: payload já enriquecido pelo lookup (mídia real +
      // _terms) — sem re-consultar a row crua.
      let contentRow: ContentRow | null = null;
      let data: Record<string, unknown> = {};
      if (resolution.slug && resolution.contentType) {
        contentRow = (resolution.record as ContentRow | undefined) ?? null;
        data = resolution.data ?? {};
      }

      // B1 — archives/home/page_for_posts/front page: itens publicados recentes.
      // A front page estática e a page_for_posts sempre listam POSTS (são
      // páginas de listagem); archives listam o próprio tipo; a home "pelada"
      // (sem nenhuma configuração) lista tudo que está publicado.
      const items: Record<string, unknown>[] = [];
      let pagination: { page: number; perPage: number; total: number; pages: number; previousPage?: number; nextPage?: number; hasPrevious: boolean; hasNext: boolean } | undefined;
      const isListingPage = resolution.isPageForPosts === true || resolution.isFrontPage === true;
      const shouldFetchItems = !resolution.slug || isListingPage;
      if (shouldFetchItems) {
        const itemsType = isListingPage ? 'post' : resolution.contentType;
        const typeFilter = itemsType
          ? 'WHERE type = $1 AND status = \'PUBLISHED\''
          : "WHERE status = 'PUBLISHED'";
        const params = itemsType ? [itemsType] : [];
        const requestedPage = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
        const requestedLimit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('per_page') ?? '20', 10) || 20));
        const countRows = await getConnection().unsafe(`SELECT COUNT(*)::int AS total FROM content ${typeFilter}`, params);
        const total = Number((countRows[0] as { total?: number | string } | undefined)?.total ?? 0);
        pagination = {
          page: requestedPage,
          perPage: requestedLimit,
          total,
          pages: Math.ceil(total / requestedLimit),
          previousPage: requestedPage > 1 ? requestedPage - 1 : undefined,
          nextPage: requestedPage * requestedLimit < total ? requestedPage + 1 : undefined,
          hasPrevious: requestedPage > 1,
          hasNext: requestedPage * requestedLimit < total,
        };
        const rows = await getConnection().unsafe(
          `SELECT * FROM content ${typeFilter} ORDER BY published_at DESC NULLS LAST, updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, requestedLimit, (requestedPage - 1) * requestedLimit]
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

        // REQU-028-001 em lote: cover/image dos itens viram objetos reais
        try {
          await enrichItemsMedia(getConnection(), items);
        } catch {
          // enriquecimento de lista nunca derruba a renderização
        }
      }

      const provider = createDatabaseThemeDataProvider(getConnection(), String(c.get('tenant')['id']));
      const html = await runWithThemeDataProvider(provider, async () => {
        const themeData = await loadThemeRenderData(provider);

        // Item 8: assets enfileirados por plugins (api.assets) — escopo
        // platform + tenant, dedupe por URL na renderização. Falha nunca
        // derruba a página (segue sem assets de plugin).
        const tenantId = String(c.get('tenant')['id']);
        const [platformBlocks, tenantBlocks, platformPatterns, tenantPatterns] = await Promise.all([
          getPluginBlocks(null),
          getPluginBlocks(tenantId),
          getPluginPatterns(null),
          getPluginPatterns(tenantId),
        ]);
        const themeDataWithPlugins = {
          ...themeData,
          pluginBlocks: [...platformBlocks, ...tenantBlocks].flatMap((entry) => entry.blocks) as unknown as Array<Record<string, unknown>>,
          pluginPatterns: [...platformPatterns, ...tenantPatterns].flatMap((entry) => entry.patterns) as unknown as Array<Record<string, unknown>>,
        };
        const blockCatalog = (themeDataWithPlugins.pluginBlocks as Array<{ type: string; label: string; pluginName: string; rendererPath?: string }>)
          .map((block) => ({
            ...block,
            type: block.type.includes('/') ? block.type : `${block.pluginName}/${block.type}`,
          }));
        const renderedBlocks = await renderPluginBlocks(
          data['_blocks'] ?? data['blocks'],
          blockCatalog,
          resolveExtensionDirectory('plugin'),
          (themeDataWithPlugins.pluginPatterns as Array<{ name: string; label: string; pluginName: string; content: string }>)
        );
        const renderData = renderedBlocks === null ? data : { ...data, html: renderedBlocks };
        let pluginAssetTags: { head: string; footer: string } | undefined;
        try {
          const [platformAssets, tenantAssets] = await Promise.all([
            getPluginAssets(null),
            getPluginAssets(tenantId),
          ]);
          pluginAssetTags = renderAssetTags(
            [...platformAssets, ...tenantAssets].flatMap((entry) => entry.assets)
          );
        } catch {
          pluginAssetTags = undefined;
        }

        // B1 — título/meta das settings (fim do "OkCMS" hardcoded) + o config do
        // customizador do tema ativo exposto como `settings.theme`. As settings
        // vêm do provider do tema (mesma fonte/contrato das demais consultas,
        // com filtro de tenant) — não de uma query ad-hoc sem tenant_id.
        const rawSettings = await provider.getSettings().catch(() => ({}));
        
        // Extract allowed setting keys from manifest for preview whitelist
        const manifest = active.row?.['manifest'] as Record<string, unknown> | null;
        const allowedKeys = Array.isArray(manifest?.['settings'])
          ? (manifest['settings'] as unknown[])
              .map((s: unknown) => (s as Record<string, unknown>)['name'])
              .filter((n: unknown): n is string => typeof n === 'string')
          : [];
        
        const settings = {
          ...toSiteSettings(rawSettings),
          theme: buildThemeSettings(
            manifest,
            mergePreviewSettings(
              active.row?.['config'] as Record<string, unknown> | null,
              c.req.query('preview_settings'),
              allowedKeys
            ),
            parentManifests
          ),
        };

        return renderContentPage({
          resolution,
          contentRow,
          data: renderData,
          items,
          pagination,
          settings,
          themeData: themeDataWithPlugins,
          activeTheme,
          themesRoot,
          pluginAssets: pluginAssetTags,
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
