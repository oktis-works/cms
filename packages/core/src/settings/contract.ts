// @oktis-works/core - Canonical settings contract

export type SettingVisibility = 'public' | 'admin' | 'internal' | 'secret';
export type CanonicalSettingType = 'string' | 'boolean' | 'integer' | 'number' | 'json';

export interface SettingDefinition {
  key: string;
  group: string;
  type: CanonicalSettingType;
  defaultValue: unknown;
  visibility: SettingVisibility;
}

const DEFINITIONS: SettingDefinition[] = [
  { key: 'siteTitle', group: 'general', type: 'string', defaultValue: 'My Site', visibility: 'public' },
  { key: 'siteDescription', group: 'general', type: 'string', defaultValue: 'A brand new site built with OkCMS', visibility: 'public' },
  { key: 'siteUrl', group: 'general', type: 'string', defaultValue: '', visibility: 'public' },
  { key: 'language', group: 'general', type: 'string', defaultValue: 'en', visibility: 'public' },
  { key: 'frontPageDisplays', group: 'reading', type: 'string', defaultValue: 'static', visibility: 'internal' },
  { key: 'frontPage', group: 'reading', type: 'string', defaultValue: '', visibility: 'internal' },
  { key: 'postsPage', group: 'reading', type: 'string', defaultValue: '', visibility: 'internal' },
  { key: 'timezone_string', group: 'reading', type: 'string', defaultValue: 'UTC', visibility: 'internal' },
  { key: 'gmt_offset', group: 'reading', type: 'number', defaultValue: 0, visibility: 'internal' },
  { key: 'seo.robotsEnabled', group: 'seo', type: 'boolean', defaultValue: true, visibility: 'public' },
  { key: 'seo.robotsRules', group: 'seo', type: 'string', defaultValue: '', visibility: 'public' },
  { key: 'seo.defaultRobots', group: 'seo', type: 'string', defaultValue: 'index,follow', visibility: 'public' },
  { key: 'seo.sitemapEnabled', group: 'seo', type: 'boolean', defaultValue: true, visibility: 'public' },
  { key: 'seo.sitemapMaxItems', group: 'seo', type: 'integer', defaultValue: 50000, visibility: 'public' },
  { key: 'seo.sitemapIncludeTypes', group: 'seo', type: 'string', defaultValue: '', visibility: 'public' },
  { key: 'seo.defaultChangefreq', group: 'seo', type: 'string', defaultValue: 'weekly', visibility: 'public' },
  { key: 'seo.defaultPriority', group: 'seo', type: 'number', defaultValue: 0.5, visibility: 'public' },
  { key: 'seo.ogType', group: 'seo', type: 'string', defaultValue: 'website', visibility: 'public' },
  { key: 'seo.ogImage', group: 'seo', type: 'string', defaultValue: '', visibility: 'public' },
  { key: 'seo.twitterCard', group: 'seo', type: 'string', defaultValue: 'summary', visibility: 'public' },
];

const BY_KEY = new Map(DEFINITIONS.map((definition) => [definition.key, definition]));

export function getSettingDefinition(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}

export function getSettingDefault(key: string): unknown {
  return getSettingDefinition(key)?.defaultValue;
}

export function resolveSettingVisibility(
  key: string,
  requested?: SettingVisibility | string | null,
): SettingVisibility {
  const definition = getSettingDefinition(key);
  if (definition) return definition.visibility;
  if (requested === 'secret' || requested === 'admin' || requested === 'internal') return requested;
  return 'internal';
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'true') return true;
    if (value.trim().toLowerCase() === 'false') return false;
  }
  throw new Error('Expected a boolean value');
}

function parseNumber(value: unknown, integer: boolean): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Expected a ${integer ? 'integer' : 'number'} value`);
  }
  return parsed;
}

export function normalizeSettingValue(key: string, value: unknown, declaredType?: string): { value: unknown; type: string } {
  const definition = getSettingDefinition(key);
  const type = definition?.type ?? declaredType ?? 'json';
  switch (type) {
    case 'boolean':
      return { value: parseBoolean(value), type };
    case 'integer':
      return { value: parseNumber(value, true), type };
    case 'number':
      return { value: parseNumber(value, false), type };
    case 'string':
      if (typeof value === 'string') return { value, type };
      if (value === null || value === undefined) throw new Error('Expected a string value');
      return { value: String(value), type };
    case 'json':
    default:
      return { value, type };
  }
}

export function normalizeStoredSetting<T extends { key: string; value: unknown; type?: string; visibility?: string | null }>(row: T): T {
  try {
    const normalized = normalizeSettingValue(row.key, row.value, row.type);
    return {
      ...row,
      value: normalized.value,
      type: normalized.type,
      visibility: resolveSettingVisibility(row.key, row.visibility),
    };
  } catch {
    return { ...row, visibility: resolveSettingVisibility(row.key, row.visibility) };
  }
}

export const SETTING_DEFINITIONS = DEFINITIONS;
