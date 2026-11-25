import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Archive({ page, items }: ThemePageData) {
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
        </section>
      </div>
    </main>
  );
}