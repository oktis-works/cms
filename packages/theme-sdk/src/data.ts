// @oktis-works/theme-sdk - Unified theme data API

import { AsyncLocalStorage } from 'node:async_hooks';

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

export interface ThemeContentRecord extends ContentLikeData {
  [key: string]: unknown;
}

export interface ContentLikeData {
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
}

const providerStorage = new AsyncLocalStorage<ThemeDataProvider>();
let fallbackProvider: ThemeDataProvider | null = null;

/** Registra um provider global de fallback. Prefira runWithThemeDataProvider por request. */
export function setThemeDataProvider(provider: ThemeDataProvider | null): void {
  fallbackProvider = provider;
}

export function getThemeDataProvider(): ThemeDataProvider | null {
  return providerStorage.getStore() ?? fallbackProvider;
}

/** Mantém consultas do tema isoladas por request, inclusive em requisições concorrentes. */
export function runWithThemeDataProvider<T>(provider: ThemeDataProvider, fn: () => T): T {
  return providerStorage.run(provider, fn);
}

export async function getMenu(slugOrName: string): Promise<ThemeMenu | null> {
  return getThemeDataProvider()?.getMenu(slugOrName) ?? null;
}

export async function getMenus(): Promise<ThemeMenu[]> {
  return getThemeDataProvider()?.getMenus() ?? [];
}

export async function getContent(query?: ThemeContentQuery): Promise<ThemeContentResult> {
  return getThemeDataProvider()?.getContent(query) ?? { data: [], total: 0, page: query?.page ?? 1, limit: query?.limit ?? 20, pages: 0 };
}

export async function getContentById(id: string): Promise<ThemeContentRecord | null> {
  return getThemeDataProvider()?.getContentById(id) ?? null;
}

export async function getContentBySlug(slug: string, type?: string): Promise<ThemeContentRecord | null> {
  return getThemeDataProvider()?.getContentBySlug(slug, type) ?? null;
}

export async function getContentType(slug: string): Promise<ThemeContentType | null> {
  return getThemeDataProvider()?.getContentType(slug) ?? null;
}

export async function getContentTypes(): Promise<ThemeContentType[]> {
  return getThemeDataProvider()?.getContentTypes() ?? [];
}

export async function getTaxonomy(slug: string): Promise<ThemeTaxonomy | null> {
  return getThemeDataProvider()?.getTaxonomy(slug) ?? null;
}

export async function getTaxonomies(): Promise<ThemeTaxonomy[]> {
  return getThemeDataProvider()?.getTaxonomies() ?? [];
}

export async function getTaxonomyTerms(taxonomy: string): Promise<ThemeTerm[]> {
  return getThemeDataProvider()?.getTaxonomyTerms(taxonomy) ?? [];
}

export async function getSettings(group?: string): Promise<Record<string, unknown>> {
  return getThemeDataProvider()?.getSettings(group) ?? {};
}

export async function getSetting<T = unknown>(key: string, fallback?: T, group?: string): Promise<T | undefined> {
  const settings = await getSettings(group);
  return (settings[key] as T | undefined) ?? fallback;
}
