// @oktis-works/theme-sdk - framework-neutral theme data contracts

export interface ThemeMenuItem {
  id: string;
  type?: string;
  label: string;
  url?: string;
  objectId?: string;
  objectType?: string;
  contentId?: string;
  parentId?: string | null;
  order?: number;
  target?: '_self' | '_blank';
  attrTitle?: string;
  cssClasses?: string;
  xfn?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ThemeMenu {
  id: string;
  name: string;
  slug: string;
  items: ThemeMenuItem[];
  settings?: Record<string, unknown>;
}

export interface ThemeContentType {
  name: string;
  slug: string;
  singularLabel?: string;
  pluralLabel?: string;
  supports?: string[];
  hasArchive?: boolean;
  singleton?: boolean;
  menuIcon?: string;
  [key: string]: unknown;
}

export interface ThemeTaxonomy {
  id?: string;
  name: string;
  slug: string;
  hierarchical?: boolean;
  attachTo?: string[];
  labels?: Record<string, string>;
  [key: string]: unknown;
}

export interface ThemeTerm {
  id?: string;
  taxonomyId?: string;
  taxonomy_id?: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ThemeContentRecord {
  id?: string;
  type?: string;
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  status?: string;
  body?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type ThemeContentOrderBy = 'created_at' | 'updated_at' | 'published_at' | 'title';
export type ThemeContentOrder = 'asc' | 'desc';

export interface ThemeContentQuery {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  search?: string;
  orderBy?: ThemeContentOrderBy;
  order?: ThemeContentOrder;
}

export interface ThemeContentResult {
  data: ThemeContentRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ThemeDataProvider {
  getMenu(slugOrName: string): Promise<ThemeMenu | null>;
  getMenus(): Promise<ThemeMenu[]>;
  getContent(query?: ThemeContentQuery): Promise<ThemeContentResult>;
  getContentById(id: string): Promise<ThemeContentRecord | null>;
  getContentBySlug(slug: string, type?: string): Promise<ThemeContentRecord | null>;
  getContentType(slug: string): Promise<ThemeContentType | null>;
  getContentTypes(): Promise<ThemeContentType[]>;
  getTaxonomy(slug: string): Promise<ThemeTaxonomy | null>;
  getTaxonomies(): Promise<ThemeTaxonomy[]>;
  getTaxonomyTerms(taxonomy: string): Promise<ThemeTerm[]>;
  getSettings(group?: string): Promise<Record<string, unknown>>;
}

export interface ThemeRenderData {
  menus: { all: ThemeMenu[]; bySlug: Record<string, ThemeMenu>; [slug: string]: unknown };
  contentTypes: ThemeContentType[];
  taxonomies: ThemeTaxonomy[];
  terms: Record<string, ThemeTerm[]>;
  settings: Record<string, unknown>;
  pluginBlocks?: Array<Record<string, unknown>>;
  pluginPatterns?: Array<Record<string, unknown>>;
}

export interface ThemeField {
  name: string;
  label: string;
  type: string;
  value: unknown;
  config?: Record<string, unknown>;
}

export interface FlexibleRow {
  layout: string;
  data: Record<string, unknown>;
}

export interface FieldTypeCatalogEntry {
  type: string;
  category: string;
  isLayout?: boolean;
  supportsConditions?: boolean;
}
