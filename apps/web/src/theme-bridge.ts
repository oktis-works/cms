// @oktis-works/web - Theme SDK bridge factory

import type {
  ThemeActionResult,
  ThemeContentRecord,
  ThemeJsonValue,
  ThemePluginAsset,
  ThemePluginBlock,
  ThemePluginPattern,
  ThemeSdkBridge,
  ThemeSdkContext,
} from '@oktis-works/theme-sdk';
import {
  THEME_SDK_API_VERSION,
} from '@oktis-works/theme-sdk';
import { canonicalFieldName, normalizeLogicalValues } from '@oktis-works/validation';
import type {
  ThemeContentQuery,
  ThemeDataProvider,
} from '@oktis-works/theme-sdk';
import { getHookRegistry } from '@oktis-works/plugin-runtime';

interface ThemeBridgeOptions {
  provider: ThemeDataProvider;
  context: Omit<ThemeSdkContext, 'apiVersion'>;
  blocks?: ThemePluginBlock[];
  patterns?: ThemePluginPattern[];
  assets?: ThemePluginAsset[];
  executeAction?: (name: string, input?: ThemeJsonValue) => Promise<ThemeActionResult>;
}

function asJsonValue(value: unknown): ThemeJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(asJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, asJsonValue(child)])
    );
  }
  return String(value);
}

function logicalRecord(record: ThemeContentRecord): Record<string, unknown> {
  return normalizeLogicalValues({
    body: record.body,
    data: record.data,
    native: record,
  });
}

function nestedValue(record: Record<string, unknown>, name: string): unknown {
  let current: unknown = record;
  for (const part of name.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolvePublicUrl(baseUrl: string, path: string): string {
  if (!path || typeof path !== 'string') return '';
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return '';
  }
}

export function createThemeSdkBridge(options: ThemeBridgeOptions): ThemeSdkBridge {
  const registry = getHookRegistry();
  const context: ThemeSdkContext = {
    apiVersion: THEME_SDK_API_VERSION,
    ...options.context,
  };

  return {
    context,
    content: {
      query: (query?: ThemeContentQuery) => options.provider.getContent(query),
      byId: (id: string) => options.provider.getContentById(id),
      bySlug: (slug: string, type?: string) => options.provider.getContentBySlug(slug, type),
      type: (slug: string) => options.provider.getContentType(slug),
      types: () => options.provider.getContentTypes(),
    },
    menus: {
      get: (slugOrName: string) => options.provider.getMenu(slugOrName),
      all: () => options.provider.getMenus(),
    },
    taxonomies: {
      get: (slug: string) => options.provider.getTaxonomy(slug),
      all: () => options.provider.getTaxonomies(),
      terms: (slug: string) => options.provider.getTaxonomyTerms(slug),
    },
    settings: {
      all: (group?: string) => options.provider.getSettings(group),
      async get<T = unknown>(key: string, fallback?: T, group?: string): Promise<T | undefined> {
        const values = await options.provider.getSettings(group);
        return (values[key] as T | undefined) ?? fallback;
      },
    },
    fields: {
      get: (name: string, record?: ThemeContentRecord) => {
        if (!record) return undefined;
        return nestedValue(logicalRecord(record), canonicalFieldName(name));
      },
      all: (record?: ThemeContentRecord) => record ? logicalRecord(record) : {},
      flexible: (name: string, record?: ThemeContentRecord) => {
        const value = record ? nestedValue(logicalRecord(record), canonicalFieldName(name)) : undefined;
        if (!Array.isArray(value)) return [];
        return value.filter((row): row is { layout: string; data: Record<string, unknown> } =>
          Boolean(row && typeof row === 'object' && typeof (row as Record<string, unknown>)['layout'] === 'string')
        );
      },
      types: (catalog = []) => catalog,
      describe: () => undefined,
    },
    hooks: {
      async apply(input) {
        const result = await registry.applyFiltersAsync(
          input.name,
          input.value,
          input.args ?? {},
          { tenantId: context.tenantId, theme: true }
        );
        return asJsonValue(result);
      },
    },
    actions: {
      execute: options.executeAction ?? (async () => ({ ok: false, code: 'ACTION_UNAVAILABLE' })),
    },
    media: {
      publicUrl: (path) => resolvePublicUrl(context.url, path),
    },
    navigation: {
      url: (path) => resolvePublicUrl(context.url, path),
      canonical: (path = context.route?.canonicalPath ?? new URL(context.url).pathname) =>
        resolvePublicUrl(context.url, path),
    },
    plugins: {
      blocks: () => (options.blocks ?? []).map((block) => ({
        ...block,
        ...(block.attrsSchema ? { attrsSchema: asJsonValue(block.attrsSchema) as Record<string, ThemeJsonValue> } : {}),
      })),
      patterns: () => [...(options.patterns ?? [])],
      assets: () => [...(options.assets ?? [])],
    },
  };
}
