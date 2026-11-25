import type { ThemePageData } from '@oktis-works/theme-sdk';

export default function Index({ page, content }: ThemePageData) {
  return (
    <main className="site page">
      <header className="page-header">
        <div className="container">
          <h1>{page.title}</h1>
          {page.excerpt && <p className="page-excerpt">{page.excerpt}</p>}
        </div>
      </header>
      <div className="page-content">
        <div className="container">
          <div className="entry-content" dangerouslySetInnerHTML={{ __html: String(content.html ?? '') }} />
        </div>
      </div>
    </main>
  );
}