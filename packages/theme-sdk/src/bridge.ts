// @oktis-works/theme-sdk - Request-scoped host bridge

import type {
  ThemeContentQuery,
  ThemeContentRecord,
  ThemeContentResult,
  ThemeContentType,
  ThemeMenu,
  ThemeTaxonomy,
  ThemeTerm,
} from './contracts.js';
import type { FieldTypeCatalogEntry, FlexibleRow, ThemeField } from './contracts.js';

export const THEME_SDK_API_VERSION = 2 as const;

export type ThemeJsonPrimitive = string | number | boolean | null;
export type ThemeJsonValue =
  | ThemeJsonPrimitive
  | ThemeJsonValue[]
  | { [key: string]: ThemeJsonValue };

export type ThemeValue<T extends ThemeJsonValue = ThemeJsonValue> =
  | { kind: 'static'; value: T }
  | { kind: 'dynamic'; key: string; value?: T };

export interface ThemeSdkContext {
  apiVersion: typeof THEME_SDK_API_VERSION;
  cmsVersion: string;
  tenantId: string;
  locale: string;
  url: string;
  authenticated: boolean;
  roles: string[];
  route?: {
    templateKey: string;
    contentType?: string;
    slug?: string;
    canonicalPath?: string;
  };
}

export interface ThemeHookInput {
  name: string;
  value: ThemeJsonValue;
  args?: Record<string, ThemeJsonValue>;
}

export interface ThemeActionResult {
  ok: boolean;
  code?: string;
  value?: ThemeJsonValue;
}

export interface ThemePluginBlock {
  type: string;
  label: string;
  pluginName: string;
  attrsSchema?: Record<string, ThemeJsonValue>;
}

export interface ThemePluginPattern {
  name: string;
  label: string;
  pluginName: string;
  content: string;
}

export interface ThemePluginAsset {
  kind: 'style' | 'script';
  src: string;
  version?: string;
  placement?: 'head' | 'footer';
  strategy?: 'blocking' | 'defer' | 'async';
  media?: string;
  integrity?: string;
  crossOrigin?: string;
  pluginName: string;
}

export interface ThemeSdkBridge {
  readonly context: ThemeSdkContext;
  readonly content: {
    query(query?: ThemeContentQuery): Promise<ThemeContentResult>;
    byId(id: string): Promise<ThemeContentRecord | null>;
    bySlug(slug: string, type?: string): Promise<ThemeContentRecord | null>;
    type(slug: string): Promise<ThemeContentType | null>;
    types(): Promise<ThemeContentType[]>;
  };
  readonly menus: {
    get(slugOrName: string): Promise<ThemeMenu | null>;
    all(): Promise<ThemeMenu[]>;
  };
  readonly taxonomies: {
    get(slug: string): Promise<ThemeTaxonomy | null>;
    all(): Promise<ThemeTaxonomy[]>;
    terms(slug: string): Promise<ThemeTerm[]>;
  };
  readonly settings: {
    all(group?: string): Promise<Record<string, unknown>>;
    get<T = unknown>(key: string, fallback?: T, group?: string): Promise<T | undefined>;
  };
  readonly fields: {
    get(name: string, record?: ThemeContentRecord): unknown;
    all(record?: ThemeContentRecord): Record<string, unknown>;
    flexible(name: string, record?: ThemeContentRecord): FlexibleRow[];
    types(catalog?: FieldTypeCatalogEntry[]): FieldTypeCatalogEntry[];
    describe(name: string, record?: ThemeContentRecord): ThemeField | undefined;
  };
  readonly hooks: {
    apply(input: ThemeHookInput): Promise<ThemeJsonValue>;
  };
  readonly actions: {
    execute(name: string, input?: ThemeJsonValue): Promise<ThemeActionResult>;
  };
  readonly media: {
    publicUrl(path: string): string;
  };
  readonly navigation: {
    url(path: string): string;
    canonical(path?: string): string;
  };
  readonly plugins: {
    blocks(): ThemePluginBlock[];
    patterns(): ThemePluginPattern[];
    assets(): ThemePluginAsset[];
  };
}

/** Empty bridge used by validation and isolated artifact tests. */
export function createEmptyThemeSdkBridge(
  context: Partial<ThemeSdkContext> = {}
): ThemeSdkBridge {
  const emptyContent: ThemeContentResult = { data: [], total: 0, page: 1, limit: 20, pages: 0 };
  return {
    context: {
      apiVersion: THEME_SDK_API_VERSION,
      cmsVersion: context.cmsVersion ?? '0.0.0',
      tenantId: context.tenantId ?? '',
      locale: context.locale ?? 'en',
      url: context.url ?? '',
      authenticated: context.authenticated ?? false,
      roles: context.roles ?? [],
      ...(context.route ? { route: context.route } : {}),
    },
    content: {
      query: async () => emptyContent,
      byId: async () => null,
      bySlug: async () => null,
      type: async () => null,
      types: async () => [],
    },
    menus: { get: async () => null, all: async () => [] },
    taxonomies: { get: async () => null, all: async () => [], terms: async () => [] },
    settings: { all: async () => ({}), get: async (_key, fallback) => fallback },
    fields: {
      get: () => undefined,
      all: () => ({}),
      flexible: () => [],
      types: (catalog = []) => catalog,
      describe: () => undefined,
    },
    hooks: { apply: async ({ value }) => value },
    actions: { execute: async () => ({ ok: false, code: 'ACTION_UNAVAILABLE' }) },
    media: { publicUrl: (path) => path },
    navigation: { url: (path) => path, canonical: (path = '') => path },
    plugins: { blocks: () => [], patterns: () => [], assets: () => [] },
  };
}
