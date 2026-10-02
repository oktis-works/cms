export type ComponentType = 'layout' | 'component' | 'page' | 'partial';

export type SettingType = 'text' | 'color' | 'image' | 'select' | 'toggle';

export interface ThemeSetting {
  name: string;
  type: SettingType;
  label: string;
  default: string | boolean;
  options?: string[];
}

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
  /** Isolamento fino obrigatório via [data-theme="nome"] — sempre true, false é rejeitado em validação (BUSI-040). */
  isolation?: true;
}

export interface ThemeProvides {
  layouts?: string[];
  components?: string[];
  styles?: string[];
  assets?: string[];
}

export interface ThemeManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  screenshot?: string;
  parent?: string;
  provides?: ThemeProvides;
  /** Configuração de portabilidade de estilos (tailwind OU scss) */
  stylesConfig?: ThemeStyleConfig;
  settings?: ThemeSetting[];
  components?: ThemeComponent[];
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
