import type {
  ThemeManifest as CanonicalThemeManifest,
  ThemeSettingField as CanonicalThemeSettingField,
  ThemeRenderConfig as CanonicalThemeRenderConfig,
  ThemeRenderEngine as CanonicalThemeRenderEngine,
} from '@oktis-works/types';
import type { ThemeRenderData } from './data.js';

export type ComponentType = 'layout' | 'component' | 'page' | 'partial';

export type SettingType = NonNullable<CanonicalThemeSettingField['type']>;
export type ThemeSetting = CanonicalThemeSettingField;

export interface ThemeComponent {
  name: string;
  type: ComponentType;
  file: string;
  props?: Record<string, unknown>;
}

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

export interface ThemeProvides {
  layouts?: string[];
  components?: string[];
  styles?: string[];
  assets?: string[];
}

export type ThemeManifest = CanonicalThemeManifest;

export type ThemeRenderEngine = CanonicalThemeRenderEngine;
export type ThemeRenderConfig = CanonicalThemeRenderConfig;

/**
 * Normalized data passed to compiled themes (React/Solid).
 * Mirrors the context exposed to string templates so both engines share the
 * same public contract.
 */
export interface ThemePageData {
  site: {
    title: string;
    description: string;
    theme: string;
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
  };
  content: Record<string, unknown>;
  fields: Record<string, unknown>;
  record: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
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

/** Contract implemented by `dist/server/entry.js` of compiled themes. */
export interface ThemeServerModule {
  render(
    templateKey: string,
    data: ThemePageData,
    ctx: ThemeRenderContext
  ): ThemeRenderOutput | Promise<ThemeRenderOutput>;
  templates?: string[];
}

export interface RenderContext {
  content: string;
  tenant: string;
  settings: Record<string, unknown>;
  components: Record<string, ThemeComponent>;
  url: string;
  params: Record<string, string>;
  /** Row completa do conteúdo sendo renderizado; alimenta a API contextual (getField sem props). */
  record?: Record<string, unknown>;
}

export interface PageProps {
  title: string;
  content: string;
  meta?: Record<string, string>;
  schema?: Record<string, unknown>;
}
