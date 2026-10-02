// @oktis-works/web - Runtime Rendering (catch-all SSR com hierarquia de templates)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getConnection } from '@oktis-works/database';
import { getHookRegistry } from '@oktis-works/plugin-runtime';
import { postTypeRegistry, HOOK_POINTS } from '@oktis-works/core';
import {
  TemplateHierarchyResolver,
  RuntimeRouter,
  type ContentLookup,
  type TemplateFileChecker,
  buildThemeStyles,
  getThemeScopeAttribute,
} from '@oktis-works/theme-runtime';

export function createTemplateChecker(themesRoot: string, activeTheme: string): TemplateFileChecker {
  return {
    exists(file: string): boolean {
      const candidates = [
        join(themesRoot, activeTheme, file),
        join(themesRoot, '_shared', file),
        join(themesRoot, 'default', file),
      ];
      return candidates.some((candidate) => existsSync(candidate));
    },
  };
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
