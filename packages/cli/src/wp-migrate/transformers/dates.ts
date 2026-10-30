/**
 * Date/Time Normalization for WordPress → OkCMS
 * WP stores dates as 'YYYY-MM-DD HH:MM:SS' in site timezone + GMT variants
 * OkCMS uses TIMESTAMPTZ (UTC)
 */

/**
 * Parse WP date string to Date object (UTC)
 * WP format: 'YYYY-MM-DD HH:MM:SS' (assumed to be in site timezone)
 * We also have post_date_gmt which is already UTC
 */
export function parseWPDate(dateString: string | undefined, isGMT: boolean = false): Date | null {
  if (!dateString || dateString === '0000-00-00 00:00:00') return null;

  // WP format: YYYY-MM-DD HH:MM:SS
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];

  if (!year || !month || !day || !hour || !minute || !second) return null;

  if (isGMT) {
    // Already UTC - construct Date directly
    return new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    ));
  }

  // Local time - we need the site timezone to convert properly
  // For now, assume the string represents local time and parse as local
  // The Date constructor will interpret it as local timezone
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );
}

/**
 * Parse WP date with timezone awareness
 * Uses the site's timezone_string from wp_options
 */
export function parseWPDateWithTimezone(
  dateString: string | undefined,
  timezoneString: string,
  isGMT: boolean = false
): Date | null {
  if (!dateString || dateString === '0000-00-00 00:00:00') return null;

  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];

  if (!year || !month || !day || !hour || !minute || !second) return null;

  if (isGMT) {
    return new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    ));
  }

  // Use Intl.DateTimeFormat to handle timezone conversion
  try {
    const offset = getTimezoneOffset(timezoneString, new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    ));

    const localMs = Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );

    // Adjust by offset to get UTC
    return new Date(localMs - offset * 60 * 1000);
  } catch {
    // Fallback: parse as local
    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );
  }
}

/**
 * Get timezone offset in minutes for a given timezone at a specific date
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = fmt.formatToParts(date);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? '';

    // Parse offset from timezone name (e.g., "GMT-5", "UTC+2")
    const offsetMatch = tzName.match(/GMT([+-]\d+)/) || tzName.match(/UTC([+-]\d+)/);
    if (offsetMatch && offsetMatch[1]) {
      return parseInt(offsetMatch[1], 10) * 60;
    }

    // Fallback: use a known date to calculate offset
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const janOffset = -jan.getTimezoneOffset();
    const julOffset = -jul.getTimezoneOffset();
    return Math.max(janOffset, julOffset); // Standard time offset
  } catch {
    return 0;
  }
}

/**
 * Format Date as ISO 8601 UTC string for OkCMS (TIMESTAMPTZ)
 */
export function formatForOkCMS(date: Date): string {
  return date.toISOString();
}

/**
 * Get current time as ISO string for created_at/updated_at
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * WP date formats for reference
 */
export const WP_DATE_FORMATS = {
  mysql: 'YYYY-MM-DD HH:MM:SS',
  mysqlGmt: 'YYYY-MM-DD HH:MM:SS', // Same format, but UTC
  iso8601: 'YYYY-MM-DDTHH:MM:SSZ',
} as const;

/**
 * Normalize a date that might be in various WP formats
 */
export function normalizeWPDate(
  dateString: string | null | undefined,
  fallback: Date = new Date()
): Date {
  if (!dateString || dateString === '0000-00-00 00:00:00') return fallback;

  // Try parsing as ISO first (in case it's already converted)
  const isoDate = new Date(dateString);
  if (!isNaN(isoDate.getTime()) && dateString.includes('T')) {
    return isoDate;
  }

  // Try WP MySQL format
  const wpDate = parseWPDate(dateString);
  if (wpDate) return wpDate;

  // Fallback
  return fallback;
}

/**
 * Migration config with timezone support
 */
export interface DateMigrationConfig {
  timezoneString: string;
  useGMTDates: boolean; // If true, prefer post_date_gmt over post_date
}

/**
 * Create date migration config from WP options
 */
export function createDateConfig(options: Map<string, string>): DateMigrationConfig {
  const timezoneString = options.get('timezone_string') ?? 'UTC';
  return {
    timezoneString,
    useGMTDates: true, // Safer to use GMT dates when available
  };
}

/**
 * Parse post dates with config
 */
export function parsePostDates(
  post: { post_date: string; post_date_gmt: string; post_modified: string; post_modified_gmt: string },
  config: DateMigrationConfig
): { createdAt: Date; updatedAt: Date; publishedAt: Date | null } {
  const createdAt = config.useGMTDates
    ? parseWPDate(post.post_date_gmt, true) ?? parseWPDate(post.post_date, false) ?? new Date()
    : parseWPDateWithTimezone(post.post_date, config.timezoneString) ?? new Date();

  const updatedAt = config.useGMTDates
    ? parseWPDate(post.post_modified_gmt, true) ?? parseWPDate(post.post_modified, false) ?? createdAt
    : parseWPDateWithTimezone(post.post_modified, config.timezoneString) ?? createdAt;

  // Published date: use post_date if status is publish, else null
  // For now, we'll set published_at based on status in the content mapper
  const publishedAt = parseWPDate(post.post_date_gmt, true) ?? parseWPDate(post.post_date, false) ?? null;

  return { createdAt, updatedAt, publishedAt };
}