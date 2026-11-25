import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Single({ page, content }: ThemePageData) {
  return (
    <article className="site single post-single">
      <div className="container">
        <header className="post-header">
          <h1 className="post-title">{page.title}</h1>
          <div className="post-meta">
            <time className="post-date">{page.publishedAt ? new Date(page.publishedAt).toLocaleDateString() : ''}</time>
          </div>
        </header>
        <div className="post-body" dangerouslySetInnerHTML={{ __html: String(content.html ?? '') }} />
        <footer className="post-footer">
          <nav className="post-nav" aria-label="Post navigation">
            {page.previous && (
              <a href={`/${String(page.previous.slug)}`} className="post-nav__prev">
                <span className="post-nav__label">Previous</span>
                <span className="post-nav__title">{String(page.previous.title)}</span>
              </a>
            )}
            {page.next && (
              <a href={`/${String(page.next.slug)}`} className="post-nav__next">
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