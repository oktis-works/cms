import type {
  ThemeManifest as CanonicalThemeManifest,
  ThemeRenderConfig as CanonicalThemeRenderConfig,
  ThemeRenderEngine as CanonicalThemeRenderEngine,
} from '@oktis-works/types';
import type { ThemeRenderData } from './contracts.js';
import type { ThemeSdkBridge } from './bridge.js';

export type StyleEngine = 'tailwind' | 'scss' | 'css';

export interface ThemeStyleConfig {
  /** Engine exclusiva: tailwind XOR scss XOR css (padrão css) */
  engine?: StyleEngine;
  /** Entrada relativa ao tema (ex: styles/main.scss, src/input.css). Se omitido, busca por convenção. */
  entry?: string;
  /** Saída relativa ao tema (ex: dist/theme.css). Se omitido, dist/theme.css isolado. */
  output?: string;
  /**
   * Isolamento fino BUSI-040 via [data-theme="nome"]:
   * - `true` — o pipeline de build escopa o CSS ( engines com build: scss/tailwind ).
   * - `'manual'` — o AUTOR entrega o CSS já isolado; válido apenas com engine css
   *   (tema sem build, `dist/theme.css` servido como está). `false` é rejeitado
   *   em validação; `'manual'` fora do css é rejeitado.
   */
  isolation?: true | 'manual';
}

export type ThemeManifest = CanonicalThemeManifest;

export type ThemeRenderEngine = CanonicalThemeRenderEngine;
export type ThemeRenderConfig = CanonicalThemeRenderConfig;

/**
 * Normalized data passed to compiled themes (React/Solid).
 * Shared normalized data contract for React and Solid server entries.
 */
export interface ThemePageData {
  site: {
    title: string;
    description: string;
    theme: Record<string, unknown>;
    url?: string;
    language?: string;
  };
  page: {
    title: string;
    description: string;
    template: string;
    type: string;
    slug: string;
    url: string;
    hubBase: string;
    itemPath: string;
    canonicalPath: string;
    isPageForPosts: boolean;
    isFrontPage: boolean;
    excerpt?: string;
    publishedAt?: string;
    previous?: { title: string; slug: string; url: string } | null;
    next?: { title: string; slug: string; url: string } | null;
  };
  content: { html?: string; [key: string]: unknown };
  fields: Record<string, unknown>;
  record: Record<string, unknown>;
  items: Array<{
    title?: string;
    slug?: string;
    excerpt?: string;
    publishedAt?: string;
    url?: string;
    [key: string]: unknown;
  }>;
  pagination: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
    previousPage?: number;
    nextPage?: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
  menus: ThemeRenderData['menus'];
  contentTypes: ThemeRenderData['contentTypes'];
  taxonomies: ThemeRenderData['taxonomies'];
  terms: ThemeRenderData['terms'];
  settings: Record<string, unknown>;
  themeData: ThemeRenderData;
  /** Route-provided extension values (jsonLd, prevPost/nextPost, ...). */
  [key: string]: unknown;
}

export interface ThemeRenderContext {
  url: string;
  params: Record<string, string>;
  tenant: string;
  templateKey: string;
  buildId: string;
}

export interface ThemeRenderOutput {
  html: string;
  /** Extra trusted markup for <head>. */
  head?: string;
  /** Extra stylesheets, relative to the theme root. */
  styles?: string[];
  /** Module scripts, relative to the theme root (hydration phase). */
  scripts?: string[];
}

/** Contract implemented by the versioned server entry in a compiled theme artifact. */
export interface ThemeServerModule {
  render(
    templateKey: string,
    data: ThemePageData,
    ctx: ThemeRenderContext,
    sdk: ThemeSdkBridge
  ): ThemeRenderOutput | Promise<ThemeRenderOutput>;
  templateKeys: string[];
}
