// @oktis-works/web - RSS/Atom feed generation
// Generates RSS 2.0 and Atom 1.0 feeds for hub pages

export interface FeedContext {
  /** The hub base (e.g., 'blog', 'projects') */
  hubBase: string;
  /** The hub page title */
  hubTitle: string;
  /** The hub page description */
  hubDescription?: string;
  /** The site name */
  siteName: string;
  /** The site URL */
  siteUrl: string;
  /** Content type for this hub */
  contentType: string;
  /** Array of content items for the feed */
  items: Array<Record<string, unknown>>;
  /** Feed URL (e.g., '/blog/feed') */
  feedUrl: string;
}

/**
 * Escapes XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

/**
 * Builds the full canonical URL for a feed item.
 */
function buildFeedItemUrl(context: FeedContext, item: Record<string, unknown>): string {
  // For now, use simple slug. Parent chain would require additional lookup.
  return new URL(`/${context.hubBase}/${item['slug'] as string}`, context.siteUrl).toString();
}

/**
 * Generates RSS 2.0 feed XML.
 */
export function generateRssFeed(context: FeedContext): string {
  const siteUrl = context.siteUrl.replace(/\/$/, '');
  const feedUrl = new URL(context.feedUrl, siteUrl).toString();

  const itemsXml = context.items
    .map((item) => {
      const itemUrl = buildFeedItemUrl(context, item);
      const title = escapeXml((item['title'] as string) ?? '');
      const description = escapeXml((item['excerpt'] as string) ?? '');
      const pubDate = item['published_at']
        ? new Date(item['published_at'] as string).toUTCString()
        : new Date().toUTCString();
      const guid = itemUrl;

      return `
    <item>
      <title>${title}</title>
      <link>${itemUrl}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${guid}</guid>
    </item>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(context.hubTitle)}</title>
    <link>${new URL(`/${context.hubBase}/`, context.siteUrl).toString()}</link>
    <description>${escapeXml(context.hubDescription ?? context.siteName)}</description>
    <language>pt-BR</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>OkCMS</generator>
${itemsXml}
  </channel>
</rss>`;
}

/**
 * Generates Atom 1.0 feed XML.
 */
export function generateAtomFeed(context: FeedContext): string {
  const siteUrl = context.siteUrl.replace(/\/$/, '');
  const feedUrl = new URL(context.feedUrl, siteUrl).toString();
  const hubUrl = new URL(`/${context.hubBase}/`, siteUrl).toString();

  const entriesXml = context.items
    .map((item) => {
      const itemUrl = buildFeedItemUrl(context, item);
      const _title = escapeXml((item['title'] as string) ?? ''); // used in template
      const _content = escapeXml((item['excerpt'] as string) ?? ''); // reserved for future use
      const updated = item['updated_at']
        ? new Date(item['updated_at'] as string).toISOString()
        : new Date().toISOString();
      const published = item['published_at']
        ? new Date(item['published_at'] as string).toISOString()
        : updated;

      return `
    <entry>
      <title>${escapeXml((item['title'] as string) ?? '')}</title>
      <link href="${itemUrl}" rel="alternate" type="text/html" />
      <id>${itemUrl}</id>
      <updated>${updated}</updated>
      <published>${published}</published>
      <summary type="html">${escapeXml((item['excerpt'] as string) ?? '')}</summary>
      <author>
        <name>${escapeXml((item['author'] as any)?.['name'] ?? 'Unknown')}</name>
      </author>
    </entry>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(context.hubTitle)}</title>
  <subtitle>${escapeXml(context.hubDescription ?? context.siteName)}</subtitle>
  <link href="${hubUrl}" rel="alternate" type="text/html" />
  <link href="${feedUrl}" rel="self" type="application/atom+xml" />
  <id>${hubUrl}</id>
  <updated>${new Date().toISOString()}</updated>
  <generator uri="https://okcms.dev" version="1.0">OkCMS</generator>
${entriesXml}
</feed>`;
}

/**
 * Returns both RSS and Atom feeds for a hub.
 */
export function generateFeeds(context: FeedContext): { rss: string; atom: string } {
  return {
    rss: generateRssFeed(context),
    atom: generateAtomFeed(context),
  };
}