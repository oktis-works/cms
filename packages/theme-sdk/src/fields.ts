// @oktis-works/theme-sdk - Field Delivery API (FEAT-087/FEAT-100)

import { AsyncLocalStorage } from 'node:async_hooks';

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

export interface ContentLike {
  id?: string;
  type?: string;
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  status?: string;
  authorId?: string | null;
  featuredImageId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  version?: number;
  body?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
}

/** Contrato mínimo do registry de tipos (implementado por @oktis-works/core). */
export interface FieldTypeCatalogEntry {
  type: string;
  category: string;
  isLayout?: boolean;
  supportsConditions?: boolean;
}

export interface ThemeHooksLike {
  applyFilters(filter: string, value: unknown, ...args: unknown[]): unknown;
  applyFiltersAsync(filter: string, value: unknown, ...args: unknown[]): Promise<unknown>;
}

let hooksRef: ThemeHooksLike | null = null;

/**
 * Registra o hook registry usado para os filtros theme:data:*.
 * Chamado pelo bootstrap do app web.
 */
export function setThemeHooks(hooks: ThemeHooksLike): void {
  hooksRef = hooks;
}

function applyDataFilter(method: string, payload: unknown, args: Record<string, unknown> = {}): unknown {
  if (!hooksRef) return payload;
  return hooksRef.applyFilters(`theme:data:${method}`, payload, args);
}

const contentStorage = new AsyncLocalStorage<ContentLike>();

/** Define o conteúdo da request atual; temas passam a usar getField/getFields sem props. */
export function setCurrentContent(content: ContentLike): void {
  contentStorage.enterWith(content);
}

export function getCurrentContent(): ContentLike | null {
  return contentStorage.getStore() ?? null;
}

export function clearCurrentContent(): void {
  contentStorage.enterWith(undefined as unknown as ContentLike);
}

/** Executa fn com o conteúdo fixado no contexto (isolado por request via AsyncLocalStorage). */
export function runWithCurrentContent<T>(content: ContentLike, fn: () => T): T {
  return contentStorage.run(content ?? {}, fn);
}

function resolveContent(content?: ContentLike): ContentLike | null {
  const explicit = content ?? getCurrentContent();
  return explicit && typeof explicit === 'object' ? explicit : null;
}

const STANDARD_KEYS = [
  'id', 'type', 'title', 'slug', 'excerpt', 'status', 'authorId', 'featuredImageId',
  'seoTitle', 'seoDescription', 'publishedAt', 'createdAt', 'updatedAt', 'version',
] as const;

function nativeValue(content: ContentLike, key: string): unknown {
  const snake = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  const camel = (content as Record<string, unknown>)[key];
  return camel !== undefined ? camel : (content as Record<string, unknown>)[snake];
}

/** Campos padrão do conteúdo (colunas nativas), acessíveis igual aos customizados. */
export function getStandardFields(content: ContentLike): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const key of STANDARD_KEYS) {
    const value = nativeValue(content, key);
    if (value !== undefined && value !== null) entries[key] = value;
  }
  return entries;
}

function customFieldsOf(content: ContentLike): Record<string, unknown> {
  return (content.data ?? content.body ?? {}) as Record<string, unknown>;
}

/**
 * Retorna todos os campos de um conteúdo: padrão + customizados (custom sobrescreve),
 * passando pelo filtro theme:data:getFields.
 * Sem argumento, usa o conteúdo da request (setCurrentContent/runWithCurrentContent).
 */
export function getFields(content?: ContentLike): Record<string, unknown> {
  const resolved = resolveContent(content);
  if (!resolved) return {};
  const merged = { ...getStandardFields(resolved), ...customFieldsOf(resolved) };
  return (applyDataFilter('getFields', merged, {}) as Record<string, unknown>) ?? {};
}

/**
 * Retorna o valor de um campo: customizado (body/data) primeiro, senão campo padrão.
 * Aceita getField('title') com contexto ou getField(content, 'title') explícito.
 */
export function getField(nameOrContent: string | ContentLike, maybeName?: string): unknown {
  const isContextual = typeof nameOrContent === 'string';
  const name = isContextual ? nameOrContent : (maybeName as string);
  const content = resolveContent(isContextual ? undefined : (nameOrContent as ContentLike));

  if (!name || !content) return undefined;

  const custom = customFieldsOf(content);
  const value =
    name in custom ? custom[name] : nativeValue(content, name);

  return applyDataFilter('getField', value, { name });
}

/**
 * Retorna as seções de um campo flexible_content com seus dados,
 * passando pelo filtro theme:data:getFlexibleLayouts.
 */
export function getFlexibleLayouts(nameOrContent: string | ContentLike, maybeName?: string): FlexibleRow[] {
  const isContextual = typeof nameOrContent === 'string';
  const name = isContextual ? nameOrContent : (maybeName as string);
  const content = resolveContent(isContextual ? undefined : (nameOrContent as ContentLike));

  if (!name || !content) return [];

  const custom = customFieldsOf(content);
  const value = name in custom ? custom[name] : nativeValue(content, name);

  if (!Array.isArray(value)) return [];

  return value
    .filter((row): row is FlexibleRow => {
      return typeof row === 'object' && row !== null && typeof (row as Partial<FlexibleRow>).layout === 'string';
    })
    .map((row) => ({
      layout: row.layout,
      data: applyDataFilter('getFlexibleLayouts', row.data ?? {}, { name, layout: row.layout }) as Record<string, unknown>,
    }));
}

/**
 * Versão assíncrona de getFields — permite filtros que consultam dados remotos.
 */
export async function getFieldsAsync(content?: ContentLike): Promise<Record<string, unknown>> {
  const resolved = resolveContent(content);
  if (!resolved) return {};
  const merged = { ...getStandardFields(resolved), ...customFieldsOf(resolved) };

  if (!hooksRef) return merged;

  return ((await hooksRef.applyFiltersAsync('theme:data:getFields', merged, {})) as Record<string, unknown>) ?? {};
}

export const FIELD_CATALOG_METHOD = 'theme:data:getFieldTypes';

/**
 * Expõe o catálogo de tipos de campos ao tema via filtro
 * (o catálogo canônico vive no core; temas podem estender via plugin).
 */
export function getFieldTypes(catalog: FieldTypeCatalogEntry[]): FieldTypeCatalogEntry[] {
  return (applyDataFilter('getFieldTypes', catalog, {}) ?? catalog) as FieldTypeCatalogEntry[];
}
