// @oktis-works/validation - Canonical logical content values

export type LogicalValueRecord = Record<string, unknown>;

export interface LogicalValueSources {
  body?: unknown;
  data?: unknown;
  native?: LogicalValueRecord;
  relational?: LogicalValueRecord;
}

export const CANONICAL_CORE_FIELDS = [
  'title',
  'slug',
  'content',
  'excerpt',
  'featured_image',
  'seo_title',
  'seo_description',
  'status',
  'author',
] as const;

export type CanonicalCoreField = (typeof CANONICAL_CORE_FIELDS)[number];

/**
 * Compatibility aliases are accepted only at the storage boundary. Themes,
 * editors, and validators should use the canonical logical names above.
 */
export const CANONICAL_FIELD_ALIASES: Record<CanonicalCoreField, readonly string[]> = {
  title: ['title'],
  slug: ['slug'],
  content: ['content', 'html'],
  excerpt: ['excerpt'],
  featured_image: ['featured_image', 'featuredImageId', 'featured_image_id'],
  seo_title: ['seo_title', 'seoTitle'],
  seo_description: ['seo_description', 'seoDescription'],
  status: ['status'],
  author: ['author', 'authorId', 'author_id'],
};

const LEGACY_FIELD_ALIASES = new Map<string, CanonicalCoreField>(
  Object.entries(CANONICAL_FIELD_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [alias, canonical as CanonicalCoreField] as const)
  )
);

function asRecord(value: unknown): LogicalValueRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as LogicalValueRecord) };
  }
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

function firstDefined(sources: LogicalValueRecord[], aliases: readonly string[]): unknown {
  for (const source of sources) {
    for (const alias of aliases) {
      if (source[alias] !== undefined) return source[alias];
    }
  }
  return undefined;
}

/**
 * Normalizes all legacy storage sources into one logical value document.
 * Precedence is body, data, relational values, then native columns. Body is
 * the only canonical JSON document for new writes; the other sources are
 * read-only compatibility inputs.
 */
export function normalizeLogicalValues(sources: LogicalValueSources): LogicalValueRecord {
  const body = asRecord(sources.body);
  const data = asRecord(sources.data);
  const relational = asRecord(sources.relational);
  const nativeSource = asRecord(sources.native);
  const { body: _legacyBody, data: _legacyData, ...native } = nativeSource;
  const orderedSources = [body, data, relational, native];

  const result: LogicalValueRecord = { ...relational, ...data, ...body };

  for (const field of CANONICAL_CORE_FIELDS) {
    const value = firstDefined(orderedSources, CANONICAL_FIELD_ALIASES[field]);
    if (value !== undefined) result[field] = value;
  }

  if (result['content'] === undefined && result['html'] !== undefined) {
    result['content'] = result['html'];
  }

  for (const [key, value] of Object.entries(result)) {
    const canonical = LEGACY_FIELD_ALIASES.get(key);
    if (canonical && result[canonical] === undefined) result[canonical] = value;
  }

  return result;
}

/** Maps a logical document back to legacy native columns during migration. */
export function logicalValuesToNative(values: LogicalValueRecord): LogicalValueRecord {
  return {
    title: values['title'],
    slug: values['slug'],
    excerpt: values['excerpt'],
    featuredImageId: values['featured_image'],
    seoTitle: values['seo_title'],
    seoDescription: values['seo_description'],
    status: values['status'],
    authorId: values['author'],
  };
}

/** Returns a body document that contains canonical values and all unknown keys. */
export function logicalValuesToBody(values: LogicalValueRecord): LogicalValueRecord {
  const body = { ...values };
  for (const aliases of Object.values(CANONICAL_FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (alias !== aliases[0]) delete body[alias];
    }
  }
  return body;
}

export function canonicalFieldName(name: string): string {
  return LEGACY_FIELD_ALIASES.get(name) ?? name;
}
