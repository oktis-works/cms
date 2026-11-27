import type { ThemePageData } from '@oktis-works/theme-sdk';

function relatedUrl(item: Record<string, unknown>): string {
  return typeof item.url === 'string' && item.url ? item.url : `/${String(item.slug ?? '')}`;
}

function formatDate(value: string, timezone?: string, language?: string): string {
  return new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeZone: timezone || 'UTC' }).format(new Date(value));
}

export default function Single({ page, site, content }: ThemePageData) {
  return (
    <article className="site single post-single">
      <div className="container">
        <header className="post-header">
          <h1 className="post-title">{page.title}</h1>
          <div className="post-meta">
            <time className="post-date">{page.publishedAt ? formatDate(page.publishedAt, site.timezone, site.language) : ''}</time>
          </div>
        </header>
        <div className="post-body" dangerouslySetInnerHTML={{ __html: String(content.html ?? '') }} />
        <footer className="post-footer">
          <nav className="post-nav" aria-label="Post navigation">
            {page.previous && (
              <a href={relatedUrl(page.previous as unknown as Record<string, unknown>)} className="post-nav__prev">
                <span className="post-nav__label">Previous</span>
                <span className="post-nav__title">{String(page.previous.title)}</span>
              </a>
            )}
            {page.next && (
              <a href={relatedUrl(page.next as unknown as Record<string, unknown>)} className="post-nav__next">
                <span className="post-nav__label">Next</span>
                <span className="post-nav__title">{String(page.next.title)}</span>
              </a>
            )}
          </nav>
        </footer>
      </div>
    </article>
  );
}
