// @oktis-works/web - Runtime Rendering (catch-all SSR com hierarquia de templates)
import { existsSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getConnection } from '@oktis-works/database';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { postTypeRegistry, HOOK_POINTS } from '@oktis-works/core';
import { TemplateHierarchyResolver, RuntimeRouter, ThemeRenderer, createProjectTemplateResolver, } from '@oktis-works/theme-runtime';
import { CMS_VERSION } from '@oktis-works/validation';
/**
 * B1/Unificação (FEAT-095): a cadeia de templates do projeto
 * (tema ativo → `_shared` → `default`), o saneamento dos nomes de tema e o
 * guard contra traversal vivem **apenas** no `@oktis-works/theme-runtime` —
 * este app só consome a fonte única, sem reimplementação local.
 */
function projectTemplates(themesRoot, activeTheme) {
    return createProjectTemplateResolver(themesRoot, activeTheme);
}
/** Adaptador do checker do TemplateHierarchyResolver sobre o resolver único. */
export function createTemplateChecker(themesRoot, activeTheme) {
    const resolver = projectTemplates(themesRoot, activeTheme);
    return {
        exists(file) {
            return resolver.exists(file);
        },
    };
}
/**
 * B1 — carrega o ARQUIVO do template do tema ativo (fallback _shared → default).
 * Retorna null quando nenhum candidato existe (rota cai no 404 do tema).
 */
export function loadTemplateSource(themesRoot, activeTheme, file) {
    return projectTemplates(themesRoot, activeTheme).read(file);
}
export function toSiteSettings(raw) {
    return {
        siteTitle: toText(raw['siteTitle']) || 'OkCMS',
        siteDescription: toText(raw['siteDescription']) || '',
        language: toText(raw['language']) || 'pt-BR',
    };
}
function toText(value) {
    if (value == null)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return '';
}
export const themeRenderer = new ThemeRenderer();
/**
 * Configurações do tema para os templates: defaults declarados em
 * `manifest.settings` sobrescritos pelo `config` salvo na tela Temas do
 * admin (exposto como `settings.theme` no contexto do template).
 */
export function buildThemeSettings(manifest, config) {
    const settings = {};
    const declared = Array.isArray(manifest?.['settings']) ? manifest['settings'] : [];
    for (const field of declared) {
        if (!field || typeof field !== 'object')
            continue;
        const record = field;
        const name = record['name'];
        if (typeof name === 'string' && name) {
            settings[name] = record['default'];
        }
    }
    if (config && typeof config === 'object' && !Array.isArray(config)) {
        for (const [key, value] of Object.entries(config)) {
            settings[key] = value;
        }
    }
    return settings;
}
/**
 * B1 — render real: injeta `content.body`/campos no template do tema.
 * Contexto exposto ao template:
 *   site.title / site.description      — settings (siteTitle/siteDescription)
 *   content.*                          — colunas da row + campos do body
 *   page.title / page.description      — título da página (SEO) e meta description
 *   settings                           — settings cruas (avançado)
 */
export function renderContentPage(input) {
    const file = input.resolution.template ?? 'index.astro';
    const template = loadTemplateSource(input.themesRoot, input.activeTheme, file);
    if (!template) {
        return renderFallbackPage(input);
    }
    const row = input.contentRow ?? {};
    const title = toText(row['title']) || input.settings.siteTitle;
    const context = {
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
    const stylesheet = resolveThemeStylesheet(input.themesRoot, input.activeTheme);
    return wrapDocument(body, title, input.settings, input.activeTheme, stylesheet);
}
/**
 * Primeiro fornecedor real de `dist/theme.css` na cadeia (tema ativo →
 * _shared → default). `null` quando ninguém compilou estilos — o documento
 * sai sem <link> quebrado (nada de 404 silencioso no console).
 */
export function resolveThemeStylesheet(themesRoot, activeTheme) {
    for (const theme of [activeTheme, '_shared', 'default']) {
        if (!theme)
            continue;
        if (existsSync(join(themesRoot, theme, 'dist', 'theme.css')))
            return theme;
    }
    return null;
}
/**
 * B1 — envolve o fragmento do template num documento completo com title/meta
 * das settings + CSS do tema + injeções de plugins via hook `theme:head`.
 * Template que já emite documento completo passa intocado (temas headless/full-control).
 */
export function wrapDocument(body, pageTitle, settings, activeTheme, stylesheetTheme = null) {
    if (body.includes('<html') || body.includes('<!DOCTYPE')) {
        return body;
    }
    const title = pageTitle && pageTitle !== settings.siteTitle ? `${pageTitle} | ${settings.siteTitle}` : settings.siteTitle;
    const lang = escapeHtml(settings.language || 'pt-BR');
    const stylesheet = stylesheetTheme
        ? `  <link rel="stylesheet" href="/themes/${escapeHtml(stylesheetTheme)}/dist/theme.css" data-theme-style="${escapeHtml(stylesheetTheme)}" />\n`
        : '';
    // WP6: ponto de extensão theme:head — plugins injetam tags no <head>
    const registry = getHookRegistry();
    const headInjections = registry.applyFilters(HOOK_POINTS.THEME_HEAD, '', { settings, activeTheme });
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="OkCMS ${CMS_VERSION}">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(settings.siteDescription)}">
${stylesheet}${headInjections}</head>
<body>
${body}
</body>
</html>`;
}
/** Colunas da row sem `body` (o body já foi mesclado como campos). */
function plainColumns(row) {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        if (key === 'body')
            continue;
        out[key] = value;
    }
    return out;
}
/** Tema sem template para a rota: HTML mínimo com os dados reais (nunca stub). */
function renderFallbackPage(input) {
    const title = toText((input.contentRow ?? {})['title']) || input.settings.siteTitle;
    const lang = escapeHtml(input.settings.language || 'pt-BR');
    // WP6: ponto de extensão theme:head — plugins injetam tags no <head>
    const registry = getHookRegistry();
    const headInjections = registry.applyFilters(HOOK_POINTS.THEME_HEAD, '', { settings: input.settings, activeTheme: input.activeTheme });
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | ${escapeHtml(input.settings.siteTitle)}</title>
  <meta name="description" content="${escapeHtml(input.settings.siteDescription)}">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: #111; }
    main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem; }
    .fallback__hint { color: #555; line-height: 1.5; }
    details { margin-top: 2rem; }
    summary { cursor: pointer; color: #555; }
    pre { background: #f5f5f5; border: 1px solid #e3e3e3; border-radius: 6px; padding: 1rem; overflow: auto; font-size: 0.85rem; }
  </style>
${headInjections}</head>
<body>
  <main data-theme="${escapeHtml(input.activeTheme)}">
    <article>
      <h1>${escapeHtml(title)}</h1>
      <p class="fallback__hint">Este tema não possui template para esta rota — os dados reais do conteúdo estão abaixo.</p>
      <details>
        <summary>Dados (JSON)</summary>
        <pre>${escapeHtml(JSON.stringify(input.data, null, 2))}</pre>
      </details>
    </article>
  </main>
</body>
</html>`;
}
export function escapeHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/**
 * B2 — resolução segura de asset do tema: `/themes/<tema>/<path>`.
 * Traversal guard: o caminho resolvido PRECISA continuar dentro do diretório
 * do tema (nega `..`, symlinks fora da raiz e paths absolutos).
 */
export function resolveThemeAssetPath(themesRoot, themeName, assetPath) {
    if (!themeName || !/^[A-Za-z0-9_-]+$/.test(themeName))
        return null;
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
        if (realTarget !== themeRoot && !realTarget.startsWith(themeRoot + sep))
            return null;
        return realTarget;
    }
    catch {
        return null;
    }
}
const CONTENT_TYPE_BY_EXT = {
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
export function contentTypeForAsset(assetPath) {
    const dot = assetPath.lastIndexOf('.');
    const ext = dot === -1 ? '' : assetPath.slice(dot).toLowerCase();
    return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_KEY_RE = /media|image|thumb|cover|gallery/i;
function collectMediaIds(value, out, depth = 0) {
    if (depth > 6 || value == null)
        return;
    if (typeof value === 'string') {
        if (UUID_RE.test(value))
            out.add(value);
    }
    else if (Array.isArray(value)) {
        for (const item of value)
            collectMediaIds(item, out, depth + 1);
    }
    else if (typeof value === 'object') {
        for (const child of Object.values(value)) {
            collectMediaIds(child, out, depth + 1);
        }
    }
}
/** Constrói o rewriter que troca UUIDs por objetos de mídia real (REQU-028-001). */
function buildMediaReplacer(byId) {
    return function replace(value, keyHint, depth) {
        if (value == null || depth > 6)
            return value;
        if (typeof value === 'string') {
            const hit = byId.get(value);
            return hit && keyHint !== undefined && MEDIA_KEY_RE.test(keyHint) ? hit : value;
        }
        if (Array.isArray(value))
            return value.map((item) => replace(item, keyHint, depth + 1));
        if (typeof value === 'object') {
            const out = {};
            for (const [key, child] of Object.entries(value)) {
                out[key] = replace(child, key, depth + 1);
            }
            return out;
        }
        return value;
    };
}
/** Uma única query de mídia para N payloads — sem N+1. */
async function fetchMediaById(sql, ids) {
    if (ids.size === 0)
        return new Map();
    const rows = await sql.unsafe(`SELECT id, url, alt, filename FROM media WHERE id = ANY($1::uuid[])`, [[...ids]]);
    return new Map(rows.map((r) => [String(r['id']), { id: String(r['id']), url: String(r['url']), alt: r['alt'] ?? null, filename: r['filename'] ?? null }]));
}
/**
 * REQU-028-001: substitui referências de mídia por objetos {id,url,alt} reais.
 * Uma única query batched — sem N+1.
 */
async function enrichMedia(sql, data) {
    const ids = new Set();
    collectMediaIds(data, ids);
    const byId = await fetchMediaById(sql, ids);
    if (byId.size === 0)
        return;
    const replace = buildMediaReplacer(byId);
    for (const key of Object.keys(data)) {
        data[key] = replace(data[key], key, 0);
    }
}
/**
 * REQU-028-001 (listas): o mesmo enriquecimento para os itens de archive/home,
 * com UMA query de mídia para todos os itens do lote.
 */
export async function enrichItemsMedia(sql, items) {
    if (items.length === 0)
        return;
    const ids = new Set();
    for (const item of items)
        collectMediaIds(item, ids);
    const byId = await fetchMediaById(sql, ids);
    if (byId.size === 0)
        return;
    const replace = buildMediaReplacer(byId);
    for (const item of items) {
        for (const key of Object.keys(item)) {
            item[key] = replace(item[key], key, 0);
        }
    }
}
/** REQU-028-003: injeta _terms agrupado por taxonomia no payload. */
async function attachTerms(sql, contentId, data) {
    const rows = await sql.unsafe(`
    SELECT tx.slug AS taxonomy_slug, t.slug AS term_slug, t.name AS term_name
    FROM content_taxonomy_terms ctt
    JOIN taxonomy_terms t ON t.id = ctt.term_id
    JOIN taxonomies tx ON tx.id = t.taxonomy_id
    WHERE ctt.content_id = $1
    ORDER BY tx.slug ASC, t.name ASC
  `, [contentId]);
    if (rows.length === 0)
        return;
    const grouped = {};
    for (const row of rows) {
        (grouped[row.taxonomy_slug] ??= []).push({ slug: row.term_slug, name: row.term_name });
    }
    data['_terms'] = grouped;
}
export function createContentLookup() {
    return {
        async findByPath(path) {
            const sql = getConnection();
            const result = await sql.unsafe("SELECT * FROM content WHERE slug = $1 AND status = 'PUBLISHED' LIMIT 1", [path]);
            const row = result[0];
            if (!row)
                return null;
            const data = (row['body'] ?? {});
            // Enriquecimento em lote: mídia real e termos agregados
            try {
                await enrichMedia(sql, data);
                await attachTerms(sql, String(row['id']), data);
            }
            catch {
                // falha de enriquecimento nunca derruba a renderização
            }
            return {
                type: String(row['type']),
                slug: String(row['slug']),
                data,
                layout: row['layout'] ?? null,
                record: row,
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
export function createRouter(themesRoot, activeTheme) {
    const resolver = new TemplateHierarchyResolver(createTemplateChecker(themesRoot, activeTheme));
    return new RuntimeRouter(createContentLookup(), resolver);
}
/**
 * Registra o hook registry no Theme SDK para habilitar os filtros theme:data:*.
 * Awaited no boot do web — fire-and-forget deixava a janela inicial sem hooks.
 */
export async function wireThemeHooks() {
    const sdk = await import('@oktis-works/theme-sdk');
    sdk.setThemeHooks(getHookRegistry());
    // Ponto de extensão head: plugins podem injetar tags no <head> do site público.
    void HOOK_POINTS;
}
//# sourceMappingURL=rendering.js.map