/**
 * Slug Generation & Collision Resolution
 * WP sanitize_title() → OkCMS slug (unique per tenant+type)
 */

// WP sanitize_title behavior (simplified)
// - Convert to lowercase
// - Remove accents/diacritics
// - Replace non-alphanumeric with hyphens
// - Collapse multiple hyphens
// - Trim hyphens from start/end
// - Limit length (WP default: 200 chars)

const ACCENTS_MAP: Record<string, string> = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'æ': 'ae', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ð': 'd', 'ñ': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'þ': 'th',
  'ÿ': 'y', 'ß': 'ss', 'ā': 'a', 'ă': 'a', 'ą': 'a', 'ć': 'c',
  'ĉ': 'c', 'č': 'c', 'đ': 'd', 'ē': 'e', 'ę': 'e', 'ě': 'e',
  'ĝ': 'g', 'ğ': 'g', 'ģ': 'g', 'ĥ': 'h', 'ī': 'i', 'ı': 'i',
  'į': 'i', 'ĳ': 'ij', 'ĵ': 'j', 'ķ': 'k', 'ĺ': 'l', 'ļ': 'l',
  'ľ': 'l', 'ł': 'l', 'ń': 'n', 'ņ': 'n', 'ň': 'n', 'ō': 'o',
  'ő': 'o', 'œ': 'oe', 'ŕ': 'r', 'ŗ': 'r', 'ř': 'r', 'ś': 's',
  'ŝ': 's', 'š': 's', 'ť': 't', 'ţ': 't', 'ŧ': 't', 'ū': 'u',
  'ů': 'u', 'ű': 'u', 'ų': 'u', 'ŵ': 'w', 'ŷ': 'y', 'ź': 'z',
  'ż': 'z', 'ž': 'z',
  // Uppercase
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
  'Æ': 'AE', 'Ç': 'C', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
  'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ð': 'D', 'Ñ': 'N',
  'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
  'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ý': 'Y', 'Þ': 'TH',
  'Ÿ': 'Y', 'Ā': 'A', 'Ă': 'A', 'Ą': 'A', 'Ć': 'C', 'Ĉ': 'C',
  'Č': 'C', 'Đ': 'D', 'Ē': 'E', 'Ę': 'E', 'Ě': 'E', 'Ĝ': 'G',
  'Ğ': 'G', 'Ġ': 'G', 'Ģ': 'G', 'Ĥ': 'H', 'Ī': 'I', 'Į': 'I',
  'İ': 'I', 'Ĳ': 'IJ', 'Ĵ': 'J', 'Ķ': 'K', 'Ĺ': 'L', 'Ļ': 'L',
  'Ľ': 'L', 'Ł': 'L', 'Ń': 'N', 'Ņ': 'N', 'Ň': 'N', 'Ō': 'O',
  'Ő': 'O', 'Œ': 'OE', 'Ŕ': 'R', 'Ŗ': 'R', 'Ř': 'R', 'Ś': 'S',
  'Ŝ': 'S', 'Š': 'S', 'Ť': 'T', 'Ţ': 'T', 'Ŧ': 'T', 'Ū': 'U',
  'Ů': 'U', 'Ű': 'U', 'Ų': 'U', 'Ŵ': 'W', 'Ŷ': 'Y',
  'Ź': 'Z', 'Ż': 'Z', 'Ž': 'Z',
};

const MAX_SLUG_LENGTH = 200;

/**
 * WP-style sanitize_title
 * Converts a string to a URL-friendly slug
 */
export function sanitizeTitle(title: string): string {
  if (!title) return '';

  // Remove HTML tags
  let slug = title.replace(/<[^>]*>/g, '');

  // Replace accents
  slug = slug.split('').map(char => ACCENTS_MAP[char] ?? char).join('');

  // Convert to lowercase
  slug = slug.toLowerCase();

  // Replace non-alphanumeric (except hyphen) with hyphen
  slug = slug.replace(/[^a-z0-9\-]+/g, '-');

  // Collapse multiple hyphens
  slug = slug.replace(/\-+/g, '-');

  // Trim hyphens from start/end
  slug = slug.replace(/^\-+|\-+$/g, '');

  // Limit length
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/\-+$/, '');
  }

  return slug;
}

/**
 * Generate unique slug by appending -2, -3, etc. if collision
 */
export function makeUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
  maxAttempts: number = 100
): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  for (let i = 2; i <= maxAttempts; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!existingSlugs.has(candidate)) {
      return candidate;
    }
  }

  // Fallback: add timestamp
  return `${baseSlug}-${Date.now()}`;
}

/**
 * Slug manager for a tenant+type combination
 * Tracks used slugs and generates unique ones
 */
export class SlugManager {
  private usedSlugs: Map<string, Set<string>> = new Map(); // key: "tenantId:type" -> Set<slug>

  /**
   * Register a slug as used
   */
  register(tenantId: string, type: string, slug: string): void {
    const key = `${tenantId}:${type}`;
    if (!this.usedSlugs.has(key)) {
      this.usedSlugs.set(key, new Set());
    }
    this.usedSlugs.get(key)!.add(slug);
  }

  /**
   * Generate a unique slug for a title
   */
  generate(tenantId: string, type: string, title: string): string {
    const baseSlug = sanitizeTitle(title);
    const key = `${tenantId}:${type}`;
    const existing = this.usedSlugs.get(key) ?? new Set();

    if (!existing.has(baseSlug)) {
      this.register(tenantId, type, baseSlug);
      return baseSlug;
    }

    // Find unique variant
    for (let i = 2; i <= 1000; i++) {
      const candidate = `${baseSlug}-${i}`;
      if (!existing.has(candidate)) {
        this.register(tenantId, type, candidate);
        return candidate;
      }
    }

    // Fallback with timestamp
    const fallback = `${baseSlug}-${Date.now()}`;
    this.register(tenantId, type, fallback);
    return fallback;
  }

  /**
   * Check if slug is available
   */
  isAvailable(tenantId: string, type: string, slug: string): boolean {
    const key = `${tenantId}:${type}`;
    const existing = this.usedSlugs.get(key);
    return !existing?.has(slug);
  }

  /**
   * Pre-populate with existing slugs from database
   */
  preload(tenantId: string, type: string, slugs: string[]): void {
    const key = `${tenantId}:${type}`;
    if (!this.usedSlugs.has(key)) {
      this.usedSlugs.set(key, new Set());
    }
    const set = this.usedSlugs.get(key)!;
    for (const slug of slugs) {
      set.add(slug);
    }
  }

  /**
   * Get all used slugs for a tenant+type
   */
  getUsed(tenantId: string, type: string): string[] {
    const key = `${tenantId}:${type}`;
    return Array.from(this.usedSlugs.get(key) ?? []);
  }
}

/**
 * Global slug manager instance (per migration run)
 */
let globalSlugManager: SlugManager | null = null;

export function getSlugManager(): SlugManager {
  if (!globalSlugManager) {
    globalSlugManager = new SlugManager();
  }
  return globalSlugManager;
}

export function resetSlugManager(): void {
  globalSlugManager = null;
}

/**
 * WP post_name vs OkCMS slug mapping
 * Stores the mapping for redirect generation
 */
export interface SlugMapping {
  wpPostId: number;
  wpPostName: string;
  okcmsSlug: string;
  tenantId: string;
  contentType: string;
}

const slugMappings: SlugMapping[] = [];

export function recordSlugMapping(mapping: SlugMapping): void {
  slugMappings.push(mapping);
}

export function getSlugMappings(): SlugMapping[] {
  return [...slugMappings];
}

export function clearSlugMappings(): void {
  slugMappings.length = 0;
}

/**
 * Generate URL redirects from slug changes
 * WP stores old slugs in _wp_old_slug meta
 */
export function generateRedirectsFromSlugChanges(
  mappings: SlugMapping[],
  oldSlugs: Map<number, string[]> // WP post_id -> old slugs
): { sourcePath: string; targetPath: string }[] {
  const redirects: { sourcePath: string; targetPath: string }[] = [];

  for (const mapping of mappings) {
    const oldSlugList = oldSlugs.get(mapping.wpPostId) ?? [];
    for (const oldSlug of oldSlugList) {
      if (oldSlug !== mapping.wpPostName && oldSlug !== mapping.okcmsSlug) {
        redirects.push({
          sourcePath: `/${oldSlug}`,
          targetPath: `/${mapping.okcmsSlug}`,
        });
      }
    }
  }

  return redirects;
}

/**
 * Validate slug meets OkCMS requirements
 * OkCMS: unique per (tenant_id, type, slug) - enforced by DB index
 */
export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug) return { valid: false, error: 'Slug cannot be empty' };
  if (slug.length > 500) return { valid: false, error: 'Slug exceeds 500 characters' };
  if (!/^[a-z0-9\-]+$/.test(slug)) return { valid: false, error: 'Slug contains invalid characters (only lowercase, numbers, hyphens allowed)' };
  if (slug.startsWith('-') || slug.endsWith('-')) return { valid: false, error: 'Slug cannot start or end with hyphen' };
  if (slug.includes('--')) return { valid: false, error: 'Slug cannot contain consecutive hyphens' };
  return { valid: true };
}

/**
 * Batch generate slugs for multiple titles
 */
export function generateSlugsBatch(
  tenantId: string,
  type: string,
  titles: string[]
): string[] {
  const manager = getSlugManager();
  return titles.map(title => manager.generate(tenantId, type, title));
}