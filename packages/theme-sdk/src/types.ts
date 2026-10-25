import type {
  ThemeManifest as CanonicalThemeManifest,
  ThemeSettingField as CanonicalThemeSettingField,
} from '@oktis-works/types';

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
