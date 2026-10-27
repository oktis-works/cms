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
import { getConnection, createConnection, runWithTenantTransaction } from '@oktis-works/database';
import { loadConfig } from '@oktis-works/config';
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
import { buildItemUrl } from './url-helpers.js';
import { buildJsonLd } from './jsonld.js';
import { generateFeeds } from './rss.js';
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

/** XML escape for sitemap URLs. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

/** Build parent chain slugs from parent_id (root to immediate parent). */
async function buildParentChain(
  sql: ReturnType<typeof getConnection>,
  tenantId: string,
  parentId: string | null
): Promise<string[]> {
  const chain: string[] = [];
  let currentId: string | null = parentId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const rows = await sql.unsafe('SELECT id, slug, parent_id FROM content WHERE id = $1 AND tenant_id = $2', [currentId, tenantId]);
    const row = rows[0] as { id: string; slug: string; parent_id: string | null } | undefined;
    if (!row) break;
    chain.unshift(row.slug);
    currentId = row.parent_id ?? null;
  }
  return chain;
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

  // Garante que a conexão com o banco esteja inicializada neste processo.
  // Quando o web é instalado via npm/bunx (não workspace), pode haver uma
  // cópia aninhada de @oktis-works/database diferente da que o core usou
  // para criar a conexão via bootstrap(). Se getConnection() lançar,
  // inicializamos nossa própria conexão a partir da config do projeto.
  try {
    getConnection();
  } catch {
    const config = loadConfig();
    createConnection(config.database);
  }

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

  // RSS/Atom feeds — GET /{hubBase}/feed
  // Derivado da hub page: lista itens do tipo do hub, ordenados por published_at DESC
  app.get('/:hubBase/feed', async (c) => {
    try {
      const hubBase = c.req.param('hubBase');
      const sql = getConnection();
      const tenantId = String(c.get('tenant')['id']);

      // Find hub page and its type
      const hubPage = await sql`
        SELECT id, slug, title, metadata->>'hub_type' as hub_type, excerpt
        FROM content
        WHERE type = 'page'
          AND slug = ${hubBase}
          AND status = 'PUBLISHED'
          AND metadata ? 'hub_type'
          AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `;

      if (hubPage.length === 0) {
        return c.notFound();
      }

      const hubPageRow = hubPage[0] as Record<string, unknown>;
      const hubType = hubPageRow['hub_type'] as string;
      const hubTitle = hubPageRow['title'] as string;
      const hubDescription = (hubPageRow['excerpt'] as string | undefined) ?? undefined;

      // Fetch published items of this type
      const itemRows = await sql`
        SELECT id, type, slug, title, excerpt, published_at, updated_at
        FROM content
        WHERE type = ${hubType}
          AND status = 'PUBLISHED'
          AND tenant_id = ${tenantId}::uuid
        ORDER BY published_at DESC NULLS LAST, updated_at DESC
        LIMIT 50
      `;

      const siteUrl = (await sql`
        SELECT value FROM settings WHERE key = 'siteUrl'
        AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid)
        ORDER BY tenant_id NULLS LAST LIMIT 1
      `).map((r: any) => r.value)[0] ?? '';

      const { rss, atom } = generateFeeds({
        hubBase,
        hubTitle,
        hubDescription,
        siteName: (await sql`SELECT value FROM settings WHERE key = 'siteTitle' AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid) ORDER BY tenant_id NULLS LAST LIMIT 1`).map((r: any) => r.value)[0] ?? 'OkCMS',
        siteUrl,
        contentType: hubType,
        items: itemRows as any[],
        feedUrl: `/${hubBase}/feed`,
      });

      const format = c.req.query('format');
      if (format === 'atom') {
        return c.text(atom, 200, { 'Content-Type': 'application/atom+xml' });
      }
      return c.text(rss, 200, { 'Content-Type': 'application/rss+xml' });
    } catch (error) {
      console.error('[web] Feed generation failed:', error);
      return c.text('Feed unavailable', 500);
    }
  });

  // Sitemap — GET /sitemap.xml
  // Lista hubs (/{base}/) + itens publicados com paths canônicos completos.
  // Exclui fontes de redirect (source_path de url_redirects).
  // Paginação (?page=N) → canonical self (não gera URLs separadas).
  app.get('/sitemap.xml', async (c) => {
    try {
      const sql = getConnection();
      const tenantId = String(c.get('tenant')['id']);
      const siteUrl = (await sql`SELECT value FROM settings WHERE key = 'siteUrl' AND (tenant_id IS NULL OR tenant_id = ${tenantId}::uuid) ORDER BY tenant_id NULLS LAST LIMIT 1`)
        .map((r: any) => r.value)[0] ?? '';

      if (!siteUrl) {
        return c.text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 200, { 'Content-Type': 'application/xml' });
      }

      // 1) Hub pages (metadata.hub_type)
      const hubRows = await sql`
        SELECT slug FROM content
        WHERE type = 'page'
          AND status = 'PUBLISHED'
          AND metadata ? 'hub_type'
          AND tenant_id = ${tenantId}::uuid
      `;

      // 2) Published items (excluindo páginas que são hubs)
      const hubSlugs = hubRows.map((r: any) => r.slug);
      const hubSlugCondition = hubSlugs.length > 0 ? `AND slug NOT IN (${hubSlugs.map(() => '?').join(',')})` : '';

      const itemRows = await sql.unsafe(
        `SELECT id, type, slug, published_at, updated_at, parent_id
         FROM content
         WHERE status = 'PUBLISHED'
           AND tenant_id = $1
           AND type != 'page'
           ${hubSlugCondition}
         ORDER BY published_at DESC NULLS LAST, updated_at DESC`,
        [tenantId, ...hubSlugs]
      );

      // 3) Redirect sources to exclude
      const redirectRows = await sql`
        SELECT source_path FROM url_redirects
        WHERE tenant_id = ${tenantId}::uuid
      `;
      const redirectSources = new Set(redirectRows.map((r: any) => r.source_path));

      // Build XML
      const urls: string[] = [];
      const now = new Date().toISOString().split('T')[0];

      // Hub pages (listings)
      for (const row of hubRows as Array<Record<string, unknown>>) {
        const slug = row['slug'] as string;
        const path = `/${slug}/`;
        if (!redirectSources.has(path.replace(/^\//, ''))) {
          urls.push(`  <url>\n    <loc>${escapeXml(siteUrl + path)}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`);
        }
      }

      // Items
      for (const row of itemRows as Array<Record<string, unknown>>) {
        const hubType = row['type'] as string;
        // Find hub base for this type
        const hubRow = await sql`
          SELECT slug FROM content
          WHERE type = 'page'
            AND metadata->>'hub_type' = ${hubType}
            AND status = 'PUBLISHED'
            AND tenant_id = ${tenantId}::uuid
          LIMIT 1
        `;
        const hubBase = (hubRow[0] as Record<string, unknown> | undefined)?.['slug'] as string | undefined;
        if (!hubBase) continue;

        // Build parent chain for canonical path
        const parentId = row['parent_id'] as string | null;
        const parentChain = await buildParentChain(sql, tenantId, parentId);
        const itemSlug = row['slug'] as string;
        const itemPath = parentChain.length > 0 ? [...parentChain, itemSlug].join('/') : itemSlug;
        const path = `/${hubBase}/${itemPath}`;

        if (!redirectSources.has(path.replace(/^\//, ''))) {
          const lastmod = (row['published_at'] ?? row['updated_at']) as string | null;
          urls.push(`  <url>\n    <loc>${escapeXml(siteUrl + path)}</loc>\n    <lastmod>${lastmod ? new Date(lastmod).toISOString().split('T')[0] : now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
      return c.text(xml, 200, { 'Content-Type': 'application/xml' });
    } catch (error) {
      console.error('[web] Sitemap generation failed:', error);
      return c.text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', 500, { 'Content-Type': 'application/xml' });
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

      // 301 redirect for canonical URLs (legacy formats, old bases, etc.)
      if (resolution.redirectTo) {
        return c.redirect(resolution.redirectTo, 301);
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

      // Build item URLs for listings (canonical paths with hub base + parent chain)
      const hubBase = resolution.hubBase ?? '';
      if (hubBase && items.length > 0) {
        // We need parent chains for items. For now, add basic URL without parent chain.
        // TODO: Batch fetch parent chains for all items in listing.
        for (const item of items) {
          item['url'] = buildItemUrl(item as any, hubBase);
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

        // Build JSON-LD for single content pages (not listings)
        let jsonLd: Record<string, unknown>[] | undefined;
        if (resolution.slug && resolution.contentType && resolution.canonicalPath) {
          const siteUrl = (settings['siteUrl'] as string) || '';
          const canonicalUrl = resolution.canonicalPath && siteUrl ? new URL(resolution.canonicalPath, siteUrl).toString() : '';
          
          if (canonicalUrl) {
            // Build parent chain for breadcrumbs
            let parentChain: string[] = [];
            if (contentRow && (contentRow as any).parent_id) {
              parentChain = await buildParentChain(getConnection(), tenantId, (contentRow as any).parent_id);
            }

            jsonLd = buildJsonLd({
              canonicalUrl,
              siteName: settings.siteTitle,
              siteUrl,
              hubBase: resolution.hubBase ?? undefined,
              itemPath: resolution.itemPath ?? undefined,
              parentChain,
              title: (contentRow?.['title'] as string) ?? '',
              description: (contentRow?.['seo_description'] as string) ?? (contentRow?.['excerpt'] as string) ?? settings.siteDescription,
              datePublished: (contentRow?.['published_at'] as string) ?? undefined,
              dateModified: (contentRow?.['updated_at'] as string) ?? undefined,
              authorName: (contentRow?.['author'] as any)?.name ?? undefined,
              imageUrl: (contentRow?.['featured_image'] as any)?.url ?? undefined,
              contentType: resolution.contentType,
            });
          }
        }

        return renderContentPage({
          resolution,
          contentRow,
          data: { ...renderData, jsonLd },
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
