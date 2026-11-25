import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Home({ site, items, settings }: ThemePageData) {
  const theme = (settings.theme ?? {}) as Record<string, unknown>;
  return (
    <main className="site">
      <header className="site-header">
        <div className="container">
          <h1>{String(theme.siteTitle ?? site.title)}</h1>
          <p>{site.description}</p>
        </div>
      </header>
      <section className="hero">
        <div className="hero-content">
          <h1>Welcome to {String(theme.siteTitle ?? site.title)}</h1>
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
                    <time className="post-card__date">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : ''}</time>
                  </div>
                  <h2 className="post-card__title">
                    <a href={`/${String(item.slug)}`}>{String(item.title ?? '')}</a>
                  </h2>
                  {item.excerpt ? <p className="post-card__excerpt">{String(item.excerpt)}</p> : null}
                  <a href={`/${String(item.slug)}`} className="btn btn-outline">Read More</a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}