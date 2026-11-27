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

export default function Home({ site, items }: ThemePageData) {
  return (
    <main className="site">
      <header className="site-header">
        <div className="container">
          <h1>{site.title}</h1>
          <p>{site.description}</p>
        </div>
      </header>
      <section className="hero">
        <div className="hero-content">
          <h1>Welcome to {site.title}</h1>
          <p className="hero-subtitle">{site.description || 'A modern CMS built with React and TypeScript.'}</p>
          <a href="/blog" className="btn btn-primary">Read the Blog</a>
        </div>
      </section>
      <section className="about-preview">
        <div className="container">
          <div className="about-content">
            <h2>About This Site</h2>
            <p>This is the default OkCMS theme, rebuilt with React SSR and island hydration.</p>
            <a href="/about" className="btn btn-secondary">Learn More</a>
          </div>
        </div>
      </section>
      <section className="posts">
        <div className="container">
          <header className="section-header">
            <h2>Latest Posts</h2>
          </header>
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
        </div>
      </section>
    </main>
  );
}
