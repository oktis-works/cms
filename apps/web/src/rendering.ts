// @oktis-works/web - Runtime Rendering (catch-all SSR com hierarquia de templates)

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getConnection } from '@oktis-works/database';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { postTypeRegistry, HOOK_POINTS } from '@oktis-works/core';
import {
  TemplateHierarchyResolver,
  RuntimeRouter,
  ThemeRenderer,
  type ContentLookup,
  type TemplateFileChecker,
  buildThemeStyles,
  getThemeScopeAttribute,
} from '@oktis-works/theme-runtime';
import type { ThemeRenderData } from '@oktis-works/theme-sdk';

export function createTemplateChecker(themesRoot: string, activeTheme: string): TemplateFileChecker {
  return {
    exists(file: string): boolean {
      return templateCandidates(themesRoot, activeTheme, file).some((candidate) => existsSync(candidate));
    },
  };
}

/** Cadeia de busca do arquivo de template: tema ativo → _shared → default. */
function templateCandidates(themesRoot: string, activeTheme: string, file: string): string[] {
  return [
    join(themesRoot, activeTheme, file),
    join(themesRoot, '_shared', file),
    join(themesRoot, 'default', file),
  ];
}

/**
 * B1 — carrega o ARQUIVO do template do tema ativo (fallback _shared → default).
 * Retorna null quando nenhum candidato existe (rota cai no 404 do tema).
 */
export function loadTemplateSource(themesRoot: string, activeTheme: string, file: string): string | null {
  for (const candidate of templateCandidates(themesRoot, activeTheme, file)) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf-8');
    }
  }
  return null;
}

export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  [key: string]: unknown;
}

/**
 * B1 — título/descrição do site vêm das settings (fim do "OkCMS" hardcoded).
 * Falha de leitura nunca derruba o render (fallbacks locais).
 */
export async function fetchSiteSettings(sql: ReturnType<typeof getConnection>): Promise<SiteSettings> {
  try {
    const rows = await sql.unsafe(
      "SELECT key, value FROM settings WHERE key IN ('siteTitle', 'siteDescription')"
    );
    const byKey = new Map(
      (rows as unknown as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value])
    );
    return {
      siteTitle: toText(byKey.get('siteTitle')) || 'OkCMS',
      siteDescription: toText(byKey.get('siteDescription')) || '',
    };
  } catch {
    return { siteTitle: 'OkCMS', siteDescription: '' };
  }
}

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export const themeRenderer = new ThemeRenderer();

export interface ContentPageRenderInput {
  resolution: { template?: string; contentType?: string; slug?: string; matched: boolean };
  contentRow?: Record<string, unknown> | null;
  data: Record<string, unknown>;
  /** Itens de archive/home (conteúdo publicado recente do tipo). */
  items?: Array<Record<string, unknown>>;
  settings: SiteSettings;
  themeData?: ThemeRenderData;
  activeTheme: string;
  themesRoot: string;
}

/**
 * B1 — render real: injeta `content.body`/campos no template do tema.
 * Contexto exposto ao template:
 *   site.title / site.description      — settings (siteTitle/siteDescription)
 *   content.*                          — colunas da row + campos do body
 *   page.title / page.description      — título da página (SEO) e meta description
 *   settings                           — settings cruas (avançado)
 */
export function renderContentPage(input: ContentPageRenderInput): string {
  const file = input.resolution.template ?? 'index.astro';
  const template = loadTemplateSource(input.themesRoot, input.activeTheme, file);

  if (!template) {
    return renderFallbackPage(input);
  }

  const row = input.contentRow ?? {};
  const title = toText(row['title']) || input.settings.siteTitle;
  const context: Record<string, unknown> = {
    site: {
      title: input.settings.siteTitle,
      description: input.settings.siteDescription,
      theme: input.activeTheme,
    },
    page: {
      title,
      description: input.settings.siteDescription,
      template: input.resolution.template ?? '',
      type: input.resolution.contentType ?? '',
      slug: input.resolution.slug ?? '',
    },
    content: { ...input.data, ...plainColumns(row) },
    fields: input.data,
    items: input.items ?? [],
    menus: input.themeData?.menus ?? { all: [], bySlug: {} },
    contentTypes: input.themeData?.contentTypes ?? [],
    taxonomies: input.themeData?.taxonomies ?? [],
    terms: input.themeData?.terms ?? {},
    settings: { ...(input.themeData?.settings ?? {}), ...input.settings },
    themeData: input.themeData ?? { menus: { all: [], bySlug: {} }, contentTypes: [], taxonomies: [], terms: {}, settings: input.settings },
  };

  const body = themeRenderer.renderString(template, context, row);
  return wrapDocument(body, title, input.settings, input.activeTheme);
}

/**
 * B1 — envolve o fragmento do template num documento completo com title/meta
 * das settings + CSS do tema. Template que já emite documento completo passa
 * intocado (temas headless/full-control).
 */
export function wrapDocument(
  body: string,
  pageTitle: string,
  settings: SiteSettings,
  activeTheme: string
): string {
  if (body.includes('<html') || body.includes('<!DOCTYPE')) {
    return body;
  }

  const title = pageTitle && pageTitle !== settings.siteTitle ? `${pageTitle} | ${settings.siteTitle}` : settings.siteTitle;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(settings.siteDescription)}">
  <link rel="stylesheet" href="/themes/${escapeHtml(activeTheme)}/dist/theme.css" data-theme-style="${escapeHtml(activeTheme)}" />
</head>
<body>
${body}
</body>
</html>`;
}

/** Colunas da row sem `body` (o body já foi mesclado como campos). */
function plainColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'body') continue;
    out[key] = value;
  }
  return out;
}

/** Tema sem template para a rota: HTML mínimo com os dados reais (nunca stub). */
function renderFallbackPage(input: ContentPageRenderInput): string {
  const title = toText((input.contentRow ?? {})['title']) || input.settings.siteTitle;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | ${escapeHtml(input.settings.siteTitle)}</title>
  <meta name="description" content="${escapeHtml(input.settings.siteDescription)}">
</head>
<body>
  <main data-theme="${escapeHtml(input.activeTheme)}">
    <article>
      <h1>${escapeHtml(title)}</h1>
      <div class="entry__body">${escapeHtml(JSON.stringify(input.data))}</div>
    </article>
  </main>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * B2 — resolução segura de asset do tema: `/themes/<tema>/<path>`.
 * Traversal guard: o caminho resolvido PRECISA continuar dentro do diretório
 * do tema (nega `..`, symlinks fora da raiz e paths absolutos).
 */
export function resolveThemeAssetPath(themesRoot: string, themeName: string, assetPath: string): string | null {
  if (!themeName || !/^[A-Za-z0-9_-]+$/.test(themeName)) return null;

  const lexicalThemeRoot = resolve(themesRoot, themeName);
  const target = resolve(lexicalThemeRoot, assetPath);

  // resolve() já normalizou `..` — basta garantir que segue dentro do tema.
  if (target !== lexicalThemeRoot && !target.startsWith(lexicalThemeRoot + sep)) {
    return null;
  }

  // resolve() não detecta symlink apontando para fora da raiz. Só devolve o
  // caminho real quando o arquivo existe e continua dentro do tema.
  try {
    const themeRoot = realpathSync(lexicalThemeRoot);
    const realTarget = realpathSync(target);
    if (realTarget !== themeRoot && !realTarget.startsWith(themeRoot + sep)) return null;
    return realTarget;
  } catch {
    return null;
  }
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeForAsset(assetPath: string): string {
  const dot = assetPath.lastIndexOf('.');
  const ext = dot === -1 ? '' : assetPath.slice(dot).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_KEY_RE = /media|image|thumb|cover|gallery/i;

function collectMediaIds(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || value == null) return;
  if (typeof value === 'string') {
    if (UUID_RE.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectMediaIds(item, out, depth + 1);
  } else if (typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      collectMediaIds(child, out, depth + 1);
    }
  }
}

/**
 * REQU-028-001: substitui referências de mídia por objetos {id,url,alt} reais.
 * Uma única query batched — sem N+1.
 */
async function enrichMedia(sql: ReturnType<typeof getConnection>, data: Record<string, unknown>): Promise<void> {
  const ids = new Set<string>();
  collectMediaIds(data, ids);
  if (ids.size === 0) return;

  const idList = [...ids];
  const rows = await sql.unsafe(
    `SELECT id, url, alt, filename FROM media WHERE id = ANY($1::uuid[])`,
    [idList]
  );
  const byId = new Map(
    (rows as Array<Record<string, unknown>>).map((r) => [String(r['id']), { id: String(r['id']), url: String(r['url']), alt: r['alt'] ?? null, filename: r['filename'] ?? null }])
  );
  if (byId.size === 0) return;

  const replace = (value: unknown, keyHint: string | undefined, depth: number): unknown => {
    if (value == null || depth > 6) return value;
    if (typeof value === 'string') {
      const hit = byId.get(value);
      return hit && keyHint !== undefined && MEDIA_KEY_RE.test(keyHint) ? hit : value;
    }
    if (Array.isArray(value)) return value.map((item) => replace(item, keyHint, depth + 1));
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        out[key] = replace(child, key, depth + 1);
      }
      return out;
    }
    return value;
  };

  for (const key of Object.keys(data)) {
    data[key] = replace(data[key], key, 0);
  }
}

interface TermRow {
  taxonomy_slug: string;
  term_slug: string;
  term_name: string;
}

/** REQU-028-003: injeta _terms agrupado por taxonomia no payload. */
async function attachTerms(sql: ReturnType<typeof getConnection>, contentId: string, data: Record<string, unknown>): Promise<void> {
  const rows = await sql.unsafe<TermRow[]>(`
    SELECT tx.slug AS taxonomy_slug, t.slug AS term_slug, t.name AS term_name
    FROM content_taxonomy_terms ctt
    JOIN taxonomy_terms t ON t.id = ctt.term_id
    JOIN taxonomies tx ON tx.id = t.taxonomy_id
    WHERE ctt.content_id = $1
    ORDER BY tx.slug ASC, t.name ASC
  `, [contentId]);

  if ((rows as unknown[]).length === 0) return;
  const grouped: Record<string, Array<{ slug: string; name: string }>> = {};
  for (const row of rows as unknown as TermRow[]) {
    (grouped[row.taxonomy_slug] ??= []).push({ slug: row.term_slug, name: row.term_name });
  }
  data['_terms'] = grouped;
}

export function createContentLookup(): ContentLookup {
  return {
    async findByPath(path) {
      const sql = getConnection();
      const result = await sql.unsafe(
        "SELECT * FROM content WHERE slug = $1 AND status = 'PUBLISHED' LIMIT 1",
        [path]
      );

      const row = result[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      const data = ((row['body'] as Record<string, unknown>) ?? {}) as Record<string, unknown>;

      // Enriquecimento em lote: mídia real e termos agregados
      try {
        await enrichMedia(sql, data);
        await attachTerms(sql, String(row['id']), data);
      } catch {
        // falha de enriquecimento nunca derruba a renderização
      }

      return {
        type: String(row['type']),
        slug: String(row['slug']),
        data,
        layout: (row['layout'] as string | null | undefined) ?? null,
      };
    },

    async listTypes() {
      const types = await postTypeRegistry.list();
      return types
        .filter((type) => type.public !== false)
        .map((type) => ({ slug: type.slug, hasArchive: Boolean(type.hasArchive) }));
    },
  };
}

export function createRouter(themesRoot: string, activeTheme: string): RuntimeRouter {
  const resolver = new TemplateHierarchyResolver(createTemplateChecker(themesRoot, activeTheme));
  return new RuntimeRouter(createContentLookup(), resolver);
}

/** Helper para web: obtém atributo de isolamento para template */
export function getScopedContainer(themeName: string): string {
  const { attr } = getThemeScopeAttribute(themeName);
  return attr;
}

/** Build pipeline do tema: compila SCSS ou Tailwind e retorna relatório */
export async function buildTheme(themeRoot: string, themeName: string, manifest: import('@oktis-works/theme-sdk').ThemeManifest) {
  return buildThemeStyles({ themesRoot: themeRoot, themeName, manifest });
}

/**
 * Registra o hook registry no Theme SDK para habilitar os filtros theme:data:*.
 */
export function wireThemeHooks(): void {
  void import('@oktis-works/theme-sdk').then((sdk) => {
    sdk.setThemeHooks(getHookRegistry());
  });

  // Ponto de extensão head: plugins podem injetar tags no <head> do site público.
  void HOOK_POINTS;
}
