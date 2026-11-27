import type { ThemePageData } from '@oktis-works/theme-sdk';

function itemUrl(item: Record<string, unknown>): string {
  return typeof item.url === 'string' && item.url ? item.url : `/${String(item.slug ?? '')}`;
}

function itemDate(item: Record<string, unknown>): string | undefined {
  const value = item.publishedAt ?? item.published_at;
  return typeof value === 'string' || value instanceof Date ? String(value) : undefined;
}

function formatDate(value: string, timezone?: string, language?: string): string {
  return new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeZone: timezone || 'UTC' }).format(new Date(value));
}

export default function Archive({ page, site, items }: ThemePageData) {
  return (
    <main className="site archive">
      <header className="archive-header">
        <div className="container">
          <h1 className="archive-title">{page.title}</h1>
          {page.excerpt && <p className="archive-description">{page.excerpt}</p>}
        </div>
      </header>
      <div className="container">
        <section className="posts">
          <div className="posts-grid">
            {items.map((item) => (
              <article className="post-card" key={String(item.slug)}>
                <div className="post-card__content">
                  <div className="post-card__header">
                    <time className="post-card__date">{itemDate(item) ? formatDate(itemDate(item)!, site.timezone, site.language) : ''}</time>
                  </div>
                  <h2 className="post-card__title">
                    <a href={itemUrl(item)}>{String(item.title ?? '')}</a>
                  </h2>
                  {item.excerpt ? <p className="post-card__excerpt">{String(item.excerpt)}</p> : null}
                  <a href={itemUrl(item)} className="btn btn-outline">Read More</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
