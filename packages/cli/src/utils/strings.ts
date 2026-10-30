/**
 * String Utilities
 * Common string transformations used across the CLI
 */

// Accent map for slugification
const ACCENTS_MAP: Record<string, string> = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
  'æ': 'ae', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ð': 'd', 'ñ': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'þ': 'th',
  'ÿ': 'y', 'ß': 'ss',
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
  'Æ': 'AE', 'Ç': 'C', 'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
  'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ð': 'D', 'Ñ': 'N',
  'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
  'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ý': 'Y', 'Þ': 'TH',
  'Ÿ': 'Y',
};

const MAX_SLUG_LENGTH = 200;

/**
 * WP-style sanitize_title
 * Converts a string to a URL-friendly slug
 * - Lowercase
 * - Remove accents
 * - Replace non-alphanumeric with hyphens
 * - Collapse multiple hyphens
 * - Trim hyphens from start/end
 */
export function slugify(title: string): string {
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
 * Generate unique slug by appending -2, -3, etc.
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
 * Humanize a string (e.g., 'my_custom_post' → 'My Custom Post')
 */
export function humanize(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Simple pluralization
 */
export function pluralize(word: string): string {
  if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
    return word + 'es';
  }
  return word + 's';
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Generate random string
 */
export function randomString(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Escape string for use in RegExp
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove ANSI color codes
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}